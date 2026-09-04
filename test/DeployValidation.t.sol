// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";

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
}

contract NotASafe {}

contract DeployValidationTest is Test {
    uint256 internal constant MAINNET = 4663;
    address internal deployer = makeAddr("deployer");
    address internal oracleKeeper = makeAddr("oracleKeeper");
    address internal rebalanceKeeper = makeAddr("rebalanceKeeper");
    address internal safeSingleton = makeAddr("safeSingleton");

    Deploy internal script;
    MockSafe internal safe;

    function setUp() public {
        script = new Deploy();
        address[] memory owners = new address[](3);
        owners[0] = makeAddr("safeOwner1");
        owners[1] = makeAddr("safeOwner2");
        owners[2] = makeAddr("safeOwner3");
        safe = new MockSafe(safeSingleton, owners, 2);
    }

    function test_validSeparatedMainnetConfigurationPasses() public view {
        _validate(
            MAINNET, address(safe), safeSingleton, address(safe).codehash, oracleKeeper, rebalanceKeeper, 0, 48 hours
        );
    }

    function test_nonMainnetKeepsConvenientLocalDefaults() public view {
        _validate(31337, address(0), address(0), bytes32(0), deployer, deployer, 10_000e6, 0);
    }

    function test_mainnetRejectsMissingOrEoaSafe() public {
        vm.expectRevert(Deploy.MainnetSafeRequired.selector);
        _validate(MAINNET, address(0), safeSingleton, bytes32(uint256(1)), oracleKeeper, rebalanceKeeper, 0, 48 hours);

        address eoaSafe = makeAddr("eoaSafe");
        vm.expectRevert(abi.encodeWithSelector(Deploy.MainnetSafeMustBeContract.selector, eoaSafe));
        _validate(MAINNET, eoaSafe, safeSingleton, bytes32(uint256(1)), oracleKeeper, rebalanceKeeper, 0, 48 hours);
    }

    function test_mainnetRejectsWrongCodehashSingletonAndMalformedSafe() public {
        vm.expectRevert();
        _validate(
            MAINNET, address(safe), safeSingleton, bytes32(uint256(1)), oracleKeeper, rebalanceKeeper, 0, 48 hours
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.MainnetSafeSingletonMismatch.selector, safeSingleton, makeAddr("wrongSingleton")
            )
        );
        _validate(
            MAINNET,
            address(safe),
            makeAddr("wrongSingleton"),
            address(safe).codehash,
            oracleKeeper,
            rebalanceKeeper,
            0,
            48 hours
        );

        NotASafe malformed = new NotASafe();
        vm.expectRevert(Deploy.MainnetSafeConfigurationInvalid.selector);
        _validate(
            MAINNET,
            address(malformed),
            safeSingleton,
            address(malformed).codehash,
            oracleKeeper,
            rebalanceKeeper,
            0,
            48 hours
        );
    }

    function test_mainnetRejectsShortTimelockAndOpenCap() public {
        vm.expectRevert(abi.encodeWithSelector(Deploy.MainnetTimelockTooShort.selector, 47 hours, 48 hours));
        _validate(
            MAINNET, address(safe), safeSingleton, address(safe).codehash, oracleKeeper, rebalanceKeeper, 0, 47 hours
        );

        vm.expectRevert(abi.encodeWithSelector(Deploy.MainnetCapMustStartZero.selector, 10_000e6));
        _validate(
            MAINNET,
            address(safe),
            safeSingleton,
            address(safe).codehash,
            oracleKeeper,
            rebalanceKeeper,
            10_000e6,
            48 hours
        );
    }

    function test_mainnetRejectsMissingOrCollidingKeeperRoles() public {
        vm.expectRevert(Deploy.MainnetKeeperRequired.selector);
        _validate(
            MAINNET, address(safe), safeSingleton, address(safe).codehash, address(0), rebalanceKeeper, 0, 48 hours
        );

        vm.expectRevert(Deploy.MainnetKeeperRequired.selector);
        _validate(MAINNET, address(safe), safeSingleton, address(safe).codehash, oracleKeeper, address(0), 0, 48 hours);

        vm.expectRevert(abi.encodeWithSelector(Deploy.MainnetRoleCollision.selector, deployer));
        _validate(MAINNET, address(safe), safeSingleton, address(safe).codehash, deployer, rebalanceKeeper, 0, 48 hours);

        vm.expectRevert(abi.encodeWithSelector(Deploy.MainnetRoleCollision.selector, oracleKeeper));
        _validate(
            MAINNET, address(safe), safeSingleton, address(safe).codehash, oracleKeeper, oracleKeeper, 0, 48 hours
        );

        vm.expectRevert(abi.encodeWithSelector(Deploy.MainnetRoleCollision.selector, address(safe)));
        _validate(
            MAINNET, address(safe), safeSingleton, address(safe).codehash, address(safe), rebalanceKeeper, 0, 48 hours
        );
    }

    function test_mainnetRejectsUnsafeThresholdAndSafeOwnerRoleCollision() public {
        address[] memory owners = new address[](2);
        owners[0] = makeAddr("ownerA");
        owners[1] = makeAddr("ownerB");
        MockSafe oneOfTwo = new MockSafe(safeSingleton, owners, 1);

        vm.expectRevert(Deploy.MainnetSafeConfigurationInvalid.selector);
        _validate(
            MAINNET,
            address(oneOfTwo),
            safeSingleton,
            address(oneOfTwo).codehash,
            oracleKeeper,
            rebalanceKeeper,
            0,
            48 hours
        );

        owners[0] = oracleKeeper;
        MockSafe keeperOwned = new MockSafe(safeSingleton, owners, 2);
        vm.expectRevert(abi.encodeWithSelector(Deploy.MainnetRoleCollision.selector, oracleKeeper));
        _validate(
            MAINNET,
            address(keeperOwned),
            safeSingleton,
            address(keeperOwned).codehash,
            oracleKeeper,
            rebalanceKeeper,
            0,
            48 hours
        );
    }

    function _validate(
        uint256 chainId,
        address safe_,
        address singleton,
        bytes32 codehash,
        address oracleKeeper_,
        address rebalanceKeeper_,
        uint256 cap,
        uint256 delay
    ) internal view {
        script.validateMainnetConfig(
            chainId, deployer, safe_, singleton, codehash, oracleKeeper_, rebalanceKeeper_, cap, delay
        );
    }
}
