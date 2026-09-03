// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Addresses pulled from the `voxelithic-interfaces` npm package (v0.5.2),
///         cross-checked against https://voxelithic.xyz on 2026-09-03.
///         Re-verify against the published package before every deploy — these
///         are Voxelithic's contracts, not ours, and can change on their end.
library RobinhoodChain {
    uint256 internal constant CHAIN_ID = 4663;

    // Uniswap v3-style venues (Ramses/Giga/Up/Alandale all route through this one too)
    address internal constant VOX_ROUTER = 0x87cD7EbE8c213455e5e5a8554657D5f294a82e64;
    address internal constant VOX_QUOTER = 0x9616627E871c96e38cb21b9551F62Ed93366bE1B;

    // Uniswap v4 singleton venue
    address internal constant VOX_ROUTER_V4 = 0x290b9b46308f7a3B80A5F62214B426d3bfAfaab5;
    address internal constant VOX_QUOTER_V4 = 0x5858F06894623eF4862103A747074E5AA3436d4F;
    address internal constant UNISWAP_V4_SINGLETON = 0xC851ADA1E4FA2A9Dd5483284D6b30E2950CC4f04;
}

/// @notice Robinhood Token addresses on chain 4663. Decimals are 18 for every
///         equity token and 6 for USDG — do not assume 18 everywhere.
library Tokens {
    address internal constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168; // 6 decimals
    address internal constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address internal constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;
    address internal constant TSLA = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;
    address internal constant MSTR = 0xec262a75e413fAfD0dF80480274532C79D42da09;
    address internal constant GOOGL = 0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3;
    address internal constant META = 0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35;
    address internal constant AMZN = 0x12f190a9F9d7D37a250758b26824B97CE941bF54;
    address internal constant MU = 0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD;
    address internal constant COIN = 0x6330D8C3178a418788dF01a47479c0ce7CCF450b;
    address internal constant PLTR = 0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A;
    address internal constant QQQ = 0xD5f3879160bc7c32ebb4dC785F8a4F505888de68;
    address internal constant AMD = 0x86923f96303D656E4aa86D9d42D1e57ad2023fdC;
    address internal constant NFLX = 0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8;
    address internal constant SPY = 0x117cc2133c37B721F49dE2A7a74833232B3B4C0C;
    address internal constant TSM = 0x58FfE4a942d3885bAa22D7520691F611EF09e7AA;
    address internal constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
}
