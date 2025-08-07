let isConnected = false;
let currentProvider = null;
let signer = null;
let userAddress = null;
let vaultContract = null;
let tokenContract = null;
let vaultContractPublic = null;
let stakeInputErrorTimeout = null;
let lastRewardShown = "";
let rewardLoopStarted = false;

const VAULT_ADDRESS = "0xa615e83Fa5b5311F72e1fB419D66cC23E88c2059";
const TOKEN_ADDRESS = "0xa2e6609876D77415Fa4097A05C07884e9FAA585F";
const CLAIM_ADDRESS = "0x538FAc2d24c441B40D1c807F7Fe6E60b984188dD";
const publicProvider = new ethers.providers.JsonRpcProvider("https://testnet-rpc.monad.xyz");
const shortWalletText = (addr) => addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : "";

const MONAD_PARAMS = {
	chainId: "0x279F",
	chainName: "Monad Testnet",
	nativeCurrency: {
		name: "TESTNET_MON",
		symbol: "MON",
		decimals: 18,
	},
	rpcUrls: ["https://testnet-rpc.monad.xyz"],
	blockExplorerUrls: ["https://explorer.testnet.monad.xyz"],
};

async function switchToMonad() {
	try {
		await window.ethereum.request({
			method: "wallet_switchEthereumChain",
			params: [{
				chainId: MONAD_PARAMS.chainId
			}],
		});
	} catch (switchError) {
		if (switchError.code === 4902) {
			await window.ethereum.request({
				method: "wallet_addEthereumChain",
				params: [MONAD_PARAMS],
			});
		} else {
			throw new Error("Failed switch to monad testnet network");
		}
	}
}

function fadeToUserInfo() {
	const guest = document.getElementById("stakeHeaderGuest");
	const user = document.getElementById("userInfoSection");
	guest.classList.remove("fade-in");
	guest.classList.add("fade-out");
	user.classList.remove("fade-out");
	user.classList.add("fade-in");
}

