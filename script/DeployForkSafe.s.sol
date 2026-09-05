// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";

/// @dev Deliberately permissive fork-only stand-in. Never deploy or use as a
/// production Safe.
contract MockSafe {
    address internal immutable singleton;
    address[] internal owners;
    uint256 internal immutable threshold;

    constructor(address singleton_, address[] memory owners_, uint256 threshold_) {
        singleton = singleton_;
        owners = owners_;
        threshold = threshold_;
    }

    function masterCopy() external view returns (address) {
        return singleton;
    }

    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    function getThreshold() external view returns (uint256) {
        return threshold;
    }

    function execute(address target, bytes calldata data) external payable returns (bytes memory) {
        (bool ok, bytes memory res) = target.call(data);
        require(ok, "call failed");
        return res;
    }
}

contract DeployForkSafe is Script {
    function run() external {
        require(vm.envOr("ALLOW_UNSAFE_FORK_MOCK_SAFE", false), "fork mock disabled");
        require(block.chainid == 4663, "fork must mirror mainnet chain id");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        address singleton = address(0xdEaD);
        address[] memory owners = new address[](3);
        owners[0] = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;
        owners[1] = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc;
        owners[2] = 0x976EA74026E726554dB657fA54763abd0C3a0aa9;
        MockSafe safe = new MockSafe(singleton, owners, 2);
        vm.stopBroadcast();
        console2.log("SAFE_ADDRESS:", address(safe));
        console2.log("EXPECTED_SAFE_SINGLETON:", singleton);
        console2.log("EXPECTED_SAFE_CODEHASH:");
        console2.logBytes32(address(safe).codehash);
    }
}
