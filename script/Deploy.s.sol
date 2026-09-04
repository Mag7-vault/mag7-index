// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
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
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address oracleKeeper = vm.envOr("ORACLE_KEEPER_ADDRESS", deployer);
        address rebalanceKeeper = vm.envOr("REBALANCE_KEEPER_ADDRESS", deployer);
        uint256 initialCap = vm.envOr("INITIAL_DEPOSIT_CAP", uint256(10_000e6)); // USDG is 6dec
        address safe = vm.envOr("SAFE_ADDRESS", address(0));
        uint256 minDelay = vm.envOr("TIMELOCK_MIN_DELAY", uint256(48 hours));

        // Real money on mainnet must never sit behind a bare EOA owner.
        require(block.chainid != 4663 || safe != address(0), "SAFE_ADDRESS required on mainnet");

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
}