document.addEventListener("DOMContentLoaded", async function() {
	resetUI();
	const button = document.getElementById("connectButton");
	const connectText = document.getElementById("connectText");
	const connectIcon = document.getElementById("connectIcon");
	connectText.innerText = "Connect Wallet";
	connectIcon.innerHTML = "";
	const isSigning = localStorage.getItem("isSigning") === "true";
	const isDisconnected = localStorage.getItem("isDisconnected") === "true";
	document.getElementById("redeemVaultInput").addEventListener("input", updateRedeemPreview);
	const stakeInput = document.getElementById("stakeAmount");
	stakeInput.style.outline = "none";
	stakeInput.style.boxShadow = "none";
	stakeInput.style.border = "1px solid #ccc";
	stakeInput.addEventListener("input", () => {
		const inputValue = parseFloat(stakeInput.value);
		const userBalance = parseFloat(window.currentUserTokenBalance || 0);
		if (!isNaN(inputValue) && inputValue > userBalance) {
			stakeInput.style.border = "2px solid red";
			stakeInput.style.color = "red";
			stakeInput.style.transition = "transform 0.1s";
			stakeInput.style.transform = "translateX(-4px)";
			setTimeout(() => {
				stakeInput.style.transform = "translateX(4px)";
			}, 100);
			setTimeout(() => {
				stakeInput.style.transform = "translateX(-2px)";
			}, 200);
			setTimeout(() => {
				stakeInput.style.transform = "translateX(2px)";
			}, 300);
			setTimeout(() => {
				stakeInput.style.transform = "translateX(0)";
			}, 400);
		} else {
			stakeInput.style.border = "1px solid #ccc";
			stakeInput.style.color = "";
			stakeInput.style.transform = "translateX(0)";
		}
	});
	
	document.getElementById("closeClaimPopup").addEventListener("click", () => {
	hideModal("claimPopup");
});

document.getElementById("tokenClaimBtn").addEventListener("click", async () => {
	const claimBtn = document.getElementById("tokenClaimBtn");
	const closeBtn = document.getElementById("closeClaimPopup");
	const originalText = claimBtn.innerHTML;

	claimBtn.disabled = true;
	closeBtn.disabled = true;
	claimBtn.innerHTML = `
	<div style="display: flex; justify-content: center; align-items: center; width: 100%;">
		<span>Processing</span>
		<span id="dots-loading-claim" style="display: inline-block; width: 1ch; font-family: monospace; margin-left: 0.5px;"></span>
	</div>
	`;

	const dotsEl = document.getElementById("dots-loading-claim");
	let dotCount = 0;
	const maxDots = 3;
	const intervalId = setInterval(() => {
	dotCount = (dotCount + 1) % (maxDots + 1);
	dotsEl.textContent = ".".repeat(dotCount);
	}, 400);

	try {
	const tx = await claimContract.claim();
	await tx.wait();
	clearInterval(intervalId);

	const rawAmount = await claimContract.CLAIM_AMOUNT();
	const amount = parseFloat(ethers.utils.formatUnits(rawAmount, 18));

	claimBtn.innerHTML = `
	<span class="fade-icon small">
	<i class="fas fa-check-circle"></i>
	</span>
`;
	closeBtn.disabled = false;

	setTimeout(() => {
		hideModal("claimPopup");

		showFlyUpBalance(amount);
		refreshUI();
	}, 2000);

	showTxBarNotification("success", tx.hash, "Claim token");

	} catch (err) {
	clearInterval(intervalId);
	console.error(err);

	claimBtn.innerHTML = `
		<span class="fade-icon small">
		<i class="fas fa-times-circle"></i>
		</span>
	`;

	setTimeout(() => {
		claimBtn.innerHTML = originalText;
		claimBtn.disabled = false;
		closeBtn.disabled = false;
	}, 2000);

	showTxBarNotification("error", "", "Claim token");
  }
});

	let loadingInterval;
	const dotStates = ['.', '..', '...', ''];
	let dotIndex = 0;
	const setButtonLoading = (text) => {
		const textSpan = document.createElement("span");
		textSpan.style.color = "white";
		const wrapper = document.createElement("div");
		wrapper.style.display = "flex";
		wrapper.style.alignItems = "center";
		wrapper.style.justifyContent = "center";
		wrapper.style.width = "100%";
		wrapper.style.height = "100%";
		const inner = document.createElement("div");
		inner.style.minWidth = "100px";
		inner.style.textAlign = "center";
		inner.appendChild(textSpan);
		wrapper.appendChild(inner);
		button.innerHTML = "";
		button.appendChild(wrapper);
		button.disabled = true;
		loadingInterval = setInterval(() => {
			const dots = dotStates[dotIndex];
			const invisiblePadding = '\u00A0'.repeat(3 - dots.length);
			textSpan.innerText = `${text}${dots}${invisiblePadding}`;
			dotIndex = (dotIndex + 1) % dotStates.length;
		}, 500);
	};

	if (isSigning && window.ethereum) {
		setButtonLoading("Connecting");
	}
	const autoConnect = !isDisconnected && window.ethereum && window.ethereum.selectedAddress;
	if (autoConnect) {
		try {
			await switchToMonad();
			const provider = new ethers.providers.Web3Provider(window.ethereum);
			signer = provider.getSigner();
			userAddress = await signer.getAddress();
			currentProvider = provider;
			isConnected = true;
			if (loadingInterval) clearInterval(loadingInterval);
			clearConnectButton();
			button.innerHTML = `
	<span id="connectText" style="color: white;"></span>
	<span id="connectIcon" style="margin-left: 6px;"></span>
`;
			const connectText = document.getElementById("connectText");
			const connectIcon = document.getElementById("connectIcon");
			connectText.innerText = shortWalletText(userAddress);
			connectIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"
	fill="none"
	viewBox="0 0 24 24"
	stroke-width="2"
	stroke="white"
	style="width: 18px; height: 18px;">
	<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7" />
</svg>`;
			fadeToUserInfo();
			await loadContracts();
			await loadInfo();
			enableActionButtons();
			loopReward();
		} catch (err) {
			console.warn("Auto-connect failed:", err);
		}
	} else {
		if (loadingInterval) clearInterval(loadingInterval);
		connectText.innerText = "Connect Wallet";
		connectIcon.innerHTML = "";
		button.disabled = false;
		await loadContracts();
	}
	await updateVaultPublicStats();
	setInterval(updateVaultPublicStats, 1500);
	window.addEventListener("beforeunload", () => {
		isPageUnloading = true;
	});
	window.addEventListener("unload", () => {
		setTimeout(() => {
			if (!isPageUnloading) {
				localStorage.removeItem("isSigning");
			}
		}, 500);
	});
});

async function refreshUI() {
	try {
		await loadInfo();
		await loadContracts();
		enableActionButtons();
	} catch (error) {
		console.error("Refresh UI failed:", error);
	}
}

async function refreshContracts() {
	try {
		await loadInfo();
		await loadContracts();
		updateClaimSupplyInfo();
	} catch (error) {
		console.error("Refresh contracts failed:", error);
	}
}

function resetUI() {
	document.getElementById("balance").textContent = "Loading...";
	document.getElementById("staked").textContent = "Loading...";
	document.getElementById("reward").textContent = "Loading...";

	["stakeBtn", "redeemBtn", "claimBtn"].forEach(id => {
		const btn = document.getElementById(id);
		btn.classList.add("wallet-warning");
	});

	const oldBtn = document.getElementById("openClaimPopup");
	const newBtn = oldBtn.cloneNode(true);
	newBtn.id = "openClaimPopup";
	oldBtn.replaceWith(newBtn);

	newBtn.disabled = false;
	newBtn.addEventListener("click", (e) => {
	e.preventDefault();
	e.stopPropagation();
	showNotification("Wallet not found", "error");
});

	toggleLockVisuals();

	const user = document.getElementById("userInfoSection");
	const guest = document.getElementById("stakeHeaderGuest");
	user.classList.remove("fade-in");
	user.classList.add("fade-out");
	guest.classList.remove("fade-out");
	guest.classList.add("fade-in");
}

function enableActionButtons() {
	["stakeBtn", "redeemBtn", "claimBtn"].forEach(id => {
		const btn = document.getElementById(id);
		btn.classList.remove("wallet-warning");
		btn.disabled = false;
		btn.classList.remove("locked");
	});

	const oldBtn = document.getElementById("openClaimPopup");
	const newBtn = oldBtn.cloneNode(true);
	newBtn.id = "openClaimPopup";
	oldBtn.replaceWith(newBtn);

	newBtn.disabled = false;
	newBtn.addEventListener("click", async (e) => {
	e.preventDefault();
	e.stopPropagation();
	await updateClaimSupplyInfo();
	const modal = document.getElementById("claimPopup");
	modal.style.display = "flex";
	showModal("claimPopup");
});

	toggleLockVisuals();
}

document.getElementById("connectButton").addEventListener("click", async () => {
	const button = document.getElementById("connectButton");
	let loadingInterval;
	if (!isConnected) {
		try {
			localStorage.setItem("isSigning", "true");
			button.disabled = true;
			clearConnectButton();
			const connectText = document.getElementById("connectText");
			const connectIcon = document.getElementById("connectIcon");
			connectText.innerText = "Connecting";
			connectIcon.innerHTML = "";
			const dotStates = ['.', '..', '...', ''];
			let dotIndex = 0;
			loadingInterval = setInterval(() => {
				const dots = dotStates[dotIndex];
				const invisiblePadding = '\u00A0'.repeat(3 - dots.length);
				connectText.innerText = `Connecting${dots}${invisiblePadding}`;
				dotIndex = (dotIndex + 1) % dotStates.length;
			}, 500);
			if (typeof window.ethereum !== "undefined") {
				await switchToMonad();
				const provider = new ethers.providers.Web3Provider(window.ethereum);
				await provider.send("eth_requestAccounts", []);
				signer = provider.getSigner();
				currentProvider = provider;
			} else {
				clearInterval(loadingInterval);
				showNotificationWallet("No wallet detected, please install Web3 Wallet", "error");
				return;
			}
			const message = "Sign the message to proceed with Monthera Vault";
			await signer.signMessage(message);
			userAddress = await signer.getAddress();
			isConnected = true;
			localStorage.removeItem("isSigning");
			localStorage.removeItem("isDisconnected");
			clearInterval(loadingInterval);
			clearConnectButton();
			button.innerHTML = `
		<span id="connectText" style="color: white;">${shortWalletText(userAddress)}</span>
		<span id="connectIcon" style="margin-left: 6px;">
		<svg xmlns="http://www.w3.org/2000/svg"
		fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="white"
		style="width: 18px; height: 18px;">
		<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7" />
		</svg>
		</span>
		`;
			fadeToUserInfo();
			await loadContracts();
			await loadInfo();
			loopReward();
			enableActionButtons();
			showNotification("Connected", "success");
			document.getElementById("stakeAmount").value = "";
			resetStakeInputStyle();
		} catch (err) {
			clearInterval(loadingInterval);
			localStorage.removeItem("isSigning");
			const connectText = document.getElementById("connectText");
			const connectIcon = document.getElementById("connectIcon");
			connectText.innerText = "Connect Wallet";
			connectIcon.innerHTML = "";
			console.error("Failed to connect wallet:", err);
			showNotification("Connection failed", "error");
		} finally {
			button.disabled = false;
		}
	} else {
		try {
			button.disabled = true;
			clearConnectButton();
			const connectText = document.getElementById("connectText");
			const connectIcon = document.getElementById("connectIcon");
			connectText.innerText = "Disconnecting";
			connectIcon.innerHTML = "";
			const dotStates = ['.', '..', '...', ''];
			let dotIndex = 0;
			loadingInterval = setInterval(() => {
				const dots = dotStates[dotIndex];
				const invisiblePadding = '\u00A0'.repeat(3 - dots.length);
				connectText.innerText = `Disconnecting${dots}${invisiblePadding}`;
				dotIndex = (dotIndex + 1) % dotStates.length;
			}, 500);
			isConnected = false;
			currentProvider = null;
			signer = null;
			userAddress = null;
			localStorage.setItem("isDisconnected", "true");
			window.currentUserTokenBalance = 0;
			window.currentUserStakeBalance = 0;
			resetUI();
			await new Promise(resolve => setTimeout(resolve, 500));
			showNotification("Disconnected", "error");
			document.getElementById("stakeAmount").value = "";
			resetStakeInputStyle();
			resetUI();
		} catch (err) {
			console.error("Disconnect failed:", err);
			showNotification("Disconnect failed", "error");
		} finally {
			clearInterval(loadingInterval);
			clearConnectButton();
			const connectText = document.getElementById("connectText");
			const connectIcon = document.getElementById("connectIcon");
			connectText.innerText = "Connect Wallet";
			connectIcon.innerHTML = "";
			button.disabled = false;
		}
	}
});

async function updateRewardLoop() {
	if (!vaultContractPublic || !userAddress) return;
	try {
		const earned = await Promise.race([
			vaultContractPublic.earned(userAddress),
			timeout(2100)
		]);
		const formatted = parseFloat(ethers.utils.formatUnits(earned));
		const el = document.getElementById("reward");
		if (el) {
			const formattedText = formatted.toLocaleString('en-US', {
				minimumFractionDigits: 4,
				maximumFractionDigits: 4
			}) + " $MTHR";
			const current = parseFloat(el.textContent.replace(/[^\d.-]/g, ''));
			if (!isNaN(current) && Math.abs(current - formatted) < 0.00005) {
				return;
			}
			el.textContent = formattedText;
		}
	} catch (err) {
		console.warn("updateRewardLoop timeout or error", err.message || err);
	}
}

async function loadContracts() {
	const vaultAbi = await fetch("abi/MontheraVaultStakingABI.json").then(res => res.json());
	const tokenAbi = await fetch("abi/MontheraTokenABI.json").then(res => res.json());
	const claimAbi = await fetch("abi/MontheraTokenClaimABI.json").then(res => res.json());
	vaultContract = new ethers.Contract(VAULT_ADDRESS, vaultAbi, signer);
	tokenContract = new ethers.Contract(TOKEN_ADDRESS, tokenAbi, signer);
	claimContract = new ethers.Contract(CLAIM_ADDRESS, claimAbi, signer);
	vaultContractPublic = new ethers.Contract(VAULT_ADDRESS, vaultAbi, publicProvider);
}
async function updateVaultPublicStats() {
	try {
		if (!vaultContractPublic) return;
		const [rewardPoolBalance, totalAssets, totalSupply, estimatedAPR] = await Promise.all([
			vaultContractPublic.rewardPoolBalance(),
			vaultContractPublic.totalAssets(),
			vaultContractPublic.totalSupply(),
			vaultContractPublic.estimatedAPR()
		]);
		document.getElementById("vaultRewardPool").textContent =
			Math.ceil(parseFloat(ethers.utils.formatUnits(rewardPoolBalance, 18)))
			.toLocaleString('en-US', {
				maximumFractionDigits: 0
			}) + " ";
		document.getElementById("vaultTotalAssets").textContent =
			Math.ceil(parseFloat(ethers.utils.formatUnits(totalAssets, 18)))
			.toLocaleString('en-US', {
				maximumFractionDigits: 0
			}) + " ";
		document.getElementById("vaultAPR").textContent =
			(estimatedAPR.toNumber() / 100).toFixed(2) + "%";
		document.getElementById("vaultTotalMint").textContent =
			Math.ceil(parseFloat(ethers.utils.formatUnits(totalSupply, 18)))
			.toLocaleString('en-US', {
				maximumFractionDigits: 0
			}) + " ";
	} catch (err) {
		console.error("Load public statistic failed:", err);
	}
}

async function loadInfo() {
	try {
		const balance = await tokenContract.balanceOf(userAddress);
		const staked = await vaultContract.balanceOf(userAddress);
		const reward = await vaultContract.earned(userAddress);
		const balanceVal = parseFloat(ethers.utils.formatUnits(balance, 18));
		window.currentUserTokenBalance = balanceVal;
		const balanceFloored = Math.floor(balanceVal * 100) / 100;
		document.getElementById("balance").textContent =
			balanceFloored.toLocaleString('en-US', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}) + " $MTHR";
		const stakedVal = parseFloat(ethers.utils.formatUnits(staked, 18));
		const stakedFloored = Math.floor(stakedVal * 100) / 100;
		document.getElementById("staked").textContent =
			stakedFloored.toLocaleString('en-US', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}) + " $sMTHR";
		const rewardVal = parseFloat(ethers.utils.formatUnits(reward, 18));
		document.getElementById("reward").textContent =
			rewardVal.toLocaleString('en-US', {
				minimumFractionDigits: 4,
				maximumFractionDigits: 4
			}) + " $MTHR";
			window.currentPendingReward = rewardVal;
		document.getElementById("userInfoSection").style.display = "block";
		const vaultBalanceInfo = document.getElementById("vaultBalanceInfo");
		if (vaultBalanceInfo) {
			vaultBalanceInfo.textContent = `${stakedFloored.toLocaleString('en-US', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
	})} $sMTHR`;
		}
		window.currentUserStakeBalance = stakedVal;
	} catch (err) {
		console.error("loadInfo failed:", err);
		document.getElementById("balance").textContent = "Loading...";
		document.getElementById("staked").textContent = "Loading...";
		document.getElementById("reward").textContent = "Loading...";
	}
}

async function updateClaimSupplyInfo() {
	try {
		const available = await tokenContract.balanceOf(CLAIM_ADDRESS);
		const availableFormatted = parseFloat(ethers.utils.formatUnits(available, 18)).toLocaleString();
		document.getElementById("claimAvailableInfo").textContent = `${availableFormatted} $MTHR`;

		if (!userAddress) {
			document.getElementById("userClaimInfo").textContent = "0.00 $MTHR";
		return;
	}

	const isClaimed = await claimContract.claimed(userAddress);
	const claimBtn = document.getElementById("tokenClaimBtn");

	if (isClaimed) {
	document.getElementById("userClaimInfo").textContent = `0.00 $MTHR`;
	claimBtn.innerHTML = `<span>Claimed</span>`;
	claimBtn.classList.add("btn-disabled-faded");
	claimBtn.disabled = true;
	} else {
		const claimAmount = await claimContract.CLAIM_AMOUNT();
		const formatted = parseFloat(ethers.utils.formatUnits(claimAmount, 18)).toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});

		document.getElementById("userClaimInfo").textContent = `${formatted} $MTHR`;
		claimBtn.innerHTML = `Claim`;
		claimBtn.classList.remove("btn-disabled-faded");
		claimBtn.disabled = false;
		}
	} catch (err) {
	console.error("loadclaiminfo failed:", err);
	document.getElementById("claimAvailableInfo").textContent = "N/A";
	document.getElementById("userClaimInfo").textContent = "N/A";
	}
}

async function stake() {
	const inputRaw = document.getElementById("stakeAmount").value;
	if (!inputRaw || isNaN(inputRaw) || parseFloat(inputRaw) <= 0) {
		alert("Invalid stake amount");
		return;
	}
	const amount = ethers.utils.parseUnits(inputRaw, 18);
	try {
		const allowance = await tokenContract.allowance(userAddress, VAULT_ADDRESS);
		if (allowance.lt(amount)) {
			const tx1 = await tokenContract.approve(VAULT_ADDRESS, amount);
			await tx1.wait();
		}
		const tx2 = await vaultContract.deposit(amount, userAddress);
		await tx2.wait();
		alert("Deposit successful");
		await loadInfo();
	} catch (err) {
		console.error("Deposit error:", err);
		alert("Deposit failed: " + err.message);
	}
}

let redeemInputValue = "";

document.getElementById("redeemBtn").addEventListener("click", () => {
	const redeemBtn = document.getElementById("redeemBtn");
	blockInteraction(750);
	if (!userAddress) {
		showNotification("Wallet not found", "error");
		redeemBtn.classList.add("wallet-warning");
		return;
	} else {
		redeemBtn.classList.remove("wallet-warning");
	}
	const input = document.getElementById("redeemVaultInput");
	input.value = "";
	input.style.border = "1px solid #ccc";
	input.style.color = "";
	userShares = parseFloat(window.currentUserStakeBalance || 0);
	userBalance = parseFloat(window.currentUserTokenBalance || 0);
	document.getElementById("vaultBalanceInfo").textContent = userShares.toFixed(2);
	document.getElementById("vaultBalanceAmount").textContent = userBalance.toFixed(2);
	updateRedeemPreview();
	const modal = document.getElementById("redeemStep1");
	modal.style.display = "flex";
	showModal("redeemStep1");
});

	document.getElementById("closeRedeemPopup").addEventListener("click", () => {
	hideModal("redeemStep1");
	resetRedeemInputUI();
});

	let redeemInputErrorTimeout = null;

	const redeemInputEl = document.getElementById("redeemVaultInput");
	const vaultBalanceEl = document.getElementById("vaultBalanceInfo");

	redeemInputEl.addEventListener("input", () => {
	const current = parseFloat(redeemInputEl.value);
	const max = parseFloat((vaultBalanceEl.textContent || "0").replace(/,/g, ''));
	if (!isNaN(current) && !isNaN(max) && current > max) {
		redeemInputEl.style.border = "2px solid red";
		redeemInputEl.style.color = "red";
		if (!redeemInputErrorTimeout) {
			if (document.activeElement === redeemInputEl) {
				redeemInputEl.style.transition = "transform 0.1s";
				redeemInputEl.style.transform = "translateX(-4px)";
				setTimeout(() => redeemInputEl.style.transform = "translateX(4px)", 100);
				setTimeout(() => redeemInputEl.style.transform = "translateX(-2px)", 200);
				setTimeout(() => redeemInputEl.style.transform = "translateX(2px)", 300);
				setTimeout(() => redeemInputEl.style.transform = "translateX(0)", 400);
				redeemInputErrorTimeout = setTimeout(() => {
					redeemInputErrorTimeout = null;
				}, 2000);
			}
		}
	} else {
		redeemInputEl.style.border = "1px solid #ccc";
		redeemInputEl.style.color = "";
		if (redeemInputErrorTimeout) {
			clearTimeout(redeemInputErrorTimeout);
			redeemInputErrorTimeout = null;
		}
	}
	updateRedeemPreview();
});

document.getElementById("nextRedeemBtn").addEventListener("click", async () => {
	const inputEl = document.getElementById("redeemVaultInput");
	const rawInput = inputEl.value.trim();
	const inputValue = parseFloat(rawInput);
	const vaultBalance = parseFloat(window.currentUserStakeBalance || 0);
	if (!rawInput || isNaN(inputValue) || inputValue <= 0) {
		updateRedeemPreview(true);
		triggerInputError(inputEl, true);
		return;
	}
	if (inputValue > vaultBalance) {
		triggerInputError(inputEl, true);
		updateRedeemPreview(true);
		showNotification("Insufficient balance", "error");
		return;
	}
	inputEl.style.border = "1px solid #ccc";
	inputEl.style.color = "";
	if (window.redeemInputErrorTimeout) {
		clearTimeout(window.redeemInputErrorTimeout);
		window.redeemInputErrorTimeout = null;
	}
	redeemInputValue = rawInput;
	document.getElementById("redeemBurningValue").textContent = `${parseFloat(rawInput).toLocaleString()} $sMTHR`;
	try {
		const parsedInput = ethers.utils.parseUnits(rawInput, 18);
		const estimated = await vaultContract.previewRedeem(parsedInput);
		const formatted = parseFloat(ethers.utils.formatUnits(estimated, 18));
		document.getElementById("redeemEstimateValue").textContent = `${formatted.toLocaleString()} $MTHR`;
	} catch (err) {
		document.getElementById("redeemEstimateValue").textContent = "Estimated Failed";
		console.error("Estimated failed:", err);
	}
	blockInteraction(750);
	hideModal("redeemStep1", () => {
		const step2 = document.getElementById("redeemStep2");
		step2.style.display = "flex";
		showModal("redeemStep2");
	});
});

document.getElementById("cancelRedeemBackBtn").addEventListener("click", () => {
	blockInteraction(750);
	hideModal("redeemStep2", () => {
		const step1 = document.getElementById("redeemStep1");
		step1.style.display = "flex";
		showModal("redeemStep1");
	});
});

document.getElementById("confirmRedeemFinalBtn").addEventListener("click", async () => {
	const confirmBtn = document.getElementById("confirmRedeemFinalBtn");
	const cancelBtn = document.getElementById("cancelRedeemBackBtn");
	const originalText = confirmBtn.innerHTML;
	confirmBtn.disabled = true;
	cancelBtn.disabled = true;
	confirmBtn.innerHTML = `
	<div style="display: flex; justify-content: center; align-items: center; width: 100%;">
	<span>Processing</span>
	<span id="dots-loading-redeem" style="display: inline-block; width: 1ch; font-family: monospace; margin-left: 0.5px;"></span>
	</div>
	`;
	const dotsEl = document.getElementById("dots-loading-redeem");
	let dotCount = 0;
	const maxDots = 3;
	const intervalId = setInterval(() => {
		dotCount = (dotCount + 1) % (maxDots + 1);
		dotsEl.textContent = ".".repeat(dotCount);
	}, 400);
	try {
		await new Promise(resolve => setTimeout(resolve, 2000));
		const amount = ethers.utils.parseUnits(redeemInputValue, 18);
		const tx = await vaultContract.redeem(amount, userAddress, userAddress);
		await tx.wait();
		clearInterval(intervalId);
		confirmBtn.innerHTML = `
	<span class="fade-icon small">
	<i class="fas fa-check-circle"></i>
	</span>
	`;
		setTimeout(async () => {
			confirmBtn.innerHTML = originalText;
			confirmBtn.disabled = false;
			cancelBtn.disabled = false;
			document.getElementById("redeemStep2").style.display = "none";
			showTxBarNotification("success", tx.hash, "redeem");
			document.getElementById("stakeAmount").value = "";
			showFlyDownStaked(parseFloat(redeemInputValue));
			showFlyUpBalance(parseFloat(redeemInputValue));
			await refreshUI();
		}, 2000);
	} catch (err) {
		clearInterval(intervalId);
		confirmBtn.innerHTML = `
	<span class="fade-icon small">
	<i class="fas fa-times-circle"></i>
	</span>
	`;
		console.error("Redeem failed:", err);
		showTxBarNotification("error", "", "redeem");
		setTimeout(() => {
			confirmBtn.innerHTML = originalText;
			confirmBtn.disabled = false;
			cancelBtn.disabled = false;
		}, 2000);
	}
});

let isClaiming = false;

async function claim() {
	const claimBtn = document.getElementById("claimBtn");
	const stakeBtn = document.getElementById("stakeBtn");
	const redeemBtn = document.getElementById("redeemBtn");
	const originalText = claimBtn.innerHTML;

	if (isClaiming) return;

	if (!userAddress) {
		showNotification("Wallet not found", "error");
		claimBtn.classList.add("wallet-warning");
		return;
	} else {
		claimBtn.classList.remove("wallet-warning");
	}

	let rewardAmount = typeof window.currentPendingReward === "number" ? window.currentPendingReward : null;

	if (rewardAmount === null) {
		const earned = await vaultContractPublic.earned(userAddress);
		rewardAmount = parseFloat(ethers.utils.formatUnits(earned, 18));
	}

	if (rewardAmount <= 0) {
		showNotification("Insufficient balance", "error");
		return;
	}

	let intervalId = null;
	let showIconSuccess = false;
	let txSubmitted = false;
	isClaiming = true;

	try {
		claimBtn.disabled = true;
		stakeBtn.disabled = true;
		redeemBtn.disabled = true;
		claimBtn.innerHTML = `
			<div style="display: flex; justify-content: center; align-items: center; width: 100%;">
				<span>Processing</span>
				<span id="dots-loading" style="display: inline-block; width: 1ch; font-family: monospace; margin-left: 0.5px;"></span>
			</div>
		`;

		const dotsEl = document.getElementById("dots-loading");
		let dotCount = 0;
		const maxDots = 3;
		intervalId = setInterval(() => {
			dotCount = (dotCount + 1) % (maxDots + 1);
			dotsEl.textContent = ".".repeat(dotCount);
		}, 400);

		const tx = await vaultContract.claimReward();
		txSubmitted = true;

		await tx.wait();
		clearInterval(intervalId);

		claimBtn.innerHTML = `
			<span class="fade-icon small">
				<i class="fas fa-check-circle"></i>
			</span>
		`;
		showIconSuccess = true;
		showFlyUpBalance(rewardAmount);
		showFlyDownReward(rewardAmount);
		showTxBarNotification("success", tx.hash, "claim");
		await refreshUI();

	} catch (err) {
		console.warn("Claim error:", err.message || err);
		if (intervalId) clearInterval(intervalId);

		claimBtn.innerHTML = `
			<span class="fade-icon small">
				<i class="fas fa-times-circle"></i>
			</span>
		`;

		if (txSubmitted || err.code === 4001) {
			showTxBarNotification("error", "", "claim");
		}
	} finally {
		const resetTimeout = showIconSuccess ? 2000 : 2000;
		setTimeout(() => {
	claimBtn.innerHTML = originalText;
	claimBtn.disabled = false;
	stakeBtn.disabled = false;
	redeemBtn.disabled = false;
	isClaiming = false;

	claimBtn.blur();
	document.activeElement?.blur();
	const evt = new MouseEvent("mouseup", { bubbles: true });
	claimBtn.dispatchEvent(evt);
}, resetTimeout);
	}
}

function toggleLockVisuals() {
	const elements = [
		document.getElementById("stakeBtn"),
		document.getElementById("redeemBtn"),
		document.getElementById("claimBtn"),
		document.getElementById("stakeAmount")
	];
	elements.forEach(el => {
		if (!el) return;
		if (el.disabled) {
			el.classList.add("locked");
		} else {
			el.classList.remove("locked");
		}
	});
}

function resetStakeInputStyle() {
	const stakeInput = document.getElementById("stakeAmount");
	if (stakeInput) {
		stakeInput.style.border = "1px solid #ccc";
		stakeInput.style.color = "";
		stakeInput.style.transform = "translateX(0)";
	}
}

function showFlyUpBalance(amount) {
	const flyup = document.getElementById("balance-flyup");
	flyup.textContent = `+${amount.toLocaleString()}`;
	flyup.classList.add("show");
	setTimeout(() => {
		flyup.classList.remove("show");
		setTimeout(() => {
			flyup.textContent = "";
		}, 1500);
	}, 1500);
}

function showFlyDownBalance(amount) {
	const flydown = document.getElementById("balance-flydown");
	flydown.textContent = `-${amount.toLocaleString()}`;
	flydown.classList.add("show");
	setTimeout(() => {
		flydown.classList.remove("show");
		setTimeout(() => {
			flydown.textContent = "";
		}, 1500);
	}, 1500);
}

function showFlyUpShared(amount) {
	const flyup = document.getElementById("shared-flyup");
	flyup.textContent = `+${amount.toLocaleString()}`;
	flyup.classList.add("show");
	setTimeout(() => {
		flyup.classList.remove("show");
		setTimeout(() => {
			flyup.textContent = "";
		}, 1500);
	}, 1500);
}

function showFlyDownStaked(amount) {
	const flydown = document.getElementById("shared-flydown");
	flydown.textContent = `-${amount.toLocaleString()}`;
	flydown.classList.add("show");
	setTimeout(() => {
		flydown.classList.remove("show");
		setTimeout(() => {
			flydown.textContent = "";
		}, 1500);
	}, 1500);
}

function showFlyDownReward(amount) {
	const flydown = document.getElementById("reward-flydown");
	flydown.textContent = `-${amount.toLocaleString()}`;
	flydown.classList.add("show");
	setTimeout(() => {
		flydown.classList.remove("show");
		setTimeout(() => {
			flydown.textContent = "";
		}, 1500);
	}, 1500);
}

function animateDots() {
	const dotsContainer = button.querySelector('.dots');
	const dots = dotsContainer.querySelectorAll('span');
	let active = 0;
	clearInterval(button.dotInterval);
	dots.forEach(dot => dot.style.visibility = 'hidden');
	button.dotInterval = setInterval(() => {
		dots.forEach((dot, index) => {
			dot.style.visibility = index <= active ? 'visible' : 'hidden';
		});
		active = (active + 1) % dots.length;
	}, 500);
}

function showNotification(message, type = "success") {
	const notif = document.getElementById("notification");
	notif.textContent = message;
	notif.className = `fixed top-4 left-4 z-50 text-sm ${type} visible`;
	setTimeout(() => {
		notif.classList.remove("visible");
	}, 2000);
}

function showNotificationWallet(message, type = "success") {
	const notif = document.getElementById("notification-wallet");
	notif.textContent = message;
	notif.className = `z-50 text-sm ${type} visible`;
	setTimeout(() => {
		notif.classList.remove("visible");
	}, 2000);
}

function showTxBarNotification(status = "success", txHash = "", type = "") {
	const bar = document.getElementById("txNotificationBar");
	const statusText = document.getElementById("txNotifStatus");
	const link = document.getElementById("txNotifLink");
	bar.classList.remove("success", "error");
	const typeFormatted = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
	if (status === "success") {
		statusText.textContent = type ? `${typeFormatted} successful` : `Transaction successful`;
		bar.classList.add("success");
	} else if (status === "error") {
		statusText.textContent = type ? `${typeFormatted} failed` : `Transaction failed`;
		bar.classList.add("error");
	} else {
		return;
	}
	if (txHash) {
		link.href = `https://testnet.monadexplorer.com/tx/${txHash}`;
		link.style.display = "inline";
	} else {
		link.style.display = "none";
	}
	bar.style.top = "0";
	setTimeout(() => {
		bar.style.top = "-100px";
	}, 7000);
}

async function updateRewardRateUI() {
	try {
		const rewardRate = await vaultContractPublic.rewardRate();
		const rewardRateFormatted = parseFloat(ethers.utils.formatUnits(rewardRate, 18))
			.toLocaleString('en-US', {
				minimumFractionDigits: 4,
				maximumFractionDigits: 4
			});
		document.getElementById("previewDepositRewardRate").textContent = `${rewardRateFormatted}`;
	} catch (err) {
		console.error("Failed to load rewardRate:", err);
		document.getElementById("previewDepositRewardRate").textContent = "N/A";
	}
}

function clearConnectButton() {
	const button = document.getElementById("connectButton");
	button.innerHTML = `
	<span id="connectText">Connect Wallet</span>
	<span id="connectIcon"></span>
	`;
}

function fillDepositPercentage(pct) {
	if (!userAddress) {
		showNotification("Wallet not found", "error");
		return;
	}
	const tokenBalance = window.currentUserTokenBalance || 0;
	if (tokenBalance <= 0) {
		showNotification("Insufficient balance", "error");
		return;
	}
	const rawValue = tokenBalance * (pct / 100);
	const floored = Math.floor(rawValue * 100) / 100;
	const input = document.getElementById("stakeAmount");
	if (input) {
		input.value = floored.toFixed(2);
		input.style.border = "1px solid #ccc";
		input.style.color = "";
		if (window.stakeInputErrorTimeout) {
			clearTimeout(window.stakeInputErrorTimeout);
			window.stakeInputErrorTimeout = null;
		}
	}
}

function fillPercentage(pct) {
	const maxShares = parseFloat(window.currentUserStakeBalance || 0);
	if (isNaN(maxShares) || maxShares <= 0) {
		showNotification("Insufficient shares", "error");
		return;
	}
	const input = document.getElementById("redeemVaultInput");
	if (!input) {
		showNotification("Redeem input field not found.", "error");
		return;
	}
	const rawAmount = (maxShares * pct) / 100;
	const flooredAmount = Math.floor(rawAmount * 100) / 100;
	input.value = flooredAmount.toFixed(2);
	input.style.border = "1px solid #ccc";
	input.style.color = "";
	if (window.redeemInputErrorTimeout) {
		clearTimeout(window.redeemInputErrorTimeout);
		window.redeemInputErrorTimeout = null;
	}
	const event = new Event("input", {
		bubbles: true
	});
	input.dispatchEvent(event);
}

function showModal(modalId) {
	const modal = document.getElementById(modalId);
	const content = modal.querySelector('.modal-content');
	modal.style.display = 'flex';
	content.classList.remove('fade-out');
	content.classList.add('fade-in');
	modal.classList.add('show');
	updateRedeemPreview();
}

function hideModal(modalId, callback) {
	const modal = document.getElementById(modalId);
	const content = modal.querySelector('.modal-content');
	content.classList.remove('fade-in');
	content.classList.add('fade-out');
	content.addEventListener('animationend', () => {
		modal.style.display = 'none';
		content.classList.remove('fade-out');
		if (typeof callback === 'function') {
			callback();
		}
	}, {
		once: true
	});
	modal.classList.remove('show');
}

document.getElementById("stakeBtn").addEventListener("click", async () => {
	const stakeBtn = document.getElementById("stakeBtn");
	blockInteraction(750);
	if (!userAddress) {
		showNotification("Wallet not found", "error");
		stakeBtn.classList.add("wallet-warning");
		return;
	} else {
		stakeBtn.classList.remove("wallet-warning");
	}
	const stakeInput = document.getElementById("stakeAmount");
	const inputRaw = stakeInput?.value;
	const inputValue = parseFloat(inputRaw);
	const userBalance = parseFloat(window.currentUserTokenBalance || 0);
	if (!inputRaw || isNaN(inputValue) || inputValue <= 0) {
		if (stakeInputErrorTimeout) {
			clearTimeout(stakeInputErrorTimeout);
		}
		const originalBorder = "1px solid #ccc";
		const originalColor = "";
		stakeInput.style.border = "2px solid red";
		stakeInput.style.color = "red";
		stakeInput.style.transition = "transform 0.1s";
		stakeInput.style.transform = "translateX(-4px)";
		setTimeout(() => stakeInput.style.transform = "translateX(4px)", 100);
		setTimeout(() => stakeInput.style.transform = "translateX(-2px)", 200);
		setTimeout(() => stakeInput.style.transform = "translateX(2px)", 300);
		setTimeout(() => stakeInput.style.transform = "translateX(0)", 400);
		stakeInputErrorTimeout = setTimeout(() => {
			stakeInput.style.border = originalBorder;
			stakeInput.style.color = originalColor;
			stakeInputErrorTimeout = null;
		}, 2000);
		return;
	}
	if (inputValue > userBalance) {
		showNotification("Insufficient balance", "error");
		return;
	}
	const amount = ethers.utils.parseUnits(inputRaw, 18);
	try {
		const previewShares = await vaultContract.previewDeposit(amount);
		const apr = await vaultContract.estimatedAPR();
		const rewardRate = await vaultContract.rewardRate();
		const rewardRateFormatted = parseFloat(ethers.utils.formatUnits(rewardRate, 18))
			.toLocaleString('en-US', {
				minimumFractionDigits: 4,
				maximumFractionDigits: 4
			});
		document.getElementById("previewDepositAmount").textContent = parseFloat(inputRaw)
			.toLocaleString(undefined, {
				maximumFractionDigits: 6
			});
		document.getElementById("previewDepositShares").textContent = parseFloat(ethers.utils.formatUnits(previewShares, 18))
			.toLocaleString(undefined, {
				maximumFractionDigits: 6
			});
		document.getElementById("previewDepositAPR").textContent = (parseFloat(apr) / 100).toFixed(2);
		document.getElementById("previewDepositRewardRate").textContent = `${rewardRateFormatted}`;
		showModal("previewDepositModal");
	} catch (err) {
		console.error("Calculate preview deposit failed:", err);
		alert("Estimated deposit failed: " + err.message);
	}
});

document.getElementById("cancelDepositBtn").addEventListener("click", () => {
	hideModal("previewDepositModal");
});

document.getElementById("confirmDepositBtn").addEventListener("click", async () => {
	const amountRaw = document.getElementById("stakeAmount").value;
	const amount = ethers.utils.parseUnits(amountRaw, 18);
	const confirmBtn = document.getElementById("confirmDepositBtn");
	const cancelBtn = document.getElementById("cancelDepositBtn");
	const originalText = confirmBtn.innerHTML;
	confirmBtn.disabled = true;
	cancelBtn.disabled = true;
	confirmBtn.innerHTML = `
	<div style="display: flex; justify-content: center; align-items: center; width: 100%;">
	<span>Processing</span>
	<span id="dots-loading-deposit" style="display: inline-block; width: 1ch; font-family: monospace; margin-left: 0.5px;"></span>
	</div>
	`;
	const dotsEl = document.getElementById("dots-loading-deposit");
	let dotCount = 0;
	const maxDots = 3;
	const intervalId = setInterval(() => {
		dotCount = (dotCount + 1) % (maxDots + 1);
		dotsEl.textContent = ".".repeat(dotCount);
	}, 400);
	try {
		await new Promise(resolve => setTimeout(resolve, 2000));
		const allowance = await tokenContract.allowance(userAddress, VAULT_ADDRESS);
		if (allowance.lt(amount)) {
			const approveTx = await tokenContract.approve(VAULT_ADDRESS, amount);
			await approveTx.wait();
		}
		const depositTx = await vaultContract.deposit(amount, userAddress);
		await depositTx.wait();
		clearInterval(intervalId);
		confirmBtn.innerHTML = `
	<span class="fade-icon small">
	<i class="fas fa-check-circle"></i>
	</span>
	`;
		setTimeout(async () => {
			confirmBtn.innerHTML = originalText;
			confirmBtn.disabled = false;
			cancelBtn.disabled = false;
			hideModal("previewDepositModal");
			showTxBarNotification("success", depositTx.hash, "deposit");
			document.getElementById("stakeAmount").value = "";
			showFlyDownBalance(Number(amountRaw));
			showFlyUpShared(Number(amountRaw));
			await refreshUI();
		}, 2000);
	} catch (err) {
		clearInterval(intervalId);
		confirmBtn.innerHTML = `
	<span class="fade-icon small">
	<i class="fas fa-times-circle"></i>
	</span>
	`;
		console.error("Deposit failed:", err);
		showTxBarNotification("error", "", "deposit");
		setTimeout(() => {
			confirmBtn.innerHTML = originalText;
			confirmBtn.disabled = false;
			cancelBtn.disabled = false;
		}, 2000);
	}
});

document.getElementById("claimBtn").addEventListener("click", async () => {
	await claim();
});

function timeout(ms) {
	return new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms));
}

