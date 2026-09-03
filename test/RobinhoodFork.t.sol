// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IVoxRouter} from "../src/interfaces/IVoxRouter.sol";
import {RobinhoodChain, Tokens} from "../src/lib/Constants.sol";

interface IERC20MetadataView {
    function decimals() external view returns (uint8);
}

contract RobinhoodForkTest is Test {
    function test_mainnetConstantsHaveCodeAndExpectedMetadata() public {
        string memory rpc = vm.envOr("ROBINHOOD_MAINNET_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);

        assertEq(block.chainid, RobinhoodChain.CHAIN_ID);
        assertGt(RobinhoodChain.VOX_ROUTER.code.length, 0);
        assertGt(RobinhoodChain.VOX_QUOTER.code.length, 0);
        assertGt(RobinhoodChain.VOX_ROUTER_V4.code.length, 0);
        assertGt(RobinhoodChain.VOX_QUOTER_V4.code.length, 0);
        assertGt(Tokens.USDG.code.length, 0);
        assertGt(Tokens.NVDA.code.length, 0);
        assertGt(Tokens.AAPL.code.length, 0);
        assertGt(Tokens.TSLA.code.length, 0);
        assertGt(Tokens.GOOGL.code.length, 0);
        assertGt(Tokens.META.code.length, 0);
        assertGt(Tokens.AMZN.code.length, 0);
        assertEq(IERC20MetadataView(Tokens.USDG).decimals(), 6);
        assertEq(IERC20MetadataView(Tokens.NVDA).decimals(), 18);
        assertLe(IVoxRouter(RobinhoodChain.VOX_ROUTER).feeBps(), 10_000);
    }
}
