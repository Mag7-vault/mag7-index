// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Keeper-posted price feed, denominated in USDG per 1e18 units of the
///         underlying token. Exists because VoxQuoter can't be called inside a
///         transaction (see IVoxQuoter.sol) — an off-chain script quotes the
///         real book via eth_call and posts the result here on a schedule.
///
///         This is the same trust point Voxelithic and DOSS both name openly:
///         "vault valuation uses keeper-maintained price feeds until public
///         equity oracles exist on this chain." Don't hide that from the
///         client — put it on the docs/security page the same way they do.
///
///         The keeper may also post per-token market caps here, used by
///         IndexVault's optional market-cap weighting mode. Market cap is an
///         abstract, self-consistent unit (only ratios between tokens matter,
///         never the absolute magnitude) because a tokenized equity's real
///         market cap = shares-outstanding x price is not observable on-chain.
///         Ownership is two-step (Ownable2Step) so it can be handed to a
///         Safe/timelock without risking a transfer to a wrong address.
contract PriceOracle is Ownable2Step {
    struct PriceData {
        uint256 priceUsdg; // price of 1e18 units of token, in USDG (1e6)
        uint64 updatedAt;
    }

    /// @dev Self-consistent unit; only inter-token ratios are used (see contract notes).
    struct MarketCapData {
        uint256 marketCap;
        uint64 updatedAt;
    }

    mapping(address token => PriceData) public prices;
    mapping(address token => MarketCapData) public marketCaps;
    mapping(address => bool) public isKeeper;

    /// @dev A price older than this is refused by callers (IndexVault.totalAssets
    ///      reverts rather than mark-to-stale). Weekly rebalance cadence means
    ///      this should be well under a day in production.
    uint256 public maxStaleness = 1 hours;

    /// @dev Market caps move far more slowly than prices, so they carry their own,
    ///      more generous freshness window. A stale market cap only blocks
    ///      market-cap-weighted rebalances; it never affects NAV or redemptions.
    uint256 public maxMarketCapStaleness = 1 days;

    event PricePosted(address indexed token, uint256 priceUsdg, uint64 updatedAt);
    event MarketCapPosted(address indexed token, uint256 marketCap, uint64 updatedAt);
    event KeeperSet(address indexed keeper, bool allowed);
    event MaxStalenessSet(uint256 seconds_);
    event MaxMarketCapStalenessSet(uint256 seconds_);

    error NotKeeper();
    error StalePrice(address token, uint256 updatedAt);
    error NoPrice(address token);
    error ZeroPrice(address token);
    error StaleMarketCap(address token, uint256 updatedAt);
    error NoMarketCap(address token);

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

    function setMaxMarketCapStaleness(uint256 seconds_) external onlyOwner {
        maxMarketCapStaleness = seconds_;
        emit MaxMarketCapStalenessSet(seconds_);
    }

    /// @param tokens tokens to update
    /// @param priceUsdg18 price of 1e18 units of `token`, denominated in USDG (6 decimals)
    /// @dev Rejects a zero price: a real equity never quotes at 0, and storing 0
    ///      would make getPrice mark the token to zero rather than fail closed.
    function postPrices(address[] calldata tokens, uint256[] calldata priceUsdg18) external onlyKeeper {
        require(tokens.length == priceUsdg18.length, "length mismatch");
        for (uint256 i = 0; i < tokens.length; i++) {
            if (priceUsdg18[i] == 0) revert ZeroPrice(tokens[i]);
            prices[tokens[i]] = PriceData({priceUsdg: priceUsdg18[i], updatedAt: uint64(block.timestamp)});
            emit PricePosted(tokens[i], priceUsdg18[i], uint64(block.timestamp));
        }
    }

    /// @param tokens tokens to update
    /// @param caps abstract market-cap magnitudes; only ratios between tokens are
    ///        ever consumed (IndexVault normalizes them into weights), so the unit
    ///        the keeper chooses is arbitrary as long as it is consistent per post.
    function postMarketCaps(address[] calldata tokens, uint256[] calldata caps) external onlyKeeper {
        require(tokens.length == caps.length, "length mismatch");
        for (uint256 i = 0; i < tokens.length; i++) {
            marketCaps[tokens[i]] = MarketCapData({marketCap: caps[i], updatedAt: uint64(block.timestamp)});
            emit MarketCapPosted(tokens[i], caps[i], uint64(block.timestamp));
        }
    }

    /// @notice Reverts on missing or stale price — callers should not silently
    ///         mark-to-zero, that's how a vault quietly mis-prices itself.
    /// @dev A stored price of 0 is treated as absent (fails closed) as well as
    ///      missing/stale; postPrices refuses to store 0 in the first place.
    function getPrice(address token) external view returns (uint256 priceUsdg) {
        PriceData memory p = prices[token];
        if (p.updatedAt == 0 || p.priceUsdg == 0) revert NoPrice(token);
        if (block.timestamp - p.updatedAt > maxStaleness) revert StalePrice(token, p.updatedAt);
        return p.priceUsdg;
    }

    /// @notice Reverts on missing or stale market cap. Unlike price, a stale value
    ///         here only blocks a market-cap-weighted rebalance; NAV and redemptions
    ///         never read this, so the freshness window is intentionally looser.
    function getMarketCap(address token) external view returns (uint256 marketCap) {
        MarketCapData memory m = marketCaps[token];
        if (m.updatedAt == 0) revert NoMarketCap(token);
        if (block.timestamp - m.updatedAt > maxMarketCapStaleness) revert StaleMarketCap(token, m.updatedAt);
        return m.marketCap;
    }
}
