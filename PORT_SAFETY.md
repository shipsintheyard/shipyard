# Port - User Safety Protocol

**CRITICAL**: Port handles user funds. Every swap must be 100% safe.

## Core Safety Principles

### 1. **NEVER Trust User Input**
- Validate all token addresses (checksum, exists on Base)
- Reject tokens not in our verified registry
- Block honeypot/scam tokens automatically

### 2. **Simulate BEFORE Execute**
- **Always** run transaction simulation first
- If simulation fails → BLOCK the swap
- Show user exactly what they'll receive

### 3. **Slippage Protection**
- Calculate expected output amount
- Set minimum output (slippage tolerance)
- **If actual < minimum → transaction reverts automatically**
- Default: 0.5% slippage, max 5%

### 4. **Price Impact Warnings**
```typescript
if (priceImpact > 5%) {
  showWarning("HIGH PRICE IMPACT - Review carefully");
}
if (priceImpact > 15%) {
  blockSwap("EXTREME PRICE IMPACT - Swap blocked for your protection");
}
```

### 5. **Smart Contract Safety**

#### On-Chain Router Contract:
```solidity
contract PortRouter {
    // CRITICAL: Users NEVER approve Port contract directly
    // Port contract holds NO funds
    // Every swap is atomic (succeeds or reverts completely)

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut, // Slippage protection
        address router // Target DEX router
    ) external returns (uint256 amountOut) {
        require(isWhitelisted(router), "Router not approved");
        require(amountOut >= minAmountOut, "Slippage exceeded");

        // Transfer tokens from user
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        // Approve target router
        IERC20(tokenIn).approve(router, amountIn);

        // Execute swap on target router
        amountOut = IRouter(router).swap(...);

        // Verify output amount
        require(amountOut >= minAmountOut, "Output below minimum");

        // Send output directly to user (NOT held in contract)
        IERC20(tokenOut).transfer(msg.sender, amountOut);

        return amountOut;
    }
}
```

**Key Security Features:**
- ✅ No funds stored in contract
- ✅ Atomic execution (all or nothing)
- ✅ Slippage protection built-in
- ✅ Only whitelisted routers
- ✅ User gets tokens directly

### 6. **Frontend Validations**

```typescript
// PRE-FLIGHT CHECKS (before showing swap button)
async function validateSwap(fromToken, toToken, amount) {
  // 1. Token validation
  if (!isVerifiedToken(fromToken)) {
    throw new Error("Token not verified");
  }

  // 2. Liquidity check
  const liquidity = await checkLiquidity(fromToken, toToken);
  if (liquidity < amount * 2) {
    throw new Error("Insufficient liquidity");
  }

  // 3. Get quote
  const quote = await getQuote(fromToken, toToken, amount);

  // 4. Price impact check
  const impact = calculatePriceImpact(quote);
  if (impact > 15) {
    throw new Error("Price impact too high");
  }

  // 5. Simulate transaction
  const simulation = await simulateSwap(...);
  if (!simulation.success) {
    throw new Error(`Simulation failed: ${simulation.error}`);
  }

  return {
    quote,
    impact,
    expectedOutput: simulation.output
  };
}
```

### 7. **Token Whitelist System**

```typescript
// Maintain verified token registry
const VERIFIED_TOKENS = {
  // Major tokens
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',

  // Protocol-specific tokens
  ZORA: '...',
  VIRTUAL: '...',
  // etc.
};

// Check token safety
async function isTokenSafe(address) {
  // 1. In verified list?
  if (VERIFIED_TOKENS[address]) return true;

  // 2. Check GoPlus security API
  const security = await checkSecurity(address);
  if (security.isHoneypot || security.isScam) return false;

  // 3. Check liquidity
  const liquidity = await getLiquidity(address);
  if (liquidity < MIN_LIQUIDITY) return false;

  return true;
}
```

### 8. **MEV Protection**

