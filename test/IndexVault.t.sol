// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IndexVault} from "../src/IndexVault.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {IVoxRouter} from "../src/interfaces/IVoxRouter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockVoxRouter} from "./mocks/MockVoxRouter.sol";

contract IndexVaultTest is Test {
    MockERC20 usdg;
    MockERC20 nvda;
    MockERC20 aapl;
    MockVoxRouter router;
    PriceOracle oracle;
    IndexVault vault;

    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address alice = makeAddr("alice");

    function setUp() public {
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA Robinhood Token", "NVDA", 18);
        aapl = new MockERC20("AAPL Robinhood Token", "AAPL", 18);
        router = new MockVoxRouter();

        vm.startPrank(owner);
        oracle = new PriceOracle(owner);
        oracle.setKeeper(keeper, true);

        vault = new IndexVault(IERC20(address(usdg)), IVoxRouter(address(router)), oracle, owner, 10_000e6);
        vault.setKeeper(keeper, true);

        address[] memory basket = new address[](2);
        basket[0] = address(nvda);
        basket[1] = address(aapl);
        uint16[] memory weights = new uint16[](2);
        weights[0] = 5_000;
        weights[1] = 5_000;
        vault.setBasket(basket, weights);
        vm.stopPrank();

        usdg.mint(alice, 100_000e6);
        vm.prank(alice);
        usdg.approve(address(vault), type(uint256).max);
    }

    function test_depositMintsSharesAtNav() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(1_000e6, alice);
        assertEq(shares, 1_000e6, "first deposit should mint 1:1 (before decimal offset)");
        assertEq(vault.totalAssets(), 1_000e6);
    }

    function test_depositCapEnforced() public {
        vm.prank(alice);
        vm.expectRevert(IndexVault.CapExceeded.selector);
        vault.deposit(10_001e6, alice);
    }

    function test_onlyKeeperCanRebalance() public {
        IndexVault.RebalanceLeg[] memory legs = new IndexVault.RebalanceLeg[](0);
        vm.prank(alice);
        vm.expectRevert(IndexVault.NotKeeper.selector);
        vault.rebalance(legs);
    }

    function test_rebalanceSwapsUsdgIntoBasketToken() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);

        // 1 USDG (6dec) buys 1 NVDA (18dec) worth of tokens for this test —
        // rate is scaled 1e18, tokenIn is 6dec, so this is a test-only rate,
        // not a real price.
        router.setRate(address(usdg), address(nvda), 1e18 * 1e12);
        _postNvdaPrice(1e6);

        IVoxRouter.Hop[] memory hops = new IVoxRouter.Hop[](0);
        IndexVault.RebalanceLeg[] memory legs = new IndexVault.RebalanceLeg[](1);
        legs[0] = IndexVault.RebalanceLeg({
            tokenIn: address(usdg),
            tokenOut: address(nvda),
            amountIn: 500e6,
            minOut: 1,
            deadline: block.timestamp + 1 hours,
            hops: hops
        });

        vm.prank(keeper);
        vault.rebalance(legs);

        assertEq(nvda.balanceOf(address(vault)), 500e18);
        assertEq(usdg.balanceOf(address(vault)), 500e6);
    }

    function test_rebalanceCannotSpendMinimumUsdgBuffer() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);

        router.setRate(address(usdg), address(nvda), 1e18 * 1e12);
        _postNvdaPrice(1e6);

        IVoxRouter.Hop[] memory hops = new IVoxRouter.Hop[](0);
        IndexVault.RebalanceLeg[] memory legs = new IndexVault.RebalanceLeg[](1);
        legs[0] = IndexVault.RebalanceLeg({
            tokenIn: address(usdg),
            tokenOut: address(nvda),
            amountIn: 801e6,
            minOut: 1,
            deadline: block.timestamp + 1 hours,
            hops: hops
        });

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(IndexVault.InsufficientIdleLiquidity.selector, 199e6, 200e6));
        vault.rebalance(legs);

        assertEq(usdg.balanceOf(address(vault)), 1_000e6);
        assertEq(nvda.balanceOf(address(vault)), 0);
    }

    function test_rebalanceRejectsNonBasketToken() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);

        MockERC20 other = new MockERC20("Other", "OTHER", 18);
        router.setRate(address(usdg), address(other), 1e18 * 1e12);

        IVoxRouter.Hop[] memory hops = new IVoxRouter.Hop[](0);
        IndexVault.RebalanceLeg[] memory legs = new IndexVault.RebalanceLeg[](1);
        legs[0] = IndexVault.RebalanceLeg({
            tokenIn: address(usdg),
            tokenOut: address(other),
            amountIn: 1e6,
            minOut: 1,
            deadline: block.timestamp + 1 hours,
            hops: hops
        });

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(IndexVault.InvalidRebalanceToken.selector, address(other)));
        vault.rebalance(legs);
    }

    function test_rebalanceRejectsNonBasketTokenIn() public {
        MockERC20 other = new MockERC20("Other", "OTHER", 18);

        IVoxRouter.Hop[] memory hops = new IVoxRouter.Hop[](0);
        IndexVault.RebalanceLeg[] memory legs = new IndexVault.RebalanceLeg[](1);
        legs[0] = IndexVault.RebalanceLeg({
            tokenIn: address(other),
            tokenOut: address(usdg),
            amountIn: 1e18,
            minOut: 1,
            deadline: block.timestamp + 1 hours,
            hops: hops
        });

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(IndexVault.InvalidRebalanceToken.selector, address(other)));
        vault.rebalance(legs);
    }

    function test_rebalanceBufferUsesHigherPostTradeNav() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);

        router.setRate(address(usdg), address(nvda), 2e18 * 1e12);
        _postNvdaPrice(1e6);

        IVoxRouter.Hop[] memory hops = new IVoxRouter.Hop[](0);
        IndexVault.RebalanceLeg[] memory legs = new IndexVault.RebalanceLeg[](1);
        legs[0] = IndexVault.RebalanceLeg({
            tokenIn: address(usdg),
            tokenOut: address(nvda),
            amountIn: 800e6,
            minOut: 1,
            deadline: block.timestamp + 1 hours,
            hops: hops
        });

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(IndexVault.InsufficientIdleLiquidity.selector, 200e6, 360e6));
        vault.rebalance(legs);
    }

    function test_redeemUsesMaintainedUsdgBufferAfterRebalance() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);

        router.setRate(address(usdg), address(nvda), 1e18 * 1e12);
        _postNvdaPrice(1e6);

        IVoxRouter.Hop[] memory hops = new IVoxRouter.Hop[](0);
        IndexVault.RebalanceLeg[] memory legs = new IndexVault.RebalanceLeg[](1);
        legs[0] = IndexVault.RebalanceLeg({
            tokenIn: address(usdg),
            tokenOut: address(nvda),
            amountIn: 800e6,
            minOut: 1,
            deadline: block.timestamp + 1 hours,
            hops: hops
        });

        vm.prank(keeper);
        vault.rebalance(legs);

        assertEq(vault.maxWithdraw(alice), 200e6);
        assertEq(vault.maxRedeem(alice), 200e6);

        vm.prank(alice);
        uint256 assetsOut = vault.redeem(200e6, alice, alice);
        assertEq(assetsOut, 200e6);
        assertEq(usdg.balanceOf(address(vault)), 0);
        assertEq(vault.maxWithdraw(alice), 0);
        assertEq(vault.maxRedeem(alice), 0);
    }

    function test_totalAssetsPricesBasketTokensFromOracle() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);

        router.setRate(address(usdg), address(nvda), 1e18 * 1e12);
        _postNvdaPrice(1e6);
        IVoxRouter.Hop[] memory hops = new IVoxRouter.Hop[](0);
        IndexVault.RebalanceLeg[] memory legs = new IndexVault.RebalanceLeg[](1);
        legs[0] = IndexVault.RebalanceLeg({
            tokenIn: address(usdg),
            tokenOut: address(nvda),
            amountIn: 500e6,
            minOut: 1,
            deadline: block.timestamp + 1 hours,
            hops: hops
        });
        vm.prank(keeper);
        vault.rebalance(legs);

        // vault now holds 500 USDG + 500e18 NVDA. Post an NVDA price of 1.20 USDG.
        address[] memory toks = new address[](1);
        toks[0] = address(nvda);
        uint256[] memory prices = new uint256[](1);
        prices[0] = 1.2e6; // 1.2 USDG per 1e18 NVDA
        vm.prank(keeper);
        oracle.postPrices(toks, prices);

        // 500 USDG + 500 * 1.2 = 1100 USDG
        assertEq(vault.totalAssets(), 500e6 + 600e6);
    }

    function test_totalAssetsRevertsOnStalePrice() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);

        router.setRate(address(usdg), address(nvda), 1e18 * 1e12);
        _postNvdaPrice(1e6);
        IVoxRouter.Hop[] memory hops = new IVoxRouter.Hop[](0);
        IndexVault.RebalanceLeg[] memory legs = new IndexVault.RebalanceLeg[](1);
        legs[0] = IndexVault.RebalanceLeg({
            tokenIn: address(usdg),
            tokenOut: address(nvda),
            amountIn: 500e6,
            minOut: 1,
            deadline: block.timestamp + 1 hours,
            hops: hops
        });
        vm.prank(keeper);
        vault.rebalance(legs);

        address[] memory toks = new address[](1);
        toks[0] = address(nvda);
        uint256[] memory prices = new uint256[](1);
        prices[0] = 1.2e6;
        vm.prank(keeper);
        oracle.postPrices(toks, prices);

        vm.warp(block.timestamp + 2 hours); // past default 1h staleness window

        vm.expectRevert();
        vault.totalAssets();
    }

    function test_setBasketRejectsDuplicateTokens() public {
        address[] memory basket = new address[](2);
        basket[0] = address(nvda);
        basket[1] = address(nvda);
        uint16[] memory weights = new uint16[](2);
        weights[0] = 5_000;
        weights[1] = 5_000;

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IndexVault.DuplicateBasketToken.selector, address(nvda)));
        vault.setBasket(basket, weights);
    }

    function test_setBasketRejectsInvalidTokensAndZeroWeights() public {
        address[] memory basket = new address[](1);
        uint16[] memory weights = new uint16[](1);
        weights[0] = 10_000;

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IndexVault.InvalidBasketToken.selector, address(0)));
        vault.setBasket(basket, weights);

        basket[0] = address(usdg);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IndexVault.InvalidBasketToken.selector, address(usdg)));
        vault.setBasket(basket, weights);

        basket[0] = address(nvda);
        weights[0] = 0;
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IndexVault.InvalidBasketToken.selector, address(nvda)));
        vault.setBasket(basket, weights);
    }

    function test_setBasketRejectsRemovingHeldToken() public {
        nvda.mint(address(vault), 1e18);

        address[] memory basket = new address[](1);
        basket[0] = address(aapl);
        uint16[] memory weights = new uint16[](1);
        weights[0] = 10_000;

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IndexVault.BasketTokenStillHeld.selector, address(nvda), 1e18));
        vault.setBasket(basket, weights);
    }

    function test_setBasketCanRemoveTokenWithZeroBalance() public {
        address[] memory basket = new address[](1);
        basket[0] = address(aapl);
        uint16[] memory weights = new uint16[](1);
        weights[0] = 10_000;

        vm.prank(owner);
        vault.setBasket(basket, weights);

        assertEq(vault.basketLength(), 1);
        assertEq(vault.basketTokens(0), address(aapl));
        assertEq(vault.targetWeightBps(address(nvda)), 0);
        assertEq(vault.targetWeightBps(address(aapl)), 10_000);
    }

    /// @notice The invariant that matters most to a depositor: pausing the
    ///         vault must never trap funds.
    function test_redeemWorksWhilePaused() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(1_000e6, alice);

        vm.prank(owner);
        vault.pause();

        vm.prank(alice);
        uint256 assetsOut = vault.redeem(shares, alice, alice);
        assertEq(assetsOut, 1_000e6);
    }

    function test_depositRevertsWhilePaused() public {
        vm.prank(owner);
        vault.pause();

        vm.prank(alice);
        vm.expectRevert();
        vault.deposit(1e6, alice);
    }

    function _postNvdaPrice(uint256 priceUsdg) internal {
        address[] memory toks = new address[](1);
        toks[0] = address(nvda);
        uint256[] memory prices = new uint256[](1);
        prices[0] = priceUsdg;
        vm.prank(keeper);
        oracle.postPrices(toks, prices);
    }
}
