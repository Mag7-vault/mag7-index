// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVoxRouter} from "./interfaces/IVoxRouter.sol";
import {PriceOracle} from "./PriceOracle.sol";

/// @title IndexVault — Mag7-style tokenized-equity basket on Robinhood Chain
/// @notice ERC-4626 vault denominated in USDG. Deposits sit in USDG until a
///         keeper rebalances into the basket via Voxelithic's router; NAV is
///         priced from PriceOracle, never from a direct on-chain quoter call
///         (VoxQuoter can't be called inside a transaction — see IVoxQuoter.sol).
///
///         Scope:
///           - single basket; weights are either owner-set (STATIC, the default,
///             identical to v1) or derived from oracle-posted market caps with a
///             single-name cap and redistribution (MARKET_CAP)
///           - rebalances run either through the trusted keeper path or, once the
///             owner enables it, a permissionless path bounded entirely on-chain
///             by the price oracle (see rebalancePublic)
///           - v3-venue router only (VoxRouter), not the v4 singleton router
///           - ownership is two-step (Ownable2Step) so it can be handed to a
///             Safe/timelock safely; a guardian can pause instantly for incidents
///           - pause never disables withdrawals, although immediate exits remain
///             limited to the idle USDG buffer reported by maxWithdraw/maxRedeem
contract IndexVault is ERC4626, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct RebalanceLeg {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minOut;
        uint256 deadline;
        IVoxRouter.Hop[] hops;
    }

    IVoxRouter public immutable router;
    PriceOracle public immutable oracle;

    address[] public basketTokens;
    mapping(address => uint16) public targetWeightBps; // sums to 10_000
    mapping(address => bool) public isKeeper;

    /// @dev Keeps enough immediately redeemable USDG for ordinary exits while
    ///      allowing most assets to remain invested. Larger exits require the
    ///      keeper to sell basket assets back to USDG first.
    uint16 public constant MIN_IDLE_USDG_BPS = 2_000;

    /// @dev Launch-week style cap, same move DOSS makes: small caps while the
    ///      thing earns trust, raised in stages once there's clean history.
    uint256 public depositCap;

    /// @dev Basket membership, independent of a token's (possibly dynamic)
    ///      target weight. In MARKET_CAP mode a name can transiently resolve to
    ///      a very small weight, so membership — not a nonzero weight — is what
    ///      authorizes a token in the rebalance paths.
    mapping(address => bool) public inBasket;

    enum WeightMode {
        STATIC,
        MARKET_CAP
    }

    /// @dev STATIC (default) uses the owner-set `targetWeightBps`, preserving v1
    ///      behavior exactly. MARKET_CAP resolves weights from oracle-posted
    ///      market caps via a cap-and-redistribute pass. Flipping modes is an
    ///      owner (timelock) action; nothing else about accounting changes.
    WeightMode public weightMode;

    /// @dev Single-name ceiling applied in MARKET_CAP mode. Excess above the cap
    ///      is redistributed pro-rata across the uncapped names. Requires
    ///      maxWeightBps * basketLength >= 10_000 to be satisfiable.
    uint16 public maxWeightBps = 3_000;

    /// @dev Guardian can pause instantly (incident response) but holds no other
    ///      power; every config change stays with the owner (the timelock).
    address public guardian;

    // --- Permissionless rebalance policy (owner/timelock-set) ---
    /// @dev Timestamp of the last allocation rebalance (keeper or permissionless).
    uint256 public lastRebalanceAt;
    /// @dev A permissionless rebalance is only "due" once this much time has
    ///      passed since the last one, OR drift crosses driftThresholdBps.
    uint256 public minRebalanceInterval = 6 days;
    /// @dev Max |current - target| basket weight (bps) that makes a rebalance
    ///      due before the interval elapses.
    uint256 public driftThresholdBps = 500;
    /// @dev Oracle-implied minOut floor for permissionless legs: minOut must be
    ///      >= oracleExpectedOut * (10_000 - this) / 10_000.
    uint256 public maxPermissionlessSlippageBps = 100;
    /// @dev Total USDG notional a single permissionless call may move. Zero
    ///      (the default) disables the permissionless path entirely — it is
    ///      opt-in, enabled by the owner/timelock once the policy is set.
    uint256 public maxPermissionlessNotional;

    event BasketSet(address[] tokens, uint16[] weightsBps);
    event KeeperSet(address indexed keeper, bool allowed);
    event DepositCapSet(uint256 cap);
    event Rebalanced(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event InKindRedeemed(
        address indexed caller, address indexed receiver, address indexed owner, uint256 shares, uint256 usdgOut
    );
    event GuardianSet(address indexed guardian);
    event WeightModeSet(WeightMode mode);
    event MaxWeightBpsSet(uint16 bps);
    event RebalancePolicySet(
        uint256 minRebalanceInterval, uint256 driftThresholdBps, uint256 maxSlippageBps, uint256 maxNotional
    );
    event PermissionlessRebalanced(
        address indexed caller, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut
    );

    error NotKeeper();
    error BadWeights();
    error CapExceeded();
    error DuplicateBasketToken(address token);
    error InvalidBasketToken(address token);
    error BasketTokenStillHeld(address token, uint256 balance);
    error InvalidRebalanceToken(address token);
    error InvalidLiquidityRestore(address tokenIn, address tokenOut);
    error InsufficientSwapOutput(uint256 received, uint256 minimum);
    error InsufficientIdleLiquidity(uint256 available, uint256 required);
    error NotGuardian();
    error InfeasibleWeightCap();
    error RebalanceNotDue();
    error WrongDirection(address token);
    error Overshoot(address token);
    error MinOutBelowOracleFloor(address token, uint256 minOut, uint256 floor);
    error NotionalCapExceeded(uint256 traded, uint256 cap);
    error PermissionlessDisabled();

    modifier onlyKeeper() {
        if (!isKeeper[msg.sender] && msg.sender != owner()) revert NotKeeper();
        _;
    }

    modifier onlyGuardianOrOwner() {
        if (msg.sender != guardian && msg.sender != owner()) revert NotGuardian();
        _;
    }

    constructor(IERC20 usdg, IVoxRouter router_, PriceOracle oracle_, address initialOwner, uint256 initialCap)
        ERC20("Mag7 Index", "MAG7")
        ERC4626(usdg)
        Ownable(initialOwner)
    {
        router = router_;
        oracle = oracle_;
        depositCap = initialCap;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setBasket(address[] calldata tokens, uint16[] calldata weightsBps) external onlyOwner {
        require(tokens.length == weightsBps.length, "length mismatch");
        uint256 sum;
        for (uint256 i = 0; i < weightsBps.length; i++) {
            if (tokens[i] == address(0) || tokens[i] == asset() || weightsBps[i] == 0) {
                revert InvalidBasketToken(tokens[i]);
            }
            sum += weightsBps[i];
            for (uint256 j = 0; j < i; j++) {
                if (tokens[i] == tokens[j]) revert DuplicateBasketToken(tokens[i]);
            }
        }
        if (sum != 10_000) revert BadWeights();

        // Refuse to stop accounting for an asset that the vault still owns.
        // The keeper must sell it before governance removes it from the basket.
        for (uint256 i = 0; i < basketTokens.length; i++) {
            address oldToken = basketTokens[i];
            bool retained;
            for (uint256 j = 0; j < tokens.length; j++) {
                if (oldToken == tokens[j]) {
                    retained = true;
                    break;
                }
            }
            if (!retained) {
                uint256 balance = IERC20(oldToken).balanceOf(address(this));
                if (balance != 0) revert BasketTokenStillHeld(oldToken, balance);
            }
            targetWeightBps[oldToken] = 0;
            inBasket[oldToken] = false;
        }
        delete basketTokens;

        for (uint256 i = 0; i < tokens.length; i++) {
            basketTokens.push(tokens[i]);
            targetWeightBps[tokens[i]] = weightsBps[i];
            inBasket[tokens[i]] = true;
        }
        _requireWeightFeasible();
        emit BasketSet(tokens, weightsBps);
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function setDepositCap(uint256 cap) external onlyOwner {
        depositCap = cap;
        emit DepositCapSet(cap);
    }

    /// @notice Guardian may pause instantly (see pause()) but has no other power.
    function setGuardian(address guardian_) external onlyOwner {
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    /// @notice Switch between owner-set STATIC weights and oracle-driven
    ///         MARKET_CAP weights. MARKET_CAP requires a satisfiable single-name
    ///         cap and a clean market-cap feed before it will resolve.
    function setWeightMode(WeightMode mode) external onlyOwner {
        weightMode = mode;
        _requireWeightFeasible();
        emit WeightModeSet(mode);
    }

    /// @notice Single-name weight ceiling used in MARKET_CAP mode.
    function setMaxWeightBps(uint16 bps) external onlyOwner {
        if (bps == 0 || bps > 10_000) revert BadWeights();
        maxWeightBps = bps;
        _requireWeightFeasible();
        emit MaxWeightBpsSet(bps);
    }

    /// @notice Configure the permissionless rebalance path. A zero maxNotional
    ///         keeps the path disabled; set a nonzero value to enable it.
    function setRebalancePolicy(
        uint256 minInterval,
        uint256 driftThresholdBps_,
        uint256 maxSlippageBps,
        uint256 maxNotional
    ) external onlyOwner {
        if (driftThresholdBps_ > 10_000 || maxSlippageBps > 10_000) revert BadWeights();
        minRebalanceInterval = minInterval;
        driftThresholdBps = driftThresholdBps_;
        maxPermissionlessSlippageBps = maxSlippageBps;
        maxPermissionlessNotional = maxNotional;
        emit RebalancePolicySet(minInterval, driftThresholdBps_, maxSlippageBps, maxNotional);
    }

    /// @notice Blocks deposits and keeper actions only. This contract never
    ///         guards `withdraw`/`redeem` with `whenNotPaused`; their ordinary
    ///         oracle and idle-liquidity requirements still apply.
    /// @dev onlyGuardianOrOwner so incident response can pause without waiting
    ///      for a timelocked owner transaction.
    function pause() external onlyGuardianOrOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function basketLength() external view returns (uint256) {
        return basketTokens.length;
    }

    // ---------------------------------------------------------------------
    // Weight resolution (STATIC or MARKET_CAP)
    // ---------------------------------------------------------------------

    /// @notice Resolved target weight (bps) for a basket token under the active
    ///         mode. Returns 0 for non-basket tokens. The keeper reads this so
    ///         it never has to know which weighting mode is active.
    function targetWeight(address token) public view returns (uint16) {
        (uint256 idx, bool found) = _indexOf(token);
        if (!found) return 0;
        return _resolvedWeights()[idx];
    }

    /// @dev Resolved weights for the whole basket, index-aligned with
    ///      `basketTokens`. STATIC returns the stored weights verbatim;
    ///      MARKET_CAP normalizes oracle market caps then caps-and-redistributes.
    function _resolvedWeights() internal view returns (uint16[] memory weights) {
        uint256 n = basketTokens.length;
        weights = new uint16[](n);
        if (n == 0) return weights;

        if (weightMode == WeightMode.STATIC) {
            for (uint256 i = 0; i < n; i++) {
                weights[i] = targetWeightBps[basketTokens[i]];
            }
            return weights;
        }

        // MARKET_CAP: pull staleness-checked caps, then cap-and-redistribute.
        uint256[] memory caps = new uint256[](n);
        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            caps[i] = oracle.getMarketCap(basketTokens[i]);
            total += caps[i];
        }
        if (total == 0) revert BadWeights();

        uint256 cap = maxWeightBps;
        bool[] memory capped = new bool[](n);
        uint256 budget = 10_000; // bps still available to uncapped names
        uint256 uncappedTotal = total; // Σ market caps of uncapped names

        // Each pass fixes at least one name at the cap, so it settles in <= n
        // passes; feasibility (cap * n >= 10_000) guarantees not all names cap.
        for (uint256 pass = 0; pass < n; pass++) {
            bool changed = false;
            for (uint256 i = 0; i < n; i++) {
                if (capped[i]) continue;
                uint256 w = uncappedTotal == 0 ? 0 : Math.mulDiv(caps[i], budget, uncappedTotal);
                if (w > cap) {
                    capped[i] = true;
                    weights[i] = uint16(cap);
                    budget -= cap;
                    uncappedTotal -= caps[i];
                    changed = true;
                }
            }
            if (!changed) break;
        }
        // Final proportional weights for names that stayed under the cap.
        for (uint256 i = 0; i < n; i++) {
            if (capped[i]) continue;
            weights[i] = uint16(uncappedTotal == 0 ? 0 : Math.mulDiv(caps[i], budget, uncappedTotal));
        }
        // Floor rounding leaves the sum <= 10_000; hand the remainder to names
        // that still have room under the cap so the vector sums to exactly 10_000.
        uint256 sum;
        for (uint256 i = 0; i < n; i++) {
            sum += weights[i];
        }
        uint256 deficit = 10_000 - sum;
        for (uint256 i = 0; i < n && deficit > 0; i++) {
            uint256 room = cap - weights[i];
            uint256 add = room < deficit ? room : deficit;
            weights[i] += uint16(add);
            deficit -= add;
        }
    }

    function _indexOf(address token) internal view returns (uint256 idx, bool found) {
        for (uint256 i = 0; i < basketTokens.length; i++) {
            if (basketTokens[i] == token) return (i, true);
        }
        return (0, false);
    }

    /// @dev MARKET_CAP weights can only sum to 10_000 under the single-name cap
    ///      when the cap is large enough to cover the basket. STATIC is exempt
    ///      (its stored weights are validated to sum to 10_000 in setBasket).
    function _requireWeightFeasible() internal view {
        if (weightMode == WeightMode.MARKET_CAP && uint256(maxWeightBps) * basketTokens.length < 10_000) {
            revert InfeasibleWeightCap();
        }
    }

    // ---------------------------------------------------------------------
    // Keeper: rebalance
    // ---------------------------------------------------------------------

    /// @notice Executes one or more swaps against VoxRouter to move the vault
    ///         toward its target weights. Hops are computed off-chain
    ///         (see keeper/rebalance.mjs) against live pool state — this
    ///         function only enforces minOut, it does not compute the route.
    function rebalance(RebalanceLeg[] calldata legs) external onlyKeeper whenNotPaused {
        uint256 assetsBefore = totalAssets();

        for (uint256 i = 0; i < legs.length; i++) {
            RebalanceLeg calldata leg = legs[i];
            if (leg.tokenIn != asset() && !inBasket[leg.tokenIn]) {
                revert InvalidRebalanceToken(leg.tokenIn);
            }
            if (leg.tokenOut != asset() && !inBasket[leg.tokenOut]) {
                revert InvalidRebalanceToken(leg.tokenOut);
            }
            IERC20(leg.tokenIn).forceApprove(address(router), leg.amountIn);
            uint256 out =
                router.swapExactIn(leg.tokenIn, leg.tokenOut, leg.amountIn, leg.minOut, leg.deadline, leg.hops);
            emit Rebalanced(leg.tokenIn, leg.tokenOut, leg.amountIn, out);
        }

        uint256 idleUsdg = IERC20(asset()).balanceOf(address(this));
        uint256 assetsAfter = totalAssets();
        uint256 bufferNav = assetsBefore > assetsAfter ? assetsBefore : assetsAfter;
        uint256 minimumIdleUsdg = Math.mulDiv(bufferNav, MIN_IDLE_USDG_BPS, 10_000, Math.Rounding.Ceil);
        if (idleUsdg < minimumIdleUsdg) revert InsufficientIdleLiquidity(idleUsdg, minimumIdleUsdg);

        lastRebalanceAt = block.timestamp;
    }

    /// @notice Sells basket assets back to USDG even when oracle prices are
    ///         stale or missing. Every leg must strictly increase USDG
    ///         liquidity; allocation-changing trades still use rebalance().
    function restoreLiquidity(RebalanceLeg[] calldata legs) external onlyKeeper whenNotPaused {
        for (uint256 i = 0; i < legs.length; i++) {
            RebalanceLeg calldata leg = legs[i];
            if (!inBasket[leg.tokenIn] || leg.tokenOut != asset()) {
                revert InvalidLiquidityRestore(leg.tokenIn, leg.tokenOut);
            }

            uint256 usdgBefore = IERC20(asset()).balanceOf(address(this));
            IERC20(leg.tokenIn).forceApprove(address(router), leg.amountIn);
            router.swapExactIn(leg.tokenIn, leg.tokenOut, leg.amountIn, leg.minOut, leg.deadline, leg.hops);
            uint256 usdgAfter = IERC20(asset()).balanceOf(address(this));
            uint256 received = usdgAfter - usdgBefore;
            if (received < leg.minOut) revert InsufficientSwapOutput(received, leg.minOut);

            emit Rebalanced(leg.tokenIn, leg.tokenOut, leg.amountIn, received);
        }
    }

    // ---------------------------------------------------------------------
    // Permissionless rebalance (oracle-bounded)
    // ---------------------------------------------------------------------

    /// @notice Anyone may nudge the vault toward its target weights, but only
    ///         within limits the price oracle enforces on-chain, so a caller
    ///         cannot use this to extract value:
    ///           1. must be *due* — interval elapsed OR drift over threshold
    ///           2. each leg must *reduce* drift (buy underweight / sell overweight)
    ///           3. a leg cannot push a name past its target (no overshoot)
    ///           4. minOut must clear an oracle-implied floor (bounds slippage)
    ///           5. total USDG moved is capped by maxPermissionlessNotional
    ///           6. the 20% idle-USDG buffer must still hold afterward
    ///         Disabled until the owner sets a nonzero maxPermissionlessNotional.
    ///         The trusted keeper path (rebalance) stays available and unbounded
    ///         by this policy for legitimate larger moves.
    function rebalancePublic(RebalanceLeg[] calldata legs) external whenNotPaused nonReentrant {
        if (maxPermissionlessNotional == 0) revert PermissionlessDisabled();

        // Establish the oracle anchor: totalAssets() reverts on any stale/missing
        // price for a held token, so navBefore and every leg check below are
        // computed against fresh oracle data.
        uint256 navBefore = totalAssets();
        if (!_isRebalanceDue()) revert RebalanceNotDue();

        uint16[] memory weights = _resolvedWeights();
        // Target *values* mirror the keeper: reserve the idle buffer first, then
        // split the investable remainder by weight.
        uint256 investable = navBefore - Math.mulDiv(navBefore, MIN_IDLE_USDG_BPS, 10_000);

        uint256 tradedNotional;
        for (uint256 i = 0; i < legs.length; i++) {
            RebalanceLeg calldata leg = legs[i];
            tradedNotional += _validatePublicLeg(leg, weights, investable);
            if (tradedNotional > maxPermissionlessNotional) {
                revert NotionalCapExceeded(tradedNotional, maxPermissionlessNotional);
            }
            IERC20(leg.tokenIn).forceApprove(address(router), leg.amountIn);
            uint256 out =
                router.swapExactIn(leg.tokenIn, leg.tokenOut, leg.amountIn, leg.minOut, leg.deadline, leg.hops);
            emit Rebalanced(leg.tokenIn, leg.tokenOut, leg.amountIn, out);
            emit PermissionlessRebalanced(msg.sender, leg.tokenIn, leg.tokenOut, leg.amountIn, out);
        }

        uint256 idleUsdg = IERC20(asset()).balanceOf(address(this));
        uint256 assetsAfter = totalAssets();
        uint256 bufferNav = navBefore > assetsAfter ? navBefore : assetsAfter;
        uint256 minimumIdleUsdg = Math.mulDiv(bufferNav, MIN_IDLE_USDG_BPS, 10_000, Math.Rounding.Ceil);
        if (idleUsdg < minimumIdleUsdg) revert InsufficientIdleLiquidity(idleUsdg, minimumIdleUsdg);

        lastRebalanceAt = block.timestamp;
    }

    /// @dev Validates one permissionless leg against live holdings and the oracle,
    ///      returning the USDG notional it moves. Reads live balanceOf so that a
    ///      prior leg in the same call cannot be overshot by a later one.
    function _validatePublicLeg(RebalanceLeg calldata leg, uint16[] memory weights, uint256 investable)
        internal
        view
        returns (uint256 notional)
    {
        bool buy = leg.tokenIn == asset(); // USDG -> token
        bool sell = leg.tokenOut == asset(); // token -> USDG
        if (buy == sell) revert InvalidRebalanceToken(buy ? leg.tokenIn : leg.tokenOut);

        address token = buy ? leg.tokenOut : leg.tokenIn;
        (uint256 idx, bool found) = _indexOf(token);
        if (!found) revert InvalidRebalanceToken(token);

        uint256 priceUsdg = oracle.getPrice(token); // 6dec per 1e18 units, staleness-checked
        uint256 heldValue = Math.mulDiv(IERC20(token).balanceOf(address(this)), priceUsdg, 1e18);
        uint256 targetValue = Math.mulDiv(investable, weights[idx], 10_000);

        uint256 expectedOut;
        if (buy) {
            if (heldValue >= targetValue) revert WrongDirection(token);
            if (leg.amountIn > targetValue - heldValue) revert Overshoot(token); // amountIn is USDG (6dec)
            expectedOut = Math.mulDiv(leg.amountIn, 1e18, priceUsdg); // token units (18dec)
            notional = leg.amountIn;
        } else {
            if (heldValue <= targetValue) revert WrongDirection(token);
            notional = Math.mulDiv(leg.amountIn, priceUsdg, 1e18); // USDG value of tokens sold
            if (notional > heldValue - targetValue) revert Overshoot(token);
            expectedOut = notional; // USDG out (6dec)
        }

        uint256 floorOut = Math.mulDiv(expectedOut, 10_000 - maxPermissionlessSlippageBps, 10_000);
        if (leg.minOut < floorOut) revert MinOutBelowOracleFloor(token, leg.minOut, floorOut);
    }

    /// @notice True when a permissionless rebalance is allowed right now.
    function isRebalanceDue() external view returns (bool) {
        return _isRebalanceDue();
    }

    /// @notice Largest absolute basket-weight drift (bps) versus target. Reverts
    ///         if a required price/market-cap is stale or missing.
    function maxDriftBps() external view returns (uint256) {
        return _maxDriftBps();
    }

    function _isRebalanceDue() internal view returns (bool) {
        if (block.timestamp - lastRebalanceAt >= minRebalanceInterval) return true;
        return _maxDriftBps() >= driftThresholdBps;
    }

    /// @dev Drift is measured on basket composition (each name's share of
    ///      invested value vs. its target), independent of the idle buffer. If
    ///      nothing is invested yet but a name has a target, drift is maximal.
    function _maxDriftBps() internal view returns (uint256 maxDrift) {
        uint256 n = basketTokens.length;
        if (n == 0) return 0;
        uint16[] memory weights = _resolvedWeights();

        uint256[] memory heldValue = new uint256[](n);
        uint256 investedValue;
        for (uint256 i = 0; i < n; i++) {
            uint256 bal = IERC20(basketTokens[i]).balanceOf(address(this));
            if (bal == 0) continue;
            heldValue[i] = Math.mulDiv(bal, oracle.getPrice(basketTokens[i]), 1e18);
            investedValue += heldValue[i];
        }
        if (investedValue == 0) {
            for (uint256 i = 0; i < n; i++) {
                if (weights[i] > 0) return 10_000;
            }
            return 0;
        }
        for (uint256 i = 0; i < n; i++) {
            uint256 currentBps = Math.mulDiv(heldValue[i], 10_000, investedValue);
            uint256 target = weights[i];
            uint256 d = currentBps > target ? currentBps - target : target - currentBps;
            if (d > maxDrift) maxDrift = d;
        }
    }

    // ---------------------------------------------------------------------
    // ERC4626 overrides
    // ---------------------------------------------------------------------

    /// @dev USDG idle balance + each basket token priced via the keeper oracle.
    ///      Reverts if any held basket token's price is missing or stale
    ///      (PriceOracle.getPrice) rather than silently mis-marking NAV.
    function totalAssets() public view override returns (uint256) {
        uint256 total = IERC20(asset()).balanceOf(address(this));
        for (uint256 i = 0; i < basketTokens.length; i++) {
            address token = basketTokens[i];
            uint256 bal = IERC20(token).balanceOf(address(this));
            if (bal == 0) continue;
            uint256 priceUsdg = oracle.getPrice(token); // USDG (6dec) per 1e18 token units
            total += (bal * priceUsdg) / 1e18;
        }
        return total;
    }

    function maxDeposit(address) public view override returns (uint256) {
        if (paused()) return 0;
        uint256 current = totalAssets();
        if (current >= depositCap) return 0;
        return depositCap - current;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        uint256 maxAssets = maxDeposit(receiver);
        return maxAssets == type(uint256).max ? type(uint256).max : convertToShares(maxAssets);
    }

    /// @dev ERC-4626's default limits reflect NAV, not the liquid USDG that can
    ///      actually be transferred. Publish honest immediate-exit limits.
    function maxWithdraw(address owner_) public view override returns (uint256) {
        uint256 ownerAssets = super.maxWithdraw(owner_);
        uint256 idleUsdg = IERC20(asset()).balanceOf(address(this));
        return ownerAssets < idleUsdg ? ownerAssets : idleUsdg;
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        uint256 ownerShares = super.maxRedeem(owner_);
        uint256 liquidShares = convertToShares(IERC20(asset()).balanceOf(address(this)));
        return ownerShares < liquidShares ? ownerShares : liquidShares;
    }

    /// @notice Returns the pro-rata assets delivered by redeemInKind without
    ///         reading the price oracle. This remains available when prices
    ///         are missing or stale.
    function previewRedeemInKind(uint256 shares) public view returns (uint256 usdgOut, uint256[] memory basketAmounts) {
        uint256 supply = totalSupply();
        basketAmounts = new uint256[](basketTokens.length);
        if (shares == 0 || supply == 0) return (0, basketAmounts);

        usdgOut = Math.mulDiv(IERC20(asset()).balanceOf(address(this)), shares, supply);
        for (uint256 i = 0; i < basketTokens.length; i++) {
            basketAmounts[i] = Math.mulDiv(IERC20(basketTokens[i]).balanceOf(address(this)), shares, supply);
        }
    }

    /// @notice Burns shares for the holder's pro-rata USDG and basket tokens.
    ///         Unlike standard ERC-4626 redemption, this emergency exit does
    ///         not depend on oracle freshness or idle USDG liquidity.
    function redeemInKind(uint256 shares, address receiver, address owner_)
        external
        nonReentrant
        returns (uint256 usdgOut, uint256[] memory basketAmounts)
    {
        if (receiver == address(0)) revert ERC20InvalidReceiver(address(0));

        uint256 ownerShares = balanceOf(owner_);
        if (shares > ownerShares) revert ERC4626ExceededMaxRedeem(owner_, shares, ownerShares);
        if (shares == 0) return previewRedeemInKind(0);

        if (msg.sender != owner_) _spendAllowance(owner_, msg.sender, shares);
        (usdgOut, basketAmounts) = previewRedeemInKind(shares);

        _burn(owner_, shares);

        if (usdgOut != 0) IERC20(asset()).safeTransfer(receiver, usdgOut);
        for (uint256 i = 0; i < basketTokens.length; i++) {
            if (basketAmounts[i] != 0) IERC20(basketTokens[i]).safeTransfer(receiver, basketAmounts[i]);
        }

        emit InKindRedeemed(msg.sender, receiver, owner_, shares, usdgOut);
    }

    /// @dev Share-mutating ERC-4626 paths use the same mutex as in-kind exits,
    ///      preventing a callback token from crossing between exit modes while
    ///      a pro-rata basket transfer is only partially complete.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override nonReentrant {
        super._deposit(caller, receiver, assets, shares);
    }

    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
    {
        super._withdraw(caller, receiver, owner_, assets, shares);
    }

    function deposit(uint256 assets, address receiver) public override whenNotPaused returns (uint256) {
        if (assets > maxDeposit(receiver)) revert CapExceeded();
        return super.deposit(assets, receiver);
    }

    // NOTE: withdraw() and redeem() are intentionally left WITHOUT a
    // whenNotPaused guard. Pausing blocks deposits and rebalances, but does
    // not itself block an exit that is within the available USDG liquidity.
}
