// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

contract MontheraTokenClaim {
    IERC20 public immutable token;
    uint256 public constant CLAIM_AMOUNT = 10_000 * 1e18; // 10,000 token
    mapping(address => bool) public claimed;

    event Claimed(address indexed user, uint256 amount);

    constructor(address _token) {
        token = IERC20(_token);
    }

    function claim() external {
        require(!claimed[msg.sender], "Already claimed");
        claimed[msg.sender] = true;

        require(
            token.transfer(msg.sender, CLAIM_AMOUNT),
            "Token transfer failed"
        );

        emit Claimed(msg.sender, CLAIM_AMOUNT);
    }

    // Optional: check balance of token left in contract
    function available() external view returns (uint256) {
        return address(this).balance;
    }
}