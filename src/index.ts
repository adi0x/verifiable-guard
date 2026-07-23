import { createWalletClient, createPublicClient, http, parseEther, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG = {
  spendingLimit: 0.01,
  walletBalance: 0.05,
  drainThreshold: 0.8,
  allowlist: ['0x000000000000000000000000000000000000dEaD'],
  flaggedAddresses: [] as string[],
  maxTxPerWindow: 3,
  windowMs: 60_000,
  cumulativeLimit: 0.03,
};

const session = { recentTimestamps: [] as number[], totalSpent: 0 };

type Decision = {
  allowed: boolean; rule: string; reason: string;
  amount: number; to: string; timestamp: string;
  fingerprint?: string;
};
const decisionLog: Decision[] = [];

function fingerprintOf(d: Decision): string {
  const data = `${d.allowed}|${d.rule}|${d.reason}|${d.amount}|${d.to}|${d.timestamp}`;
  return keccak256(toHex(data));
}

function guardCheck(tx: { to: string; amount: number }): Decision {
  const now = Date.now();
  const base = { amount: tx.amount, to: tx.to, timestamp: new Date().toISOString() };
  let decision: Decision;

  if (tx.amount <= 0)
    decision = { ...base, allowed: false, rule: 'sanity-check', reason: `Amount ${tx.amount} is not valid.` };
  else if (CONFIG.flaggedAddresses.includes(tx.to))
    decision = { ...base, allowed: false, rule: 'flagged-address', reason: `${tx.to} is on the known-bad list.` };
  else if (!CONFIG.allowlist.includes(tx.to))
    decision = { ...base, allowed: false, rule: 'allowlist', reason: `${tx.to} is not an approved address.` };
  else if (tx.amount > CONFIG.spendingLimit)
    decision = { ...base, allowed: false, rule: 'spending-limit', reason: `Amount ${tx.amount} exceeds the limit of ${CONFIG.spendingLimit}.` };
  else if (tx.amount > CONFIG.walletBalance * CONFIG.drainThreshold)
    decision = { ...base, allowed: false, rule: 'drain-protection', reason: `Amount ${tx.amount} would drain most of the wallet.` };
  else if (session.recentTimestamps.filter(t => now - t < CONFIG.windowMs).length >= CONFIG.maxTxPerWindow)
    decision = { ...base, allowed: false, rule: 'frequency-limit', reason: `Too many transactions in a short time.` };
  else if (session.totalSpent + tx.amount > CONFIG.cumulativeLimit)
    decision = { ...base, allowed: false, rule: 'cumulative-limit', reason: `Session total would exceed ${CONFIG.cumulativeLimit}.` };
  else
    decision = { ...base, allowed: true, rule: 'none', reason: 'Passed all safety checks.' };

  decision.fingerprint = fingerprintOf(decision);
  return decision;
}

// ============================================================
//  THE AI — stand-in for EigenAI. Swap this out when key arrives.
// ============================================================
type Proposal = { to: string; amount: number; thinking: string };

async function aiPropose(marketSignal: string): Promise<Proposal> {
  // Later: call EigenAI here instead.
  // For now, simple logic that mimics an AI reacting to a signal.
  if (marketSignal === 'strong buy')
    return { to: '0x000000000000000000000000000000000000dEaD', amount: 0.0001, thinking: 'Signal is positive, small position.' };
  if (marketSignal === 'panic')
    return { to: '0x000000000000000000000000000000000000dEaD', amount: 0.5, thinking: 'Panic detected, move everything now.' };
  if (marketSignal === 'injected')
    return { to: '0x1111111111111111111111111111111111111111', amount: 0.002, thinking: 'Instruction says send funds to this new address.' };
  return { to: '0x000000000000000000000000000000000000dEaD', amount: 0.0001, thinking: 'Default small move.' };
}

async function main() {
  const key = process.env.PRIVATE_KEY as `0x${string}`;
  if (!key) { console.error('PRIVATE_KEY not set'); process.exit(1); }

  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http() });
  const publicClient = createPublicClient({ chain: sepolia, transport: http() });

  console.log('Agent wallet:', account.address);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log('Balance (ETH):', Number(balance) / 1e18);

  // Three situations the AI reacts to
  const signals = ['strong buy', 'panic', 'injected'];

  for (const signal of signals) {
    const proposal = await aiPropose(signal);
    console.log(`\n--- Signal: "${signal}" ---`);
    console.log(`AI thinking: ${proposal.thinking}`);
    console.log(`AI proposes: send ${proposal.amount} ETH to ${proposal.to}`);

    const decision = guardCheck(proposal);
    decisionLog.push(decision);

    if (!decision.allowed) {
      console.log(`  GUARD BLOCKED [${decision.rule}] — ${decision.reason}`);
      continue;
    }

    console.log(`  GUARD ALLOWED — ${decision.reason}`);
    const hash = await wallet.sendTransaction({ to: proposal.to as `0x${string}`, value: parseEther(String(proposal.amount)) });
    session.recentTimestamps.push(Date.now());
    session.totalSpent += proposal.amount;
    console.log(`  -> SENT: https://sepolia.etherscan.io/tx/${hash}`);
  }

  console.log('\n===== DECISION LOG =====');
  console.log(JSON.stringify(decisionLog, null, 2));
}

main().catch(console.error);