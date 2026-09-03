// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Attempts every standard ERC-4626 share-mutating entrypoint when the
///      vault transfers this token during an in-kind redemption.
contract MockReentrantERC20 is ERC20 {
    address public vault;
    address public asset;
    address public shareOwner;
    address public receiver;
    bool public attackEnabled;
    bool public attacked;
    bool public depositSucceeded;
    bool public mintSucceeded;
    bool public withdrawSucceeded;
    bool public redeemSucceeded;

    constructor() ERC20("Reentrant Token", "REENTRANT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function configureAttack(address vault_, address asset_, address shareOwner_, address receiver_) external {
        vault = vault_;
        asset = asset_;
        shareOwner = shareOwner_;
        receiver = receiver_;
        attackEnabled = true;
        IERC20(asset_).approve(vault_, type(uint256).max);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        if (!attackEnabled || from != vault || to != receiver) return;
        attackEnabled = false;
        attacked = true;

        (depositSucceeded,) = vault.call(abi.encodeWithSignature("deposit(uint256,address)", 1, receiver));
        (mintSucceeded,) = vault.call(abi.encodeWithSignature("mint(uint256,address)", 1, receiver));
        (withdrawSucceeded,) =
            vault.call(abi.encodeWithSignature("withdraw(uint256,address,address)", 1, receiver, shareOwner));
        (redeemSucceeded,) =
            vault.call(abi.encodeWithSignature("redeem(uint256,address,address)", 1, receiver, shareOwner));
    }
}