let isLooping = false;

async function loopReward() {
	if (isLooping) return;
	isLooping = true;
	try {
		await updateRewardLoop();
	} catch (err) {
		console.error("loopReward error:", err.message || err);
	} finally {
		isLooping = false;
		setTimeout(() => {
			requestAnimationFrame(loopReward);
		}, 2100);
	}
}

function triggerInputError(inputEl, force = false) {
	const raw = inputEl.value.trim();
	const value = parseFloat(raw);
	const vaultBalance = getParsedVaultBalance();
	const isEmpty = raw === "";
	const isZero = !isNaN(value) && value === 0;
	const isOver = !isNaN(value) && value > vaultBalance;
	const isInvalid = isEmpty || isNaN(value) || isZero || isOver;
	if (!isInvalid && !force) return;
	if (force || isInvalid) {
		inputEl.style.border = "2px solid red";
		inputEl.style.color = "red";
		inputEl.style.transition = "transform 0.1s";
		inputEl.style.transform = "translateX(-4px)";
		setTimeout(() => inputEl.style.transform = "translateX(4px)", 100);
		setTimeout(() => inputEl.style.transform = "translateX(-2px)", 200);
		setTimeout(() => inputEl.style.transform = "translateX(2px)", 300);
		setTimeout(() => inputEl.style.transform = "translateX(0)", 400);
		if (!isOver) {
			if (window.redeemInputErrorTimeout) clearTimeout(window.redeemInputErrorTimeout);
			window.redeemInputErrorTimeout = setTimeout(() => {
				inputEl.style.border = "1px solid #ccc";
				inputEl.style.color = "";
				window.redeemInputErrorTimeout = null;
			}, 2000);
		}
	}
}

function getParsedVaultBalance() {
	const text = document.getElementById("vaultBalanceInfo")?.textContent || "0";
	return parseFloat(text.replace(/,/g, "")) || 0;
}

let userShares = 0;
let userBalance = 0;
let lastValidPreviewShares = null;
let lastValidPreviewBalance = null;

function updateRedeemPreview(force = false) {
	const input = document.getElementById("redeemVaultInput");
	const previewShares = document.getElementById("vaultBalanceInfo");
	const previewBalance = document.getElementById("vaultBalanceAmount");
	const raw = input.value.trim();
	const value = parseFloat(raw);
	const maxShares = parseFloat(window.currentUserStakeBalance || 0);
	const currentBalance = parseFloat(window.currentUserTokenBalance || 0);
	const format = (num) => num.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
	if (raw === "") {
		previewShares.textContent = `${format(maxShares)} $sMTHR`;
		previewBalance.textContent = `${format(currentBalance)} $MTHR`;
		if (!force) {
			input.style.border = "1px solid #ccc";
			input.style.color = "";
		}
		document.getElementById("nextRedeemBtn").setAttribute("data-allow", "false");
		return;
	}
	if (!isNaN(value) && value >= 0 && value <= maxShares) {
		const newShares = maxShares - value;
		const newBalance = currentBalance + value;
		previewShares.textContent = `${format(newShares)} $sMTHR`;
		previewBalance.textContent = `${format(newBalance)} $MTHR`;
		lastValidPreviewShares = `${format(newShares)} $sMTHR`;
		lastValidPreviewBalance = `${format(newBalance)} $MTHR`;
		input.style.border = "1px solid #ccc";
		input.style.color = "";
		document.getElementById("nextRedeemBtn").setAttribute("data-allow", "true");
	} else if (!isNaN(value) && value > maxShares) {
		previewShares.textContent = `0.00 $sMTHR`;
		previewBalance.textContent = `${format(currentBalance + maxShares)} $MTHR`;
		input.style.border = "2px solid red";
		input.style.color = "red";
		document.getElementById("nextRedeemBtn").setAttribute("data-allow", "true");
	} else {
		if (lastValidPreviewShares !== null && lastValidPreviewBalance !== null) {
			previewShares.textContent = lastValidPreviewShares;
			previewBalance.textContent = lastValidPreviewBalance;
		}
		if (!force) {
			input.style.border = "2px solid red";
			input.style.color = "red";
		}
		document.getElementById("nextRedeemBtn").setAttribute("data-allow", "false");
	}
}

