// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {IndexVault} from "../src/IndexVault.sol";
import {IVoxRouter} from "../src/interfaces/IVoxRouter.sol";
import {RobinhoodChain, Tokens} from "../src/lib/Constants.sol";

/// @dev NOTE ON BASKET COMPOSITION
/// MSFT has no Robinhood Token on this chain as of 2026-09-03 — it is not in
/// Voxelithic's published token list. The other six "Magnificent Seven" names
/// (NVDA, AAPL, TSLA, GOOGL, META, AMZN) all are. This deploy script ships an
/// equal-weight six, not seven. Swap in AMD/PLTR/COIN/MU as a seventh if the
/// client wants a round number more than strict Mag7 accuracy — just keep the
/// weightsBps summing to 10_000.
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address keeper = vm.envOr("KEEPER_ADDRESS", deployer);
        uint256 initialCap = vm.envOr("INITIAL_DEPOSIT_CAP", uint256(10_000e6)); // USDG is 6dec

        vm.startBroadcast(deployerKey);

        PriceOracle oracle = new PriceOracle(deployer);
        oracle.setKeeper(keeper, true);

        IndexVault vault =
            new IndexVault(IERC20(Tokens.USDG), IVoxRouter(RobinhoodChain.VOX_ROUTER), oracle, deployer, initialCap);
        vault.setKeeper(keeper, true);

        address[] memory basket = new address[](6);
        basket[0] = Tokens.NVDA;
        basket[1] = Tokens.AAPL;
        basket[2] = Tokens.TSLA;
        basket[3] = Tokens.GOOGL;
        basket[4] = Tokens.META;
        basket[5] = Tokens.AMZN;

        uint16[] memory weights = new uint16[](6);
        weights[0] = 1667;
        weights[1] = 1667;
        weights[2] = 1667;
        weights[3] = 1667;
        weights[4] = 1666;
        weights[5] = 1666;

        vault.setBasket(basket, weights);

        vm.stopBroadcast();

        console2.log("PriceOracle:", address(oracle));
        console2.log("IndexVault:", address(vault));
        console2.log("Vault asset (USDG):", vault.asset());
    }
}