```typescript
// Use Flashbots/private RPCs for swap submission
const RPC_ENDPOINTS = {
  public: 'https://mainnet.base.org',
  private: 'https://builder.base.org', // Private mempool
};

async function submitSwap(transaction) {
  // Submit via private mempool to avoid frontrunning
  return await sendToBuilder(transaction);
}
```

### 9. **Deadline Protection**

```solidity
// All swaps have deadline (default 20 minutes)
function swap(..., uint256 deadline) external {
    require(block.timestamp <= deadline, "Swap expired");
    // ... swap logic
}
```

### 10. **User Confirmations**

```typescript
// Show clear confirmation modal
function showSwapConfirmation(swap) {
  return (
    <Modal>
      <h3>Confirm Swap</h3>
      <div>
        <strong>You pay:</strong> {swap.amountIn} {swap.tokenIn}
      </div>
      <div>
        <strong>You receive (min):</strong> {swap.minAmountOut} {swap.tokenOut}
      </div>
      <div>
        <strong>Price impact:</strong>
        <span style={{ color: swap.impact > 5 ? 'red' : 'green' }}>
          {swap.impact}%
        </span>
      </div>
      <div>
        <strong>Route:</strong> {swap.router}
      </div>

      {swap.impact > 5 && (
        <Warning>⚠️ HIGH PRICE IMPACT - You may receive less than expected</Warning>
      )}

      <Checkbox required>
        I understand this swap is final and irreversible
      </Checkbox>

      <Button onClick={executeSwap}>Confirm Swap</Button>
    </Modal>
  );
}
```

## Safety Checklist

Before EVERY swap:
- [ ] Token addresses validated
- [ ] Tokens in whitelist OR passed security checks
- [ ] Sufficient liquidity confirmed
- [ ] Price quote fetched from reliable source
- [ ] Price impact calculated and acceptable
- [ ] Slippage tolerance set
- [ ] Transaction simulated successfully
- [ ] Minimum output amount calculated
- [ ] Deadline set (prevent stuck transactions)
- [ ] User confirmed all details
- [ ] Transaction submitted via secure RPC

## Monitoring & Emergency

### Real-time Monitoring:
```typescript
// Track all swaps
async function monitorSwap(txHash) {
  const receipt = await waitForTransaction(txHash);

  if (!receipt.success) {
    // Alert team immediately
    alertTeam(`Swap failed: ${txHash}`);

    // Analyze failure reason
    const reason = await getRevertReason(txHash);

    // Log for investigation
    logFailure(txHash, reason);
  }
}
```

### Emergency Stop:
```solidity
// Contract has pause functionality
bool public paused = false;
address public owner;

modifier whenNotPaused() {
    require(!paused, "Contract paused");
    _;
}

function pause() external onlyOwner {
    paused = true;
}

function swap(...) external whenNotPaused {
    // ... swap logic
}
```

## Testing Requirements

Before launch:
1. **Testnet testing** - 1000+ swaps on Base Goerli
2. **Mainnet testing** - Small amounts with team wallets
3. **Security audit** - Independent smart contract audit
4. **Bug bounty** - Offer rewards for finding vulnerabilities
5. **Gradual rollout** - Start with verified tokens only

## What We NEVER Do

❌ Store user funds in contract
❌ Allow unlimited approvals
❌ Execute swaps without simulation
❌ Skip slippage protection
❌ Allow swaps with extreme price impact
❌ Use unverified token contracts
❌ Skip deadline checks
❌ Hide transaction details from users

## Summary

**Port is safe because:**
1. Every swap is simulated before execution
2. Slippage protection is mandatory
3. Price impact is always checked
4. Only whitelisted routers are used
5. Contract holds no funds
6. All swaps are atomic (succeed or revert completely)
7. Users always see expected outputs before confirming
8. Emergency pause mechanism exists

**The user can NEVER lose funds unless:**
- They approve a malicious token contract (we block these)
- They accept extreme price impact (we warn/block)
- The entire Base chain fails (blockchain-level risk)

**Bottom line:** If Port says a swap will give you X tokens, you WILL get at least X tokens, or the transaction will revert and you keep your original tokens. No middle ground.
