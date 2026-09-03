// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Matches the deployed VoxQuoter ABI.
///
/// @dev IMPORTANT — this is a revert-to-return quoter, not a normal view
///      function. Its own ABI declares `error QuoteResult(amountOut, amountPaid)`
///      and `error PoolDidNotRevert()`. Calling quoteExactIn / quoteMany inside
///      an actual transaction will REVERT the caller — it is only usable via
///      an off-chain `eth_call` / `staticcall` that catches and decodes the
///      revert data. Voxelithic says as much on their own site: "one eth_call
///      prices the whole book."
///
///      DO NOT call this from IndexVault or Rebalancer inside a state-changing
///      function. Prices reach the vault through PriceOracle.sol, which a
///      keeper updates off-chain using exactly this quoter (see
///      keeper/post-prices.mjs) — the same "keeper-maintained price feeds"
///      pattern DOSS itself documents as necessary until this chain has
///      public equity oracles.
interface IVoxQuoter {
    struct Leg {
        address pool;
        bool zeroForOne;
    }

    function quoteExactIn(address pool, bool zeroForOne, uint256 amountIn)
        external
        returns (uint256 amountOut, uint256 amountPaid);

    function quoteMany(Leg[] calldata legs, uint256 amountIn)
        external
        returns (uint256[] memory outs, uint256[] memory paid);
}
