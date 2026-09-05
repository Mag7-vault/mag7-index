// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {IndexVault} from "../src/IndexVault.sol";
import {IVoxRouter} from "../src/interfaces/IVoxRouter.sol";
import {RobinhoodChain, Tokens} from "../src/lib/Constants.sol";

interface ISafeLike {
    function masterCopy() external view returns (address);
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
}

/// @dev NOTE ON BASKET COMPOSITION
/// IndexVault v1 executes VoxRouter v3 routes only (see keeper/voxelithic.mjs),
/// so every basket name needs a live v3 USDG pool. Several "Magnificent Seven"
/// names cannot go in a v3-only vault today:
///   - MSFT has no Robinhood Token on this chain (not in Voxelithic's list).
///   - META, TSLA, and AMZN are listed but only quote on Voxelithic v4 pools,
///     so their sleeves cannot be traded on-chain (verified 2026-09-05).
/// This script is configured for an equal-weight FIVE (NVDA, AAPL, GOOGL, AMD,
/// NFLX). Routing is volatile — names migrate
/// v3<->v4 within a day — but the system fails safe when a leg goes v4:
/// deposits, redeems, redeemInKind, and NAV pricing are unaffected; only that
/// leg's on-chain rebalance swap is blocked until it returns to v3 or is
/// swapped out. To grow or adjust the basket, add a name with a live v3 venue
/// As of the latest 2026-09-05 preflight, AMD resolves through v4, so this exact
/// basket is a mainnet NO-GO until it changes or v4 execution is implemented
/// and reviewed. Always run keeper health immediately before a deployment and
/// keep weightsBps summing to 10_000.
///
/// @dev NOTE ON GOVERNANCE
/// When SAFE_ADDRESS is set, this deploys an OZ TimelockController whose sole
/// proposer/executor is the Safe, sets the Safe as the instant-pause guardian,
/// and hands ownership of both contracts to the timelock. Because ownership is
/// Ownable2Step, the transfer only completes once the Safe schedules+executes
/// acceptOwnership() through the timelock (see docs/runbook-canary.md); the
/// deployer stays owner until then, so a mistyped Safe is fully recoverable.
/// The market-cap weighting and permissionless-rebalance features ship dormant
/// (STATIC weights, zero permissionless notional) and are enabled later by the
/// owner — i.e. through the timelock — once their feeds/policy are in place.
contract Deploy is Script {
    uint256 internal constant MAINNET_CHAIN_ID = 4663;
    uint256 internal constant MIN_MAINNET_TIMELOCK_DELAY = 48 hours;

    error MainnetSafeRequired();
    error MainnetSafeMustBeContract(address safe);
    error MainnetSafeCodehashMismatch(bytes32 actual, bytes32 expected);
    error MainnetSafeSingletonMismatch(address actual, address expected);
    error MainnetSafeConfigurationInvalid();
    error MainnetTimelockTooShort(uint256 provided, uint256 minimum);
    error MainnetCapMustStartZero(uint256 cap);
    error MainnetKeeperRequired();
    error MainnetRoleCollision(address account);

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address oracleKeeper = vm.envOr("ORACLE_KEEPER_ADDRESS", deployer);
        address rebalanceKeeper = vm.envOr("REBALANCE_KEEPER_ADDRESS", deployer);
        uint256 initialCap = vm.envOr("INITIAL_DEPOSIT_CAP", uint256(10_000e6)); // USDG is 6dec
        address safe = vm.envOr("SAFE_ADDRESS", address(0));
        address expectedSafeSingleton = vm.envOr("EXPECTED_SAFE_SINGLETON", address(0));
        bytes32 expectedSafeCodehash = vm.envOr("EXPECTED_SAFE_CODEHASH", bytes32(0));
        uint256 minDelay = vm.envOr("TIMELOCK_MIN_DELAY", uint256(48 hours));

        validateMainnetConfig(
            block.chainid,
            deployer,
            safe,
            expectedSafeSingleton,
            expectedSafeCodehash,
            oracleKeeper,
            rebalanceKeeper,
            initialCap,
            minDelay
        );

        vm.startBroadcast(deployerKey);

        PriceOracle oracle = new PriceOracle(deployer);
        oracle.setKeeper(oracleKeeper, true);

        IndexVault vault =
            new IndexVault(IERC20(Tokens.USDG), IVoxRouter(RobinhoodChain.VOX_ROUTER), oracle, deployer, initialCap);
        vault.setKeeper(rebalanceKeeper, true);

        address[] memory basket = new address[](5);
        basket[0] = Tokens.NVDA;
        basket[1] = Tokens.AAPL;
        basket[2] = Tokens.GOOGL;
        basket[3] = Tokens.AMD;
        basket[4] = Tokens.NFLX;

        uint16[] memory weights = new uint16[](5);
        weights[0] = 2000;
        weights[1] = 2000;
        weights[2] = 2000;
        weights[3] = 2000;
        weights[4] = 2000;

        vault.setBasket(basket, weights);

        // Guardian pauses instantly during an incident; it holds no other power.
        address guardian = safe == address(0) ? deployer : safe;
        vault.setGuardian(guardian);

        address timelock;
        if (safe != address(0)) {
            address[] memory proposers = new address[](1);
            address[] memory executors = new address[](1);
            proposers[0] = safe;
            executors[0] = safe;
            // admin = address(0): the timelock self-administers; role changes
            // thereafter require a timelocked proposal (no standing admin EOA).
            TimelockController tc = new TimelockController(minDelay, proposers, executors, address(0));
            timelock = address(tc);
            oracle.transferOwnership(timelock); // pending until the Safe accepts via timelock
            vault.transferOwnership(timelock);
        }

        vm.stopBroadcast();

        console2.log("PriceOracle:", address(oracle));
        console2.log("IndexVault:", address(vault));
        console2.log("Vault asset (USDG):", vault.asset());
        console2.log("Guardian:", guardian);
        if (timelock != address(0)) {
            console2.log("TimelockController:", timelock);
            console2.log("Timelock min delay (seconds):", minDelay);
            console2.log("Ownership pending -> timelock. Safe must schedule+execute acceptOwnership() on BOTH.");
        } else {
            console2.log("No SAFE_ADDRESS set: deployer retains ownership (local/testnet only).");
        }
    }

    /// @notice Fail closed on mainnet when launch/governance role separation is
    ///         not explicit. Local and testnet demos keep their convenient
    ///         deployer-owned defaults.
    function validateMainnetConfig(
        uint256 chainId,
        address deployer,
        address safe,
        address expectedSafeSingleton,
        bytes32 expectedSafeCodehash,
        address oracleKeeper,
        address rebalanceKeeper,
        uint256 initialCap,
        uint256 minDelay
    ) public view {
        if (chainId != MAINNET_CHAIN_ID) return;
        if (safe == address(0)) revert MainnetSafeRequired();
        if (safe.code.length == 0) revert MainnetSafeMustBeContract(safe);
        if (expectedSafeCodehash == bytes32(0) || safe.codehash != expectedSafeCodehash) {
            revert MainnetSafeCodehashMismatch(safe.codehash, expectedSafeCodehash);
        }
        if (expectedSafeSingleton == address(0)) revert MainnetSafeConfigurationInvalid();

        try ISafeLike(safe).masterCopy() returns (address singleton) {
            if (singleton != expectedSafeSingleton) {
                revert MainnetSafeSingletonMismatch(singleton, expectedSafeSingleton);
            }
        } catch {
            revert MainnetSafeConfigurationInvalid();
        }
        if (minDelay < MIN_MAINNET_TIMELOCK_DELAY) {
            revert MainnetTimelockTooShort(minDelay, MIN_MAINNET_TIMELOCK_DELAY);
        }
        if (initialCap != 0) revert MainnetCapMustStartZero(initialCap);
        if (oracleKeeper == address(0) || rebalanceKeeper == address(0)) revert MainnetKeeperRequired();

        if (safe == deployer || oracleKeeper == deployer || rebalanceKeeper == deployer) {
            revert MainnetRoleCollision(deployer);
        }
        if (oracleKeeper == rebalanceKeeper) revert MainnetRoleCollision(oracleKeeper);
        if (oracleKeeper == safe || rebalanceKeeper == safe) revert MainnetRoleCollision(safe);

        address[] memory owners;
        uint256 threshold;
        try ISafeLike(safe).getOwners() returns (address[] memory safeOwners) {
            owners = safeOwners;
        } catch {
            revert MainnetSafeConfigurationInvalid();
        }
        try ISafeLike(safe).getThreshold() returns (uint256 safeThreshold) {
            threshold = safeThreshold;
        } catch {
            revert MainnetSafeConfigurationInvalid();
        }
        if (owners.length < 2 || threshold < 2 || threshold > owners.length) {
            revert MainnetSafeConfigurationInvalid();
        }
        for (uint256 i = 0; i < owners.length; i++) {
            address safeOwner = owners[i];
            if (safeOwner == address(0)) revert MainnetSafeConfigurationInvalid();
            if (safeOwner == deployer || safeOwner == oracleKeeper || safeOwner == rebalanceKeeper) {
                revert MainnetRoleCollision(safeOwner);
            }
            for (uint256 j = 0; j < i; j++) {
                if (safeOwner == owners[j]) revert MainnetSafeConfigurationInvalid();
            }
        }
    }
}
