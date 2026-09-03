// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVoxRouter} from "./interfaces/IVoxRouter.sol";
import {PriceOracle} from "./PriceOracle.sol";

/// @title IndexVault — equal-weight Mag7-style basket on Robinhood Chain
/// @notice ERC-4626 vault denominated in USDG. Deposits sit in USDG until a
///         keeper rebalances into the basket via Voxelithic's router; NAV is
///         priced from PriceOracle, never from a direct on-chain quoter call
///         (VoxQuoter can't be called inside a transaction — see IVoxQuoter.sol).
///
///         v1 scope, deliberately narrow:
///           - single basket, owner-set weights, no auto-detection of new listings
///           - time-based (weekly) rebalance triggered off-chain, not on a timer on-chain
///           - v3-venue router only (VoxRouter), not the v4 singleton router
///           - pause never disables withdrawals, although immediate exits remain limited
///             to the idle USDG buffer reported by maxWithdraw/maxRedeem
contract IndexVault is ERC4626, Ownable, Pausable, ReentrancyGuard {
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

    event BasketSet(address[] tokens, uint16[] weightsBps);
    event KeeperSet(address indexed keeper, bool allowed);
    event DepositCapSet(uint256 cap);
    event Rebalanced(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event InKindRedeemed(
        address indexed caller, address indexed receiver, address indexed owner, uint256 shares, uint256 usdgOut
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

    modifier onlyKeeper() {
        if (!isKeeper[msg.sender] && msg.sender != owner()) revert NotKeeper();
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
        }
        delete basketTokens;

        for (uint256 i = 0; i < tokens.length; i++) {
            basketTokens.push(tokens[i]);
            targetWeightBps[tokens[i]] = weightsBps[i];
        }
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

    /// @notice Blocks deposits and keeper actions only. This contract never
    ///         guards `withdraw`/`redeem` with `whenNotPaused`; their ordinary
    ///         oracle and idle-liquidity requirements still apply.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function basketLength() external view returns (uint256) {
        return basketTokens.length;
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
            if (leg.tokenIn != asset() && targetWeightBps[leg.tokenIn] == 0) {
                revert InvalidRebalanceToken(leg.tokenIn);
            }
            if (leg.tokenOut != asset() && targetWeightBps[leg.tokenOut] == 0) {
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
    }

    /// @notice Sells basket assets back to USDG even when oracle prices are
    ///         stale or missing. Every leg must strictly increase USDG
    ///         liquidity; allocation-changing trades still use rebalance().
    function restoreLiquidity(RebalanceLeg[] calldata legs) external onlyKeeper whenNotPaused {
        for (uint256 i = 0; i < legs.length; i++) {
            RebalanceLeg calldata leg = legs[i];
            if (targetWeightBps[leg.tokenIn] == 0 || leg.tokenOut != asset()) {
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
