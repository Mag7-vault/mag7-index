// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Keeper-posted price feed, denominated in USDG per 1e18 units of the
///         underlying token. Exists because VoxQuoter can't be called inside a
///         transaction (see IVoxQuoter.sol) — an off-chain script quotes the
///         real book via eth_call and posts the result here on a schedule.
///
///         This is the same trust point Voxelithic and DOSS both name openly:
///         "vault valuation uses keeper-maintained price feeds until public
///         equity oracles exist on this chain." Don't hide that from the
///         client — put it on the docs/security page the same way they do.
contract PriceOracle is Ownable {
    struct PriceData {
        uint256 priceUsdg; // price of 1e18 units of token, in USDG (1e6)
        uint64 updatedAt;
    }

    mapping(address token => PriceData) public prices;
    mapping(address => bool) public isKeeper;

    /// @dev A price older than this is refused by callers (IndexVault.totalAssets
    ///      reverts rather than mark-to-stale). Weekly rebalance cadence means
    ///      this should be well under a day in production.
    uint256 public maxStaleness = 1 hours;

    event PricePosted(address indexed token, uint256 priceUsdg, uint64 updatedAt);
    event KeeperSet(address indexed keeper, bool allowed);
    event MaxStalenessSet(uint256 seconds_);

    error NotKeeper();
    error StalePrice(address token, uint256 updatedAt);
    error NoPrice(address token);

    modifier onlyKeeper() {
        if (!isKeeper[msg.sender] && msg.sender != owner()) revert NotKeeper();
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function setMaxStaleness(uint256 seconds_) external onlyOwner {
        maxStaleness = seconds_;
        emit MaxStalenessSet(seconds_);
    }

    /// @param tokens tokens to update
    /// @param priceUsdg18 price of 1e18 units of `token`, denominated in USDG (6 decimals)
    function postPrices(address[] calldata tokens, uint256[] calldata priceUsdg18) external onlyKeeper {
        require(tokens.length == priceUsdg18.length, "length mismatch");
        for (uint256 i = 0; i < tokens.length; i++) {
            prices[tokens[i]] = PriceData({priceUsdg: priceUsdg18[i], updatedAt: uint64(block.timestamp)});
            emit PricePosted(tokens[i], priceUsdg18[i], uint64(block.timestamp));
        }
    }

    /// @notice Reverts on missing or stale price — callers should not silently
    ///         mark-to-zero, that's how a vault quietly mis-prices itself.
    function getPrice(address token) external view returns (uint256 priceUsdg) {
        PriceData memory p = prices[token];
        if (p.updatedAt == 0) revert NoPrice(token);
        if (block.timestamp - p.updatedAt > maxStaleness) revert StalePrice(token, p.updatedAt);
        return p.priceUsdg;
    }
}
