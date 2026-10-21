# Prompt 40 — Escrow, wallets per role, cap/approve, transaction service (paste into a NEW Cursor chat)

## Context
Read `docs/spec/01_PRODUCT_SPEC.md` (J5, J7–J10), `docs/spec/02_DATA_AND_STATE.md` (wallets, escrows, chain_txs, state machine, §6), `docs/spec/CODEBASE_MAP.md`. Prompts 10–30 are done: an accepted contract version exists with stage amounts in kobo and micro-USDC, cap, retention and defects period.

On-chain facts (Ethereum Sepolia, chainId 11155111), from the 20 Oct audit — **re-verify from Etherscan source/ABI**:
- EscrowFactory `0x4F4c6cc95465ceFe8a967E351EEdE69d40660423`, verified, solc 0.8.28, factory + clones.
- Escrow functions seen: `acceptTerms`, `fund(amount, upToStage)`, `submitStage(evidenceHash)` (operator-only, evidence required), `releaseStage` (operator-only; reverts `CapExceeded` unless client approved), `clientApprove` / `clientApproveWithSig`, `dispute`, `resolveDispute` (+`WithSigs`), `addVariation` (with signatures), `releaseRetention` (after defects period), refunds. `AmountMismatch` check on fund.
- Pilot escrow `0x5289dcc36EdC15AdC6314F75EcBFa745e70BD44d`: client = consultant = operator = server wallet `0xa27b33393f461554500AADf575138544A3620615`; contractor `0x57F91305c07603759840ef44b3632d313e3cC5e8`; 10 × 1 USDC, retention 5%, mobilisation 1 USDC, cap 5 USDC, defects 180 days. Never submitted or released. **This makes the cap/approve/dispute protections meaningless — the main thing to fix here.**
- USDC on Sepolia: confirm the address the app uses (Circle's Sepolia USDC is `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` — verify on Circle's docs before using).

## Goal
Every role has its own wallet; escrows are created only from accepted contract versions with real amounts; the cap path is real (a stage above cap needs the client's Approve); every transaction goes through one idempotent, confirming, reconciling tx service; the contract is reviewed and tested with Foundry.

## Do-not-do list (applies to everything in this prompt)
- Do **not** guess the codebase. Inspect first; if something this prompt assumes does not exist or is different, write it in your report and adapt. Never silently invent a file, table, env var or function name that you have not checked.
- Do **not** put seeded, sample or hard-coded business data (projects, amounts, stages, disputes, changes, confidence scores, daily notes) in any production code path. Demo data exists only in `scripts/seed-demo.ts`, writes only to a workspace with `is_demo = true`, and the UI labels it "Demo workspace".
- Do **not** use `number`/floats for money. Kobo and micro-USDC are `bigint` (see docs/spec/02_DATA_AND_STATE.md §1).
- Do **not** commit secrets or print them in logs, errors, tests or your replies. All keys live in env vars, validated at boot, documented in `.env.example` with placeholder values.
- Do **not** remove or break working features: the funding flow (/fund → /api/mini/fund → Etherscan link), Export payment certificate, the Fund currency toggle, the 401 "Sign in from Telegram." protection on /api/mini/*, `/api/health`, the verified EscrowFactory and escrow contracts.
- Do **not** weaken, skip or delete a test to make it pass. Do not add `// @ts-ignore`, `eslint-disable` or `any` without a one-line justification comment.
- Do **not** move money, call a mainnet, or send Telegram messages to real users from tests. Tests use mocks or Sepolia test wallets created for tests.
- Do **not** start work belonging to a later prompt. If you notice it is needed, add it to `docs/spec/BACKLOG.md`.
- Do **not** claim something works without showing the command output that proves it.
- Do **not** redeploy the factory unless the review (Step 2) finds a must-fix issue. If you think a change is needed, write it up in `docs/spec/CONTRACT_REVIEW.md` and **stop for my approval** before deploying anything.
- Do **not** use the server/operator wallet as client or consultant for any new escrow.
- Do **not** send a transaction without an idempotency key and a `chain_txs` row written first.
- Do **not** hold or log private keys. CDP server wallets only; reference accounts by name/id.

## Step 1 — Inspect and report
1. Find the contracts source (repo `contracts/`?). If absent, download the verified source + ABI from Etherscan (Sepolia) for the factory and one clone into `contracts/src/` with a README noting the source URL and that it's a copy of verified code.
2. List every external/public function, modifier, event, error and the exact `createEscrow` parameter struct in `docs/spec/CONTRACT_REVIEW.md`.
3. Find how the app currently calls the chain (viem/ethers?), which CDP SDK version and how wallets are created/named.

## Step 2 — Contract review checklist (write findings in CONTRACT_REVIEW.md: ✓ / ✗ / n/a + note for each)
- [ ] Access control on every state-changing function (who can call: client/consultant/operator/contractor); no function lets the operator alone release above cap.
- [ ] Re-entrancy: CEI order or `nonReentrant` on fund/release/refund/retention; SafeERC20 used.
- [ ] Amount maths: stage amounts sum, retention bps applied on release, mobilisation recovery, rounding direction favours escrow, no underflow.
- [ ] `fund(amount, upToStage)`: AmountMismatch exactness; partial funding then later funding works; cannot fund beyond total.
- [ ] `submitStage` requires non-zero evidence hash; cannot submit unfunded stage; cannot submit twice.
- [ ] Cap: `releaseStage` reverts `CapExceeded` when `amount > cap` without client approval; approval is per stage and single-use; `clientApproveWithSig` uses EIP-712 with chainId, verifying contract, nonce, deadline (replay protection).
- [ ] Disputes lock release; `resolveDispute` paths; who can resolve and when; signatures replay-safe.
- [ ] Variations: both signatures required; cannot reduce already-released amounts.
- [ ] Retention release only after defects period; refunds only for unfunded/cancelled stages to client.
- [ ] Events for every state change (needed for reconciliation).
- [ ] Factory: clones initialised once; initializer cannot be front-run; parameters validated (distinct roles? — note if not enforced on-chain; we enforce off-chain).
- [ ] Pause/emergency mechanism (note if none; propose, don't implement without approval).
- [ ] Run Slither (`slither .`) and paste high/medium findings with your assessment.

## Step 3 — Foundry tests (`contracts/test/`)
Set up Foundry (`forge init --no-git` in `contracts/` if not present; `foundry.toml` with solc 0.8.28, optimizer settings matching the verified build). Use a mock USDC (6 decimals). Write tests:
- `test_fullLifecycle`: create (5 stages: 2,3,7,5,3 USDC; cap 5 USDC; retention 5%) → both acceptTerms → fund 20 USDC upTo 5 → submit 1 → release 1 (contractor receives 1.9, retention 0.1) → … → stage 3 (7 USDC > cap) release **reverts CapExceeded** → clientApprove(3) → release succeeds → warp past defects → releaseRetention → balances exact.
- `test_partialFunding`, `test_cannotReleaseUnfunded`, `test_cannotDoubleRelease`, `test_onlyOperatorSubmits`, `test_disputeBlocksRelease`, `test_resolveDisputeWithSigs`, `test_clientApproveWithSig_replay_reverts`, `test_variationNeedsBothSigs`, `test_refundUnfunded`.
- Fuzz: `testFuzz_retentionMaths(uint64 amount, uint16 bps≤1000)` — contractor + retention == amount.
- Invariant: escrow USDC balance == funded − released − refunded at all times.
- Gas report (`forge test --gas-report`).
Tests are written against the **actual** ABI found in Step 1; if a function above doesn't exist, mark the test `skip` with a note, don't invent it.

## Step 4 — Wallets per role (CDP)
- `src/server/chain/wallets.ts`: `getOrCreateWallet({purpose, userId?, projectId?})` using the CDP SDK (check current docs for the server-wallet API: account creation by name, `sendTransaction`, `signTypedData`). Account naming: `certa-<env>-<purpose>-<userId or projectId>` (≤ CDP name limits; hash if needed). Store only address + account ref in `wallets`.
- Per project escrow roles: **client** = client user's wallet; **consultant** = consultant user's wallet (if no consultant joined yet, project cannot be funded — message "Add your consultant before locking money. They certify each stage."); **operator** = one platform operator wallet per environment (agent role: submit evidence, execute releases); **contractor** = contractor user's wallet (created automatically on join). Subcontractor wallets are created on join for future direct payment (stage payee support depends on the contract; note in CONTRACT_REVIEW.md).
- Assert in code before `createEscrow`: four addresses are pairwise distinct; else throw `RolesNotDistinct`.
- Honest custody note (put it in README security section later): these are Certa-managed wallets, so separation protects against bugs and single-key misuse and every client approval is tied to a verified Telegram tap logged in audit_log; full self-custody (client connects their own wallet) is a future option. Configure **CDP Policy Engine** (if available on the account — check docs) so the operator account can only call the factory/escrows and USDC `approve`, with a per-tx max; record the policy in docs.
- Gas: a `gas_topup` job keeps each role wallet ≥ 0.01 Sepolia ETH (from the operator/treasury), logging `chain_txs(kind='gas_topup')` and charging the workspace allowance (prompt 70 shows it). Users never see the word "gas" outside technical details.

## Step 5 — Transaction service `src/server/chain/tx.ts`
- `sendTx({kind, idempotencyKey, from(wallet purpose), to, data, projectId, stageId})`:
  1. `insert into chain_txs … on conflict (idempotency_key) do nothing returning *`; if exists and status in (submitted, confirmed) → return it (no resend).
  2. Simulate (`eth_call`/viem `simulateContract`); on revert decode the custom error (CapExceeded, AmountMismatch…) → status `failed`, error stored, map to plain message.
  3. Send via CDP; store `tx_hash`, status `submitted`, `submitted_at`, attempts++.
  4. Enqueue `confirm_tx` job.
- `confirm_tx`: wait for receipt with **2 confirmations** on Sepolia (env `CONFIRMATIONS`, default 2); status=1 → `confirmed`, block number; decode events and **check they match the intent** (e.g. StageReleased(stageIndex, amount)); then call the state-machine transition. Revert → `failed`. Not mined in 10 min → re-check nonce; if dropped, resend with same nonce and higher fee (`replaced`), max 3 attempts → `release_failed` + admin alert.
- RPC: primary + fallback transport (viem `fallback`). Rate-limit friendly polling.
- Reconciliation job (every 10 min + after confirms): read escrow state for each active project; compare per-stage funded/submitted/released and balances with DB; mismatch → `audit_log` + alert + UI banner (02 §6). Also back-fill any events the DB missed (from the escrow's creation block).

## Step 6 — Flows to wire
- **Create escrow** (first time the client funds): build params from the accepted contract version — stages (micro), retention bps, mobilisation (if any), cap (micro), defects period seconds, four role addresses, terms hash = version content_hash (if the contract has a terms-hash field; else store off-chain only and note it). Idempotency key `create_escrow:<contract_version_id>`. Then `acceptTerms` for client and contractor (signed by their wallets, after their in-app acceptance from prompt 30 — keys `accept_terms:<version>:<role>`).
- **Fund** (existing /fund flow — **keep it working**, re-point it to the project's escrow): client wallet `approve` USDC then `fund(amountMicro, upToStage)`; amount = Σ unfunded stages ≤ upTo (code computes; UI shows). In demo/testnet, the client wallet gets test USDC from the operator treasury via a labelled "Add test money" admin action (never in production).
- **Submit** (prompt 50 calls it): `submitStage(index, evidenceHash)`; key `submit_stage:<submission_id>`.
- **Approve over cap**: when the client taps Approve in Telegram on a stage with `amount_micro > cap_micro`, call `clientApprove(index)` from the **client** wallet (key `client_approve:<stage_id>:<approval_id>`), then release. At or under cap: release directly after the client's Approve tap (still recorded).
- **Release**: operator `releaseStage(index)`; key `release_stage:<stage_id>:<approval_id>`; on confirm → `released`, notify with link, record 0.5% release fee (billing record only — don't move extra funds unless the contract supports a fee recipient; check).
- **Dispute / resolve / variation / retention / refund**: wire to the existing contract functions with the right role wallets and signatures.
- Explorer links: `https://sepolia.etherscan.io/tx/<hash>` and `/address/<addr>`; build from a per-chain config (`src/server/chain/networks.ts`), never hard-code "Basescan"/"Etherscan" in UI strings.

## Acceptance criteria
- [ ] CONTRACT_REVIEW.md complete with every checklist item answered and Slither output assessed.
- [ ] `forge test` passes all tests incl. fuzz and invariant; gas report pasted.
- [ ] New escrow on Sepolia created from an accepted version with **four distinct** role addresses (paste addresses + Etherscan link).
- [ ] A stage above the cap: release attempt without approval returns the plain message "This payment is above the spending cap, so the client must tap Approve first." and no tx is broadcast (simulation caught it); after client Approve, release confirms (paste both tx links).
- [ ] Calling the same release twice (double-tap) produces exactly one tx (integration test with mocked chain + one real Sepolia proof).
- [ ] Reconciliation detects a deliberately desynced DB row in a test and raises the alert.
- [ ] /fund still works end to end against the new escrow.
- [ ] No hard-coded explorer name or URL outside `src/server/chain/networks.ts` (Ethereum Sepolia → "Etherscan (Sepolia)"; Base Sepolia, used only for x402 in prompt 70 → "Basescan (Base Sepolia)").

## Definition of Done — run these commands and paste output
```bash
cd contracts && forge build && forge test -vv && forge test --gas-report | tail -40 && (slither . --exclude-dependencies || true) ; cd ..
pnpm typecheck && pnpm lint
pnpm test -- --reporter=verbose src/server/chain
pnpm test:integration -- tests/integration/chain
pnpm tsx scripts/sepolia-smoke.ts   # creates a throwaway escrow (2 stages: 1 and 6 USDC, cap 5), funds, submits, proves CapExceeded, approves, releases; prints every tx link
pnpm build
grep -rniE "basescan|etherscan" src app lib | grep -v "chain/networks.ts" ; echo "grep exit (1 = none found, good): $?"
```
Then reply with this report, in this order:
1. **Inspection findings** (what you found that differed from this prompt).
2. **What changed** (files added/modified, migrations, env vars added).
3. **Acceptance criteria** — copy the checklist above, tick each box, and for each one give the evidence (test name, command output line, screenshot path).
4. **Command output** — paste the full output of every command below (trim only passing-test lists longer than 50 lines; never trim failures).
5. **Not done / risks** — anything incomplete, with the reason.
