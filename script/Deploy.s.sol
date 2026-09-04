// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {IndexVault} from "../src/IndexVault.sol";
import {IVoxRouter} from "../src/interfaces/IVoxRouter.sol";
import {RobinhoodChain, Tokens} from "../src/lib/Constants.sol";

/// @dev NOTE ON BASKET COMPOSITION
/// Two "Magnificent Seven" names cannot go in a v3-only vault today:
///   - MSFT has no Robinhood Token on this chain (not in Voxelithic's list).
///   - META is listed but only quotes on a Voxelithic v4 pool; IndexVault v1
///     executes v3 routes only, so it cannot be reached (see keeper/voxelithic.mjs).
/// This script therefore ships an equal-weight FIVE (NVDA, AAPL, TSLA, GOOGL,
/// AMZN), each with a live v3 USDG pool. To grow the basket, add a name with a
/// v3 venue — AMD/PLTR/MU/NFLX are all live v3 as of 2026-09-04 (COIN has no
/// USDG pool and TSM is v4-only) — just keep weightsBps summing to 10_000.
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address oracleKeeper = vm.envOr("ORACLE_KEEPER_ADDRESS", deployer);
        address rebalanceKeeper = vm.envOr("REBALANCE_KEEPER_ADDRESS", deployer);
        uint256 initialCap = vm.envOr("INITIAL_DEPOSIT_CAP", uint256(10_000e6)); // USDG is 6dec

        vm.startBroadcast(deployerKey);

        PriceOracle oracle = new PriceOracle(deployer);
        oracle.setKeeper(oracleKeeper, true);

        IndexVault vault =
            new IndexVault(IERC20(Tokens.USDG), IVoxRouter(RobinhoodChain.VOX_ROUTER), oracle, deployer, initialCap);
        vault.setKeeper(rebalanceKeeper, true);

        address[] memory basket = new address[](5);
        basket[0] = Tokens.NVDA;
        basket[1] = Tokens.AAPL;
        basket[2] = Tokens.TSLA;
        basket[3] = Tokens.GOOGL;
        basket[4] = Tokens.AMZN;

        uint16[] memory weights = new uint16[](5);
        weights[0] = 2000;
        weights[1] = 2000;
        weights[2] = 2000;
        weights[3] = 2000;
        weights[4] = 2000;

        vault.setBasket(basket, weights);

        vm.stopBroadcast();

        console2.log("PriceOracle:", address(oracle));
        console2.log("IndexVault:", address(vault));
        console2.log("Vault asset (USDG):", vault.asset());
    }
}
