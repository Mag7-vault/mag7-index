// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IndexVault} from "../src/IndexVault.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {IVoxRouter} from "../src/interfaces/IVoxRouter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockVoxRouter} from "./mocks/MockVoxRouter.sol";

/// @notice Unit tests for the launch-hardening + v2 surface: governance
///         (Ownable2Step handover, guardian pause), MARKET_CAP weighting
///         (cap-and-redistribute), and the oracle-bounded permissionless
///         rebalance. The v1 behaviour is covered by IndexVault.t.sol; this
///         file exercises only the new paths.
contract IndexVaultV2Test is Test {
    MockERC20 usdg;
    MockERC20 nvda;
    MockERC20 aapl;
    MockVoxRouter router;
    PriceOracle oracle;
    IndexVault vault;

    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address guardian = makeAddr("guardian");
    address alice = makeAddr("alice");
    address mallory = makeAddr("mallory");

    // Oracle price: 1 USDG (6dec) per 1e18 token units.
    uint256 constant PRICE = 1e6;
    // Router rate (scaled 1e18): 1 USDG(6dec) buys 1e18 token units, i.e. the
    // oracle-implied rate exactly. out = amountIn * rate / 1e18.
    uint256 constant BUY_RATE = 1e18 * 1e12;

    address[] internal basketAddrs; // tokens for the multi-name MARKET_CAP tests

    function setUp() public {
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        aapl = new MockERC20("AAPL", "AAPL", 18);
        router = new MockVoxRouter();

        vm.startPrank(owner);
        oracle = new PriceOracle(owner);
        oracle.setKeeper(keeper, true);
        vault = new IndexVault(IERC20(address(usdg)), IVoxRouter(address(router)), oracle, owner, 1_000_000e6);
        vault.setKeeper(keeper, true);
        _setBasket2();
        vm.stopPrank();

        usdg.mint(alice, 1_000_000e6);
        vm.prank(alice);
        usdg.approve(address(vault), type(uint256).max);
    }

    // -----------------------------------------------------------------
    // Governance: guardian pause
    // -----------------------------------------------------------------

    function test_ownerSetsGuardianAndGuardianCanPause() public {
        vm.prank(owner);
        vault.setGuardian(guardian);
        assertEq(vault.guardian(), guardian);

        vm.prank(guardian);
        vault.pause();
        assertTrue(vault.paused());
    }

    function test_guardianCannotUnpause() public {
        vm.startPrank(owner);
        vault.setGuardian(guardian);
        vm.stopPrank();

        vm.prank(guardian);
        vault.pause();

        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        vault.unpause();

        vm.prank(owner);
        vault.unpause();
        assertFalse(vault.paused());
    }

    function test_nonGuardianNonOwnerCannotPause() public {
        vm.prank(mallory);
        vm.expectRevert(IndexVault.NotGuardian.selector);
        vault.pause();
    }

    function test_guardianHoldsNoConfigPower() public {
        vm.prank(owner);
        vault.setGuardian(guardian);

        vm.startPrank(guardian);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        vault.setDepositCap(1);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        vault.setRebalancePolicy(0, 500, 100, 1e6);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        vault.setGuardian(mallory);
        vm.stopPrank();
    }

    // -----------------------------------------------------------------
    // Governance: Ownable2Step handover
    // -----------------------------------------------------------------

    function test_vaultOwnable2StepHandover() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        vault.transferOwnership(newOwner);
        assertEq(vault.owner(), owner, "owner unchanged until accepted");
        assertEq(vault.pendingOwner(), newOwner);

        // A mistyped/hostile pending owner cannot be forced; only the pending
        // owner may accept, and until then the deployer keeps control.
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, mallory));
        vault.acceptOwnership();

        // Deployer still owns and can still operate.
        vm.prank(owner);
        vault.setDepositCap(123);
        assertEq(vault.depositCap(), 123);

        vm.prank(newOwner);
        vault.acceptOwnership();
        assertEq(vault.owner(), newOwner);
        assertEq(vault.pendingOwner(), address(0));
    }

    function test_oracleOwnable2StepHandover() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        oracle.transferOwnership(newOwner);
        assertEq(oracle.owner(), owner);
        assertEq(oracle.pendingOwner(), newOwner);

        vm.prank(newOwner);
        oracle.acceptOwnership();
        assertEq(oracle.owner(), newOwner);
    }

    // -----------------------------------------------------------------
    // MARKET_CAP weighting: cap-and-redistribute
    // -----------------------------------------------------------------

    function test_marketCapProportionalWhenUncapped() public {
        // Two names, cap lifted so nothing clamps: weights track the cap ratio.
        vm.startPrank(owner);
        vault.setMaxWeightBps(10_000);
        vault.setWeightMode(IndexVault.WeightMode.MARKET_CAP);
        vm.stopPrank();

        _postCaps2(7_000, 3_000);

        assertEq(vault.targetWeight(address(nvda)), 7_000);
        assertEq(vault.targetWeight(address(aapl)), 3_000);
    }

    function test_marketCapCapsAndRedistributes() public {
        // caps 5000,2000,1000,1000,1000 with a 30% cap ->
        // the 50% name clamps to 3000, its excess flows pro-rata to the rest.
        uint16[] memory w = new uint16[](5);
        w[0] = 2_000;
        w[1] = 2_000;
        w[2] = 2_000;
        w[3] = 2_000;
        w[4] = 2_000;
        _deployBasket(w);

        vm.prank(owner);
        vault.setWeightMode(IndexVault.WeightMode.MARKET_CAP); // 3000 * 5 = 15000 >= 10000

        uint256[] memory caps = new uint256[](5);
        caps[0] = 5_000;
        caps[1] = 2_000;
        caps[2] = 1_000;
        caps[3] = 1_000;
        caps[4] = 1_000;
        _postCaps(caps);

        uint16[5] memory expected = [uint16(3_000), 2_800, 1_400, 1_400, 1_400];
        uint256 sum;
        for (uint256 i = 0; i < 5; i++) {
            uint16 got = vault.targetWeight(basketAddrs[i]);
            assertEq(got, expected[i], "resolved weight");
            assertLe(got, vault.maxWeightBps(), "within cap");
            sum += got;
        }
        assertEq(sum, 10_000, "weights sum to 10000");
    }

    function test_marketCapRedistributesRoundingDust() public {
        // Three equal caps: 10000/3 = 3333 each (floored) leaves 1 bp of dust,
        // handed to the first name with room so the vector still sums to 10000.
        uint16[] memory w = new uint16[](3);
        w[0] = 3_334;
        w[1] = 3_333;
        w[2] = 3_333;
        _deployBasket(w);

        vm.startPrank(owner);
        vault.setMaxWeightBps(4_000); // 4000 * 3 = 12000 >= 10000
        vault.setWeightMode(IndexVault.WeightMode.MARKET_CAP);
        vm.stopPrank();

        uint256[] memory caps = new uint256[](3);
        caps[0] = 1;
        caps[1] = 1;
        caps[2] = 1;
        _postCaps(caps);

        assertEq(vault.targetWeight(basketAddrs[0]), 3_334);
        assertEq(vault.targetWeight(basketAddrs[1]), 3_333);
        assertEq(vault.targetWeight(basketAddrs[2]), 3_333);
    }

    function test_setWeightModeRevertsWhenCapInfeasible() public {
        // Default 2-name basket with the default 30% cap: 3000 * 2 = 6000 < 10000.
        vm.prank(owner);
        vm.expectRevert(IndexVault.InfeasibleWeightCap.selector);
        vault.setWeightMode(IndexVault.WeightMode.MARKET_CAP);
    }

    function test_setMaxWeightBpsRevertsWhenItBreaksFeasibility() public {
        uint16[] memory w = new uint16[](5);
        for (uint256 i = 0; i < 5; i++) {
            w[i] = 2_000;
        }
        _deployBasket(w);

        vm.startPrank(owner);
        vault.setWeightMode(IndexVault.WeightMode.MARKET_CAP);
        vm.expectRevert(IndexVault.InfeasibleWeightCap.selector);
        vault.setMaxWeightBps(1_000); // 1000 * 5 = 5000 < 10000
        vm.stopPrank();
    }

    function test_setBasketRevertsWhenShrinkingBelowFeasibilityInMarketCapMode() public {
        uint16[] memory w = new uint16[](5);
        for (uint256 i = 0; i < 5; i++) {
            w[i] = 2_000;
        }
        _deployBasket(w);

        vm.startPrank(owner);
        vault.setWeightMode(IndexVault.WeightMode.MARKET_CAP);

        // Shrink to 3 names: 3000 * 3 = 9000 < 10000 -> infeasible under the cap.
        address[] memory basket = new address[](3);
        uint16[] memory weights = new uint16[](3);
        basket[0] = basketAddrs[0];
        basket[1] = basketAddrs[1];
        basket[2] = basketAddrs[2];
        weights[0] = 3_334;
        weights[1] = 3_333;
        weights[2] = 3_333;
        vm.expectRevert(IndexVault.InfeasibleWeightCap.selector);
        vault.setBasket(basket, weights);
        vm.stopPrank();
    }

    function test_marketCapModeRevertsOnStaleCap() public {
        uint16[] memory w = new uint16[](5);
        for (uint256 i = 0; i < 5; i++) {
            w[i] = 2_000;
        }
        _deployBasket(w);

        vm.prank(owner);
        vault.setWeightMode(IndexVault.WeightMode.MARKET_CAP);

        uint256 postedAt = block.timestamp;
        uint256[] memory caps = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) {
            caps[i] = 1;
        }
        _postCaps(caps);
        assertEq(vault.targetWeight(basketAddrs[0]), 2_000); // fresh: resolves

        vm.warp(postedAt + 1 days + 1); // past the 1-day market-cap staleness window
        vm.expectRevert(abi.encodeWithSelector(PriceOracle.StaleMarketCap.selector, basketAddrs[0], postedAt));
        vault.targetWeight(basketAddrs[0]);
    }

    // -----------------------------------------------------------------
    // Permissionless rebalance: oracle-bounded
    // -----------------------------------------------------------------

    function test_permissionlessHappyPath() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        _postPrice(address(nvda), PRICE);
        router.setRate(address(usdg), address(nvda), BUY_RATE);
        _enablePolicy(1_000e6);

        // Fresh vault with nothing invested -> drift is maximal -> due.
        assertTrue(vault.isRebalanceDue());

        // investable = 800e6; NVDA target = 400e6; buy the full deficit.
        // expectedOut = 400e18; floor at 1% = 396e18.
        vm.prank(mallory); // anyone, not the keeper or owner
        vault.rebalancePublic(_buyLeg(address(nvda), 400e6, 396e18));

        assertEq(nvda.balanceOf(address(vault)), 400e18);
        assertEq(usdg.balanceOf(address(vault)), 600e6);
        assertEq(vault.lastRebalanceAt(), block.timestamp);
    }

    function test_permissionlessRevertsWhenDisabled() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        _postPrice(address(nvda), PRICE);
        router.setRate(address(usdg), address(nvda), BUY_RATE);

        vm.prank(mallory);
        vm.expectRevert(IndexVault.PermissionlessDisabled.selector);
        vault.rebalancePublic(_buyLeg(address(nvda), 400e6, 396e18));
    }

    function test_permissionlessRevertsOnEmptyLegsWithoutAdvancingTimestamp() public {
        _enablePolicy(1_000e6);
        IndexVault.RebalanceLeg[] memory legs = new IndexVault.RebalanceLeg[](0);

        vm.prank(mallory);
        vm.expectRevert(IndexVault.EmptyRebalance.selector);
        vault.rebalancePublic(legs);

        assertEq(vault.lastRebalanceAt(), 0);
    }

    function test_permissionlessRevertsOnZeroAmountWithoutAdvancingTimestamp() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        _postPrice(address(nvda), PRICE);
        _enablePolicy(1_000e6);

        vm.prank(mallory);
        vm.expectRevert(IndexVault.ZeroRebalanceAmount.selector);
        vault.rebalancePublic(_buyLeg(address(nvda), 0, 0));

        assertEq(vault.lastRebalanceAt(), 0);
    }

    function test_permissionlessRevertsWhenNotDue() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        _postPrice(address(nvda), PRICE);
        _postPrice(address(aapl), PRICE);
        router.setRate(address(usdg), address(nvda), BUY_RATE);
        router.setRate(address(usdg), address(aapl), BUY_RATE);
        _enablePolicy(2_000e6);

        // Keeper brings both names exactly on target -> drift 0, interval fresh.
        IndexVault.RebalanceLeg[] memory legs = new IndexVault.RebalanceLeg[](2);
        legs[0] = _leg(address(usdg), address(nvda), 400e6, 1);
        legs[1] = _leg(address(usdg), address(aapl), 400e6, 1);
        vm.prank(keeper);
        vault.rebalance(legs);

        assertFalse(vault.isRebalanceDue());
        vm.prank(mallory);
        vm.expectRevert(IndexVault.RebalanceNotDue.selector);
        vault.rebalancePublic(_buyLeg(address(nvda), 10e6, 9e18));
    }

    function test_permissionlessRevertsOnWrongDirection() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        _postPrice(address(nvda), PRICE);
        _enablePolicy(1_000e6);

        // Vault holds no NVDA (underweight); a sell is the wrong direction.
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(IndexVault.WrongDirection.selector, address(nvda)));
        vault.rebalancePublic(_sellLeg(address(nvda), 1e18, 1));
    }

    function test_permissionlessRevertsOnOvershoot() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        _postPrice(address(nvda), PRICE);
        router.setRate(address(usdg), address(nvda), BUY_RATE);
        _enablePolicy(10_000e6);

        // NVDA deficit is 400e6; a 500e6 buy would push it past target.
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(IndexVault.Overshoot.selector, address(nvda)));
        vault.rebalancePublic(_buyLeg(address(nvda), 500e6, 1));
    }

    function test_permissionlessRevertsWhenMinOutBelowOracleFloor() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        _postPrice(address(nvda), PRICE);
        router.setRate(address(usdg), address(nvda), BUY_RATE);
        _enablePolicy(1_000e6);

        // floor = 396e18; a caller-supplied 395e18 minOut is below it.
        vm.prank(mallory);
        vm.expectRevert(
            abi.encodeWithSelector(IndexVault.MinOutBelowOracleFloor.selector, address(nvda), 395e18, 396e18)
        );
        vault.rebalancePublic(_buyLeg(address(nvda), 400e6, 395e18));
    }

    function test_permissionlessRevertsWhenNotionalExceeded() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        _postPrice(address(nvda), PRICE);
        router.setRate(address(usdg), address(nvda), BUY_RATE);
        _enablePolicy(100e6); // enabled, but the 400e6 leg blows the cap

        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(IndexVault.NotionalCapExceeded.selector, 400e6, 100e6));
        vault.rebalancePublic(_buyLeg(address(nvda), 400e6, 396e18));
    }

    function test_permissionlessBlockedWhenPaused() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        _postPrice(address(nvda), PRICE);
        router.setRate(address(usdg), address(nvda), BUY_RATE);
        _enablePolicy(1_000e6);

        vm.prank(owner);
        vault.pause();

        vm.prank(mallory);
        vm.expectRevert(); // Pausable.EnforcedPause
        vault.rebalancePublic(_buyLeg(address(nvda), 400e6, 396e18));
    }

    function test_permissionlessNavConservedAtOracleRate() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        _postPrice(address(nvda), PRICE);
        router.setRate(address(usdg), address(nvda), BUY_RATE); // swap exactly at oracle price
        _enablePolicy(1_000e6);

        uint256 navBefore = vault.totalAssets();
        vm.prank(mallory);
        vault.rebalancePublic(_buyLeg(address(nvda), 400e6, 396e18));
        assertEq(vault.totalAssets(), navBefore, "no NAV change when swapping at oracle price");
    }

    function test_routerAllowanceClearedWhenRouterSpendsLessThanApproved() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        _postPrice(address(nvda), PRICE);
        router.setRate(address(usdg), address(nvda), BUY_RATE);
        router.setSpendBps(5_000);

        vm.prank(keeper);
        vault.rebalance(_buyLeg(address(nvda), 400e6, 396e18));

        assertEq(usdg.allowance(address(vault), address(router)), 0);
    }

    function test_permissionlessBoundedLossAtFloor() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        _postPrice(address(nvda), PRICE);
        // Router delivers exactly 1% fewer tokens than oracle-implied (the floor).
        router.setRate(address(usdg), address(nvda), BUY_RATE * 9_900 / 10_000);
        _enablePolicy(1_000e6);

        uint256 navBefore = vault.totalAssets();
        vm.prank(mallory);
        vault.rebalancePublic(_buyLeg(address(nvda), 400e6, 396e18));

        uint256 navAfter = vault.totalAssets();
        // Worst-case loss is bounded by maxSlippage (1%) * notional (400e6) = 4e6.
        uint256 maxLoss = 400e6 * 100 / 10_000;
        assertGe(navAfter + maxLoss, navBefore, "loss within slippage bound");
        assertEq(navBefore - navAfter, 4e6, "loss is exactly the floor at the floor rate");
    }

    function test_maxDriftAndDueViewsOnFreshVault() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        assertEq(vault.maxDriftBps(), 10_000);
        assertTrue(vault.isRebalanceDue());
    }

    function test_notDueOnTargetThenDueAfterInterval() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        _postPrice(address(nvda), PRICE);
        _postPrice(address(aapl), PRICE);
        router.setRate(address(usdg), address(nvda), BUY_RATE);
        router.setRate(address(usdg), address(aapl), BUY_RATE);

        IndexVault.RebalanceLeg[] memory legs = new IndexVault.RebalanceLeg[](2);
        legs[0] = _leg(address(usdg), address(nvda), 400e6, 1);
        legs[1] = _leg(address(usdg), address(aapl), 400e6, 1);
        vm.prank(keeper);
        vault.rebalance(legs);

        assertEq(vault.maxDriftBps(), 0);
        assertFalse(vault.isRebalanceDue());

        // Interval is checked before drift, so it becomes due even though prices
        // are now stale (drift can't be computed but doesn't need to be).
        vm.warp(block.timestamp + 6 days);
        assertTrue(vault.isRebalanceDue());
    }

    // -----------------------------------------------------------------
    // PriceOracle: zero-price fails closed
    // -----------------------------------------------------------------

    function test_postPricesRejectsZeroPrice() public {
        address[] memory toks = new address[](1);
        toks[0] = address(nvda);
        uint256[] memory p = new uint256[](1);
        p[0] = 0;
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(PriceOracle.ZeroPrice.selector, address(nvda)));
        oracle.postPrices(toks, p);
    }

    function test_zeroPriceRevertsWholeBatchLeavingNothingMarked() public {
        // A batch containing a single zero reverts atomically: the good price in
        // the same call is not stored either, so nothing is left mis-marked.
        address[] memory toks = new address[](2);
        toks[0] = address(nvda);
        toks[1] = address(aapl);
        uint256[] memory p = new uint256[](2);
        p[0] = PRICE;
        p[1] = 0;
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(PriceOracle.ZeroPrice.selector, address(aapl)));
        oracle.postPrices(toks, p);

        // nvda price never landed -> getPrice fails closed (NoPrice), not zero.
        vm.expectRevert(abi.encodeWithSelector(PriceOracle.NoPrice.selector, address(nvda)));
        oracle.getPrice(address(nvda));
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    function _setBasket2() internal {
        address[] memory basket = new address[](2);
        basket[0] = address(nvda);
        basket[1] = address(aapl);
        uint16[] memory weights = new uint16[](2);
        weights[0] = 5_000;
        weights[1] = 5_000;
        vault.setBasket(basket, weights);
    }

    function _deployBasket(uint16[] memory weights) internal {
        delete basketAddrs;
        address[] memory basket = new address[](weights.length);
        for (uint256 i = 0; i < weights.length; i++) {
            MockERC20 t = new MockERC20("Basket Token", "BT", 18);
            basketAddrs.push(address(t));
            basket[i] = address(t);
        }
        vm.prank(owner);
        vault.setBasket(basket, weights);
    }

    function _enablePolicy(uint256 maxNotional) internal {
        vm.prank(owner);
        vault.setRebalancePolicy(6 days, 500, 100, maxNotional);
    }

    function _postPrice(address token, uint256 price) internal {
        address[] memory toks = new address[](1);
        toks[0] = token;
        uint256[] memory p = new uint256[](1);
        p[0] = price;
        vm.prank(keeper);
        oracle.postPrices(toks, p);
    }

    function _postCaps2(uint256 capNvda, uint256 capAapl) internal {
        address[] memory toks = new address[](2);
        toks[0] = address(nvda);
        toks[1] = address(aapl);
        uint256[] memory caps = new uint256[](2);
        caps[0] = capNvda;
        caps[1] = capAapl;
        vm.prank(keeper);
        oracle.postMarketCaps(toks, caps);
    }

    function _postCaps(uint256[] memory caps) internal {
        address[] memory toks = new address[](basketAddrs.length);
        for (uint256 i = 0; i < basketAddrs.length; i++) {
            toks[i] = basketAddrs[i];
        }
        vm.prank(keeper);
        oracle.postMarketCaps(toks, caps);
    }

    function _leg(address tin, address tout, uint256 amountIn, uint256 minOut)
        internal
        view
        returns (IndexVault.RebalanceLeg memory)
    {
        return IndexVault.RebalanceLeg({
            tokenIn: tin,
            tokenOut: tout,
            amountIn: amountIn,
            minOut: minOut,
            deadline: block.timestamp + 1 hours,
            hops: new IVoxRouter.Hop[](0)
        });
    }

    function _buyLeg(address token, uint256 amountIn, uint256 minOut)
        internal
        view
        returns (IndexVault.RebalanceLeg[] memory legs)
    {
        legs = new IndexVault.RebalanceLeg[](1);
        legs[0] = _leg(address(usdg), token, amountIn, minOut);
    }

    function _sellLeg(address token, uint256 amountIn, uint256 minOut)
        internal
        view
        returns (IndexVault.RebalanceLeg[] memory legs)
    {
        legs = new IndexVault.RebalanceLeg[](1);
        legs[0] = _leg(token, address(usdg), amountIn, minOut);
    }
}
