// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MontheraVaultStaking is ERC4626, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable rewardToken;

    uint256 public rewardRate;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    uint256 public totalRewardClaimed;
    uint256 public storedRewardPool;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event RewardAdded(uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event SetRewardRate(uint256 newRate);

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
        checkAndPause();
    }

    constructor(
        address _tokenAddress,
        string memory _name,
        string memory _symbol,
        uint256 _rewardRate
    )
        ERC4626(IERC20(_tokenAddress))
        ERC20(_name, _symbol)
        Ownable(msg.sender)
    {
        require(_tokenAddress != address(0), "Invalid token address");
        require(_tokenAddress == address(asset()), "Reward token must be same as asset token");

        rewardToken = IERC20(_tokenAddress);
        rewardRate = _rewardRate;
        lastUpdateTime = block.timestamp;
    }

    function convertToShares(uint256 assets) public view override returns (uint256) {
    uint256 supply = totalSupply();
    uint256 realAssets = totalAssets() > storedRewardPool ? totalAssets() - storedRewardPool : 0;
    return supply == 0 ? assets : (assets * supply) / realAssets;
}

function convertToAssets(uint256 shares) public view override returns (uint256) {
    uint256 supply = totalSupply();
    uint256 realAssets = totalAssets() > storedRewardPool ? totalAssets() - storedRewardPool : 0;
    return supply == 0 ? shares : (shares * realAssets) / supply;
}

    function previewDeposit(uint256 assets) public pure override returns (uint256) {
        return assets;
    }

    function previewMint(uint256 shares) public pure override returns (uint256) {
        return shares;
    }

    function previewWithdraw(uint256 assets) public pure override returns (uint256) {
        return assets;
    }

    function previewRedeem(uint256 shares) public pure override returns (uint256) {
        return shares;
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        return balanceOf(owner);
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return balanceOf(owner);
    }

    // === Core Vault Functions ===

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        updateReward(receiver)
        returns (uint256 shares)
    {
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        updateReward(receiver)
        returns (uint256 assets)
    {
        return super.mint(shares, receiver);
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        whenNotPaused
        updateReward(owner)
        returns (uint256 assets)
    {
        return super.redeem(shares, receiver, owner);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        whenNotPaused
        updateReward(owner)
        returns (uint256 shares)
    {
        return super.withdraw(assets, receiver, owner);
    }

    // === Rewards ===

    function claimReward()
        external
        nonReentrant
        updateReward(msg.sender)
    {
        uint256 reward = rewards[msg.sender];
        require(reward > 0, "No reward to claim");
        rewards[msg.sender] = 0;

        require(storedRewardPool >= reward, "Insufficient reward pool");
        storedRewardPool -= reward;

        rewardToken.safeTransfer(msg.sender, reward);
        totalRewardClaimed += reward;

        emit RewardClaimed(msg.sender, reward);
        checkAndPause();
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return paused() ? lastUpdateTime : block.timestamp;
    }

    function rewardPerToken() public view returns (uint256) {
    uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
    uint256 stakedOnly = vaultBalance > storedRewardPool ? vaultBalance - storedRewardPool : 0;
    if (stakedOnly == 0) return rewardPerTokenStored;

    return
        rewardPerTokenStored +
        (((block.timestamp - lastUpdateTime) * rewardRate * 1e18) / stakedOnly);
}

    function earned(address account) public view returns (uint256) {
        uint256 userAssets = convertToAssets(balanceOf(account));
        return ((userAssets * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18) + rewards[account];
    }

    // === Admin ===

    function setRewardRate(uint256 _rewardRate)
        external
        onlyOwner
        updateReward(address(0))
    {
        rewardRate = _rewardRate;
        emit SetRewardRate(_rewardRate);
    }

    function getRewardRate() external view returns (uint256) {
        return rewardRate;
    }

    function fundRewardPool() external onlyOwner updateReward(address(0)) {
    uint256 balance = rewardToken.balanceOf(address(this));
    require(balance > storedRewardPool, "No new tokens to fund");

    uint256 addedAmount = balance - storedRewardPool;
    storedRewardPool = balance;

    emit RewardAdded(addedAmount);
    checkAndUnpause();
}

    function checkAndPause() internal {
        if (storedRewardPool < rewardRate) {
            _pause();
        }
    }

    function checkAndUnpause() internal {
        if (paused() && storedRewardPool >= rewardRate) {
            _unpause();
        }
    }

    function emergencyPause() external onlyOwner {
        _pause();
    }

    function emergencyUnpause() external onlyOwner {
        _unpause();
    }

    function rescueTokens(address token, uint256 amount) external onlyOwner {
        require(token != address(asset()), "Not allowed");
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    // === Views ===

    function totalClaimed() external view returns (uint256) {
        return totalRewardClaimed;
    }

    function previewReward(address user) external view returns (uint256) {
        return earned(user);
    }

    function rewardPoolBalance() external view returns (uint256) {
        return storedRewardPool;
    }

    function estimatedAPR() external view returns (uint256) {
    uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
    uint256 stakedOnly = vaultBalance > storedRewardPool ? vaultBalance - storedRewardPool : 0;

    if (stakedOnly == 0) return 0;

    uint256 annualReward = rewardRate * 365 days;
    return (annualReward * 10000) / stakedOnly;
}
}