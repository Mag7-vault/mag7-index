// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IndexVault} from "../src/IndexVault.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {IVoxRouter} from "../src/interfaces/IVoxRouter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockVoxRouter} from "./mocks/MockVoxRouter.sol";

/// @dev Drives the vault through random sequences of the *non-owner* actions a
///      real user or third party could take: deposits, standard and in-kind
///      redemptions, keeper and permissionless rebalances, plus explicit
///      attempts to mutate governance config from unauthorized accounts. Prices
///      are posted once and time never advances, so oracle reads stay fresh and
///      totalAssets() is always callable — staleness paths are covered by the
///      unit tests instead.
contract InvariantHandler is Test {
    IndexVault public vault;
    PriceOracle public oracle;
    MockVoxRouter public router;
    MockERC20 public usdg;
    MockERC20 public nvda;
    MockERC20 public aapl;
    address public keeper;

    address[] public actors;

    constructor(
        IndexVault _vault,
        PriceOracle _oracle,
        MockVoxRouter _router,
        MockERC20 _usdg,
        MockERC20 _nvda,
        MockERC20 _aapl,
        address _keeper
    ) {
        vault = _vault;
        oracle = _oracle;
        router = _router;
        usdg = _usdg;
        nvda = _nvda;
        aapl = _aapl;
        keeper = _keeper;

        actors.push(makeAddr("h_alice"));
        actors.push(makeAddr("h_bob"));
        actors.push(makeAddr("h_carol"));
        for (uint256 i = 0; i < actors.length; i++) {
            usdg.mint(actors[i], 10_000_000e6);
            vm.prank(actors[i]);
            usdg.approve(address(vault), type(uint256).max);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function deposit(uint256 seed, uint256 amount) public {
        address a = _actor(seed);
        uint256 max = vault.maxDeposit(a);
        uint256 bal = usdg.balanceOf(a);
        if (max > bal) max = bal;
        if (max == 0) return;
        amount = bound(amount, 1, max);
        vm.prank(a);
        try vault.deposit(amount, a) {} catch {}
    }

    function redeemStandard(uint256 seed, uint256 shares) public {
        address a = _actor(seed);
        uint256 max = vault.maxRedeem(a);
        if (max == 0) return;
        shares = bound(shares, 1, max);
        vm.prank(a);
        try vault.redeem(shares, a, a) {} catch {}
    }

    function redeemKind(uint256 seed, uint256 shares) public {
        address a = _actor(seed);
        uint256 max = vault.balanceOf(a);
        if (max == 0) return;
        shares = bound(shares, 1, max);
        vm.prank(a);
        try vault.redeemInKind(shares, a, a) {} catch {}
    }

    function keeperBuy(uint256 amount) public {
        (address token, uint256 deficit) = _mostUnderweight();
        uint256 spendable = _spendableIdle();
        if (token == address(0) || deficit == 0 || spendable == 0) return;
        uint256 amt = bound(amount, 1, _min(deficit, spendable));
        vm.prank(keeper);
        try vault.rebalance(_leg(address(usdg), token, amt, 1)) {} catch {}
    }

    function publicBuy(uint256 seed, uint256 amount) public {
        uint256 cap = vault.maxPermissionlessNotional();
        if (cap == 0) return;
        (address token, uint256 deficit) = _mostUnderweight();
        uint256 spendable = _spendableIdle();
        if (token == address(0) || deficit == 0 || spendable == 0) return;
        uint256 amt = bound(amount, 1, _min(_min(deficit, spendable), cap));
        uint256 price = oracle.getPrice(token);
        uint256 expectedOut = amt * 1e18 / price;
        uint256 floorOut = expectedOut * (10_000 - vault.maxPermissionlessSlippageBps()) / 10_000;
        vm.prank(_actor(seed));
        try vault.rebalancePublic(_leg(address(usdg), token, amt, floorOut)) {} catch {}
    }

    /// @dev Every one of these must revert: no non-owner may touch config.
    function attackerConfig(uint256 seed) public {
        address a = _actor(seed);
        vm.startPrank(a);
        try vault.setDepositCap(seed) {} catch {}
        try vault.setMaxWeightBps(uint16(1 + (seed % 9_999))) {} catch {}
        try vault.setWeightMode(IndexVault.WeightMode.MARKET_CAP) {} catch {}
        try vault.setRebalancePolicy(seed, 100, 100, seed) {} catch {}
        try vault.setGuardian(a) {} catch {}
        try vault.setKeeper(a, true) {} catch {}
        try vault.pause() {} catch {}
        vm.stopPrank();
    }

    // --- helpers ---

    function _nav() internal view returns (uint256) {
        return vault.totalAssets();
    }

    function _spendableIdle() internal view returns (uint256) {
        uint256 nav = _nav();
        uint256 minIdle = nav * 2_000 / 10_000;
        uint256 idle = usdg.balanceOf(address(vault));
        return idle > minIdle ? idle - minIdle : 0;
    }

    function _mostUnderweight() internal view returns (address token, uint256 deficitUsdg) {
        uint256 nav = _nav();
        if (nav == 0) return (address(0), 0);
        uint256 investable = nav - (nav * 2_000 / 10_000);
        uint256 n = vault.basketLength();
        for (uint256 i = 0; i < n; i++) {
            address t = vault.basketTokens(i);
            uint256 targetValue = investable * vault.targetWeight(t) / 10_000;
            uint256 held = MockERC20(t).balanceOf(address(vault)) * oracle.getPrice(t) / 1e18;
            if (targetValue > held) {
                uint256 gap = targetValue - held;
                if (gap > deficitUsdg) {
                    deficitUsdg = gap;
                    token = t;
                }
            }
        }
    }

    function _leg(address tin, address tout, uint256 amountIn, uint256 minOut)
        internal
        view
        returns (IndexVault.RebalanceLeg[] memory legs)
    {
        legs = new IndexVault.RebalanceLeg[](1);
        legs[0] = IndexVault.RebalanceLeg({
            tokenIn: tin,
            tokenOut: tout,
            amountIn: amountIn,
            minOut: minOut,
            deadline: block.timestamp + 1 hours,
            hops: new IVoxRouter.Hop[](0)
        });
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

contract IndexVaultInvariantTest is Test {
    MockERC20 usdg;
    MockERC20 nvda;
    MockERC20 aapl;
    MockVoxRouter router;
    PriceOracle oracle;
    IndexVault vault;
    InvariantHandler handler;

    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address guardian = makeAddr("guardian");

    uint256 constant BUY_RATE = 1e18 * 1e12;

    // Recorded config baseline (owner never acts during the run).
    uint256 initCap;
    uint16 initMaxWeight;
    IndexVault.WeightMode initMode;
    address initGuardian;
    uint256 initNotional;
    uint256 initBasketLen;
    uint16 initWeightNvda;
    uint16 initWeightAapl;

    function setUp() public {
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        aapl = new MockERC20("AAPL", "AAPL", 18);
        router = new MockVoxRouter();

        vm.startPrank(owner);
        oracle = new PriceOracle(owner);
        oracle.setKeeper(keeper, true);
        vault = new IndexVault(IERC20(address(usdg)), IVoxRouter(address(router)), oracle, owner, 1_000_000_000e6);
        vault.setKeeper(keeper, true);
        vault.setGuardian(guardian);
        vault.setRebalancePolicy(6 days, 500, 100, 100_000e6); // enable the permissionless path

        address[] memory basket = new address[](2);
        basket[0] = address(nvda);
        basket[1] = address(aapl);
        uint16[] memory weights = new uint16[](2);
        weights[0] = 5_000;
        weights[1] = 5_000;
        vault.setBasket(basket, weights);
        vm.stopPrank();

        // Fresh, constant prices and oracle-aligned router rates.
        address[] memory toks = new address[](2);
        toks[0] = address(nvda);
        toks[1] = address(aapl);
        uint256[] memory prices = new uint256[](2);
        prices[0] = 1e6;
        prices[1] = 1e6;
        vm.prank(keeper);
        oracle.postPrices(toks, prices);
        router.setRate(address(usdg), address(nvda), BUY_RATE);
        router.setRate(address(usdg), address(aapl), BUY_RATE);

        handler = new InvariantHandler(vault, oracle, router, usdg, nvda, aapl, keeper);

        initCap = vault.depositCap();
        initMaxWeight = vault.maxWeightBps();
        initMode = vault.weightMode();
        initGuardian = vault.guardian();
        initNotional = vault.maxPermissionlessNotional();
        initBasketLen = vault.basketLength();
        initWeightNvda = vault.targetWeightBps(address(nvda));
        initWeightAapl = vault.targetWeightBps(address(aapl));

        targetContract(address(handler));
    }

    /// @notice I6: no non-owner action can mutate governance config.
    function invariant_configImmutableWithoutOwner() public view {
        assertEq(vault.depositCap(), initCap, "depositCap");
        assertEq(vault.maxWeightBps(), initMaxWeight, "maxWeightBps");
        assertEq(uint256(vault.weightMode()), uint256(initMode), "weightMode");
        assertEq(vault.guardian(), initGuardian, "guardian");
        assertEq(vault.maxPermissionlessNotional(), initNotional, "maxPermissionlessNotional");
        assertEq(vault.basketLength(), initBasketLen, "basketLength");
        assertEq(vault.targetWeightBps(address(nvda)), initWeightNvda, "nvda weight");
        assertEq(vault.targetWeightBps(address(aapl)), initWeightAapl, "aapl weight");
    }

    /// @notice Aggregate solvency: shares never claim more assets than the vault
    ///         holds. Catches any share inflation or mis-accounted rebalance.
    function invariant_sharesNeverExceedAssets() public view {
        uint256 supply = vault.totalSupply();
        if (supply == 0) return;
        assertLe(vault.convertToAssets(supply), vault.totalAssets());
    }

    /// @notice Shares exist only in the hands of the actors that minted them.
    function invariant_sharesHeldByActorsOnly() public view {
        uint256 sum;
        uint256 n = handler.actorCount();
        for (uint256 i = 0; i < n; i++) {
            sum += vault.balanceOf(handler.actors(i));
        }
        assertEq(sum, vault.totalSupply());
    }

    /// @notice I4: in-kind redemption is exactly pro-rata at the aggregate,
    ///         independent of oracle state.
    function invariant_inKindPreviewMatchesBalances() public view {
        uint256 supply = vault.totalSupply();
        if (supply == 0) return;
        (uint256 usdgOut, uint256[] memory amts) = vault.previewRedeemInKind(supply);
        assertEq(usdgOut, usdg.balanceOf(address(vault)), "usdg pro-rata");
        assertEq(amts[0], nvda.balanceOf(address(vault)), "nvda pro-rata");
        assertEq(amts[1], aapl.balanceOf(address(vault)), "aapl pro-rata");
    }
}
