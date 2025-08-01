// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MontheraToken - ERC20 (OpenZeppelin v5.2.0 modified) + batchTransfer() support + mintOnce()
/// @author OpenZeppelin (modified)
/// @notice ERC20 token with batch transfer and mint-once feature in single-file version

contract MontheraToken {
    string public name = "Monthera";
    string public symbol = "MTHR";
    uint8 public decimals = 18;

    uint256 private _totalSupply;
    address public owner;
    bool public hasMinted;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    error ERC20InvalidSender(address sender);
    error ERC20InvalidReceiver(address receiver);
    error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed);
    error ERC20InsufficientAllowance(address spender, uint256 currentAllowance, uint256 needed);
    error ERC20InvalidApprover(address approver);
    error ERC20InvalidSpender(address spender);
    error AlreadyMinted();
    error NotOwner();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        owner = msg.sender;
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function transfer(address to, uint256 value) public returns (bool) {
        address from = msg.sender;
        _transfer(from, to, value);
        return true;
    }

    function approve(address spender, uint256 value) public returns (bool) {
        address _owner = msg.sender;
        _approve(_owner, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        address spender = msg.sender;
        _spendAllowance(from, spender, value);
        _transfer(from, to, value);
        return true;
    }

    function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external returns (bool) {
        if (recipients.length != amounts.length) revert("Length mismatch");

        for (uint256 i = 0; i < recipients.length; i++) {
            _transfer(msg.sender, recipients[i], amounts[i]);
        }

        return true;
    }

    function mintOnce(address to1, uint256 amount1, address to2, uint256 amount2) external {
        if (msg.sender != owner) revert NotOwner();
        if (hasMinted) revert AlreadyMinted();
        hasMinted = true;

        _mint(to1, amount1);
        _mint(to2, amount2);
    }

    function _transfer(address from, address to, uint256 value) internal {
        if (from == address(0)) revert ERC20InvalidSender(from);
        if (to == address(0)) revert ERC20InvalidReceiver(to);

        uint256 fromBalance = balanceOf[from];
        if (fromBalance < value) revert ERC20InsufficientBalance(from, fromBalance, value);

        unchecked {
            balanceOf[from] = fromBalance - value;
            balanceOf[to] += value;
        }

        emit Transfer(from, to, value);
    }

    function _mint(address account, uint256 value) internal {
        if (account == address(0)) revert ERC20InvalidReceiver(account);

        _totalSupply += value;
        balanceOf[account] += value;

        emit Transfer(address(0), account, value);
    }

    function _burn(address account, uint256 value) internal {
        if (account == address(0)) revert ERC20InvalidSender(account);

        uint256 fromBalance = balanceOf[account];
        if (fromBalance < value) revert ERC20InsufficientBalance(account, fromBalance, value);

        unchecked {
            balanceOf[account] = fromBalance - value;
            _totalSupply -= value;
        }

        emit Transfer(account, address(0), value);
    }

    function _approve(address _owner, address spender, uint256 value) internal {
        if (_owner == address(0)) revert ERC20InvalidApprover(_owner);
        if (spender == address(0)) revert ERC20InvalidSpender(spender);

        allowance[_owner][spender] = value;
        emit Approval(_owner, spender, value);
    }

    function _spendAllowance(address _owner, address spender, uint256 value) internal {
        uint256 currentAllowance = allowance[_owner][spender];
        if (currentAllowance != type(uint256).max) {
            if (currentAllowance < value) revert ERC20InsufficientAllowance(spender, currentAllowance, value);
            unchecked {
                allowance[_owner][spender] = currentAllowance - value;
            }
        }
    }
}