// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Matches the deployed VoxRouter ABI at RobinhoodChain.VOX_ROUTER.
///         v1 scope targets this router only (Uniswap v3, Ramses, Giga, Up,
///         Alandale — everything Voxelithic executes without the v4 singleton
///         lock). The v4 pools (VoxRouterV4) are ~half of live liquidity and
///         a real v2 item, not a launch blocker.
interface IVoxRouter {
    struct Hop {
        uint8 kind;
        address pool;
        bool zeroForOne;
        uint24 feePpm;
    }

    function swapExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        Hop[] calldata hops
    ) external returns (uint256 outToUser);

    function feeBps() external view returns (uint16);
}