function resetRedeemInputUI() {
	const input = document.getElementById("redeemVaultInput");
	input.value = "";
	input.style.border = "1px solid #ccc";
	input.style.color = "";
	document.getElementById("vaultBalanceInfo").textContent = userShares.toFixed(2);
	document.getElementById("vaultBalanceAmount").textContent = userBalance.toFixed(2);
}

const ua = navigator.userAgent.toLowerCase();
const html = document.documentElement;
if (ua.includes("safari") && !ua.includes("chrome")) {
	html.classList.add("safari");
} else if (ua.includes("chrome") && ua.includes("mobile")) {
	html.classList.add("chrome-mobile");
} else if (ua.includes("firefox")) {
	html.classList.add("firefox");
}

function scrollToTopAnimated(duration = 600) {
	const start = document.documentElement.scrollTop || document.body.scrollTop;
	const startTime = performance.now();

	function easeInOutQuad(t) {
		return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
	}

	function animateScroll(currentTime) {
		const elapsed = currentTime - startTime;
		const progress = Math.min(elapsed / duration, 1);
		const ease = easeInOutQuad(progress);
		const newPos = start * (1 - ease);
		window.scrollTo(0, newPos);
		if (progress < 1) {
			requestAnimationFrame(animateScroll);
		}
	}
	requestAnimationFrame(animateScroll);
}
if ('scrollRestoration' in history) {
	history.scrollRestoration = 'manual';
}
window.addEventListener('load', () => {
	setTimeout(() => scrollToTopAnimated(600), 50);
});

const stakeInput = document.getElementById("stakeAmount");

if (stakeInput) {
	stakeInput.addEventListener("focus", () => {
		setTimeout(() => {
			stakeInput.scrollIntoView({
				behavior: "smooth",
				block: "center"
			});
		}, 200);
	});
	stakeInput.addEventListener("blur", () => {
		setTimeout(() => {
			scrollToTopAnimated(100);
		}, 100);
	});
	stakeInput.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			stakeInput.blur();
		}
	});
}

document.addEventListener('copy', function(e) {
	const tag = e.target.tagName.toLowerCase();
	if (tag !== 'input' && tag !== 'textarea') {
		e.preventDefault();
	}
});

document.addEventListener('contextmenu', function(e) {
	const tag = e.target.tagName.toLowerCase();
	if (tag !== 'input' && tag !== 'textarea') {
		e.preventDefault();
	}
});

function blockInteraction(duration = 750) {
	const blocker = document.getElementById("interactionBlocker");
	blocker.style.pointerEvents = "auto";
	blocker.style.opacity = "1";
	setTimeout(() => {
		blocker.style.pointerEvents = "none";
		blocker.style.opacity = "0";
	}, duration);
}

const toggleButton = document.getElementById('toggleSidebar');
const sidebar = document.getElementById('sidebar');

toggleButton.addEventListener('click', (e) => {
	e.stopPropagation();
	sidebar.classList.toggle('show');
});

sidebar.addEventListener('click', (e) => {
	e.stopPropagation();
});

document.addEventListener('click', () => {
	sidebar.classList.remove('show');
});

document.querySelectorAll("button").forEach(btn => {
	btn.addEventListener("mouseup", () => {
	btn.classList.remove("clicked");
	});
	btn.addEventListener("mouseleave", () => {
	btn.classList.remove("clicked");
	});
});

setInterval(() => {
	if (window.ethereum && window.ethereum.selectedAddress) {
		refreshContracts();
	}
}, 1500);