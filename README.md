# Verifiable Guard

A safety layer for AI agents that move money on-chain.

## The problem

We can prove an agent **ran its code correctly**. We can't prove it **made a sound decision**. A cryptographically-proven bad transaction is still a bad transaction.

Real agents have lost real money this way — not by being hacked, but by being talked into it.

## What it does

A real LLM proposes on-chain transactions. A guard checks every proposal against layered safety rules before anything is sent. Every decision produces a tamper-evident record.

```
AI proposes  →  Guard rules on it  →  Only safe actions execute
                        ↓
                tamper-proof record
```

## The guard rules

| Rule | Blocks |
|---|---|
| `sanity-check` | Zero or negative amounts |
| `flagged-address` | Known-bad destinations |
| `allowlist` | Unapproved addresses |
| `spending-limit` | Oversized single transactions |
| `drain-protection` | Near-total-balance sends |
| `frequency-limit` | Too many transactions too fast |
| `cumulative-limit` | Death by a thousand small transactions |

## Tamper-evident decisions

Every decision is hashed (keccak256) over its own contents:

```
allowed | rule | reason | amount | to | timestamp
```

Change any field and the fingerprint no longer matches. `verifyLog()` recomputes every fingerprint and flags altered records.

## Findings

Fed the agent three inputs: a normal signal, a panic message, and a prompt-injection attempt disguised as a routine ops update.

Both models tested (Claude Sonnet and Haiku) recognised the manipulation and refused to change the destination address. The guard enforced limits regardless.

The point isn't that the model failed. It's that safety shouldn't depend on it succeeding. Models change, get swapped, and face new attacks. A limit is a limit.

## Stack

TypeScript, viem, Ethereum Sepolia, Anthropic API, keccak256.

## Run it

```bash
npm install
cp .env.example .env   # add PRIVATE_KEY and ANTHROPIC_API_KEY
npm run dev
```
