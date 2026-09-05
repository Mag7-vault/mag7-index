// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IndexVault} from "../src/IndexVault.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {IVoxRouter} from "../src/interfaces/IVoxRouter.sol";

/// @notice Explicitly non-production token used only where canonical Robinhood
///         tokens and Voxelithic contracts are not published (chain 46630).
contract TestnetDemoToken is ERC20 {
    uint8 private immutable tokenDecimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        tokenDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return tokenDecimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Deterministic testnet-only router. It does not represent or verify
///         Voxelithic liquidity; mainnet fork tests cover canonical contracts.
contract TestnetDemoRouter is IVoxRouter {
    using SafeERC20 for IERC20;
    mapping(address => mapping(address => uint256)) public rate;

    function setRate(address tokenIn, address tokenOut, uint256 rate1e18) external {
        rate[tokenIn][tokenOut] = rate1e18;
    }

    function swapExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        Hop[] calldata
    ) external returns (uint256 outToUser) {
        require(block.timestamp <= deadline, "expired");
        outToUser = amountIn * rate[tokenIn][tokenOut] / 1e18;
        require(outToUser >= minOut, "slippage");
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, outToUser);
    }

    function feeBps() external pure returns (uint16) {
        return 0;
    }
}

contract DeployTestnetDemo is Script {
    function run() external {
        require(block.chainid == 46630 || block.chainid == 31337, "testnet/local only");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        uint256 cap = vm.envOr("TESTNET_DEPOSIT_CAP", uint256(1_000e6));

        vm.startBroadcast(deployerKey);
        TestnetDemoToken usdg = new TestnetDemoToken("Demo USDG", "dUSDG", 6);
        TestnetDemoRouter router = new TestnetDemoRouter();
        PriceOracle oracle = new PriceOracle(deployer);
        IndexVault vault = new IndexVault(IERC20(address(usdg)), IVoxRouter(address(router)), oracle, deployer, cap);

        address[] memory basket = new address[](5);
        string[5] memory symbols = ["dNVDA", "dAAPL", "dGOOGL", "dAMD", "dNFLX"];
        uint16[] memory weights = new uint16[](5);
        uint256[] memory prices = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) {
            TestnetDemoToken token = new TestnetDemoToken(symbols[i], symbols[i], 18);
            basket[i] = address(token);
            weights[i] = 2000;
            prices[i] = 1e6;
            token.mint(address(router), 1_000e18);
            router.setRate(address(usdg), address(token), 1e30);
            router.setRate(address(token), address(usdg), 1e6);
        }
        vault.setBasket(basket, weights);
        oracle.postPrices(basket, prices);

        usdg.mint(deployer, 100e6);
        usdg.approve(address(vault), 10e6);
        vault.deposit(10e6, deployer);

        IndexVault.RebalanceLeg[] memory legs = new IndexVault.RebalanceLeg[](5);
        IVoxRouter.Hop[] memory hops = new IVoxRouter.Hop[](0);
        for (uint256 i = 0; i < 5; i++) {
            uint256 amount = 1_600_000;
            legs[i] = IndexVault.RebalanceLeg({
                tokenIn: address(usdg),
                tokenOut: basket[i],
                amountIn: amount,
                minOut: amount * 1e12,
                deadline: block.timestamp + 1 days,
                hops: hops
            });
        }
        vault.rebalance(legs);
        vm.stopBroadcast();

        console2.log("TESTNET DEMO ONLY - not canonical Voxelithic");
        console2.log("PriceOracle:", address(oracle));
        console2.log("IndexVault:", address(vault));
        console2.log("Demo USDG:", address(usdg));
        console2.log("Vault NAV:", vault.totalAssets());
        console2.log("Idle USDG:", usdg.balanceOf(address(vault)));
    }
}
