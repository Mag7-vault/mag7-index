// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVoxRouter} from "../../src/interfaces/IVoxRouter.sol";
import {MockERC20} from "./MockERC20.sol";

/// @dev Ignores `hops` entirely and swaps at whatever rate the test sets via
///      setRate. Real integration testing against actual pool state belongs
///      in a forked-mainnet test (see test/IndexVault.fork.t.sol stub).
contract MockVoxRouter is IVoxRouter {
    // rate: how many `tokenOut` units (18dec) per 1e18 `tokenIn` units, scaled 1e18
    mapping(address => mapping(address => uint256)) public rate;
    uint256 public spendBps = 10_000;

    function setRate(address tokenIn, address tokenOut, uint256 rate1e18) external {
        rate[tokenIn][tokenOut] = rate1e18;
    }

    function setSpendBps(uint256 spendBps_) external {
        require(spendBps_ <= 10_000, "bad spend bps");
        spendBps = spendBps_;
    }

    function swapExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        Hop[] calldata /* hops */
    ) external override returns (uint256 outToUser) {
        require(block.timestamp <= deadline, "expired");
        uint256 r = rate[tokenIn][tokenOut];
        require(r != 0, "no rate set");

        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn * spendBps / 10_000);
        outToUser = (amountIn * r) / 1e18;
        require(outToUser >= minOut, "slippage");
        MockERC20(tokenOut).mint(msg.sender, outToUser);
    }

    function feeBps() external pure override returns (uint16) {
        return 0;
    }
}
