// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {IndexVault} from "../src/IndexVault.sol";

interface IMockSafe {
    function execute(address target, bytes calldata data) external payable returns (bytes memory);
}

contract ExecuteHandover is Script {
    function run() external {
        require(vm.envOr("ALLOW_UNSAFE_FORK_MOCK_SAFE", false), "fork mock disabled");
        require(block.chainid == 4663, "fork must mirror mainnet chain id");
        address safeAddr = vm.envAddress("SAFE_ADDRESS");
        address timelockAddr = vm.envAddress("TIMELOCK_ADDRESS");
        address oracleAddr = vm.envAddress("PRICE_ORACLE_ADDRESS");
        address vaultAddr = vm.envAddress("INDEX_VAULT_ADDRESS");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        _execute(safeAddr, timelockAddr, oracleAddr);
        _execute(safeAddr, timelockAddr, vaultAddr);
        vm.stopBroadcast();

        require(PriceOracle(oracleAddr).owner() == timelockAddr, "Oracle ownership transfer failed");
        require(IndexVault(vaultAddr).owner() == timelockAddr, "Vault ownership transfer failed");

        console2.log("SUCCESS: Oracle owner is now TimelockController:", timelockAddr);
        console2.log("SUCCESS: Vault owner is now TimelockController:", timelockAddr);
    }

    function _execute(address safe, address timelock, address target) internal {
        bytes memory callData = abi.encodeWithSelector(
            TimelockController.execute.selector,
            target,
            0,
            abi.encodeWithSignature("acceptOwnership()"),
            bytes32(0),
            bytes32(0)
        );
        IMockSafe(safe).execute(timelock, callData);
    }
}
