# Decisions

Locked on 13 Oct 2026 before implementation. Change these only by editing this file in the same commit as the code.

## Stack versions that compile together

| Piece | Pin | Why this pin |
| --- | --- | --- |
| Node | 20.20.0 (engines `>=20.18`) | Already on the machine. Next 15 supports it. |
| pnpm | 10.18.2 | Workspace package manager. |
| TypeScript | 5.9.3 | Next.js 15.5 rejects TypeScript 7 because the native compiler dropped `typescript/lib/typescript.js`. |
| Next.js | 15.5.27 | Spec asked for App Router 15. This is the September 2026 security patch on the 15.5 line. |
| React | 19.2.4 | Matches the Next 15.5 peer range. |
| Tailwind | 4.3.3 | Current v4, used with `@tailwindcss/postcss`. |
| grammY | 1.46.0 | Bot framework named in the spec. |
| Drizzle | orm 0.45.4 / kit 0.31.11 | Schema and migrations. |
| Zod | 3.25.76 | Structured output. Zod 4 is current on npm but the extraction pipeline and drizzle stay on 3.25 so one schema language is shared. |
| viem | 2.57.5 | Ethereum Sepolia client. |
| Solidity | 0.8.28 | Spec asked for 0.8.2x. |
| OpenZeppelin | 5.6.1 | SafeERC20, ReentrancyGuard, AccessControl, Pausable, Clones. |
| Foundry | forge 1.7.1 | Already installed. |
| x402 | `@x402/next` and `@x402/fetch` 2.28.0 | The `x402-next` / `x402-fetch` names in the brief are the v1 packages. Current sellers use `@x402/*`. |
| Vitest | 3.2.4 | Unit tests. |
| USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | Circle's Ethereum Sepolia USDC. 6 decimals. Confirmed on Circle's contract-address list. |

## File plan

```
apps/bot/            grammY handlers, polling entry, conversation harness
apps/web/            Next.js Mini App, /api/telegram, /api/health, x402 routes, dashboards
packages/shared/     money (kobo / USDC 6dp), join codes, copy, photo checks
packages/db/         Drizzle schema, SQL migration, RLS, authorize(), seed
packages/ai/         provider interface, Zod extraction, injection tests, eval script
packages/chain/      viem, escrow ABI, CDP wallet service, indexer
packages/pdf/        letterhead stamping with pdf-lib
contracts/           CertaEscrow, EscrowFactory, Foundry tests, Deploy.s.sol
fixtures/            sample contract PDF/DOCX/XLSX, letterheads, injection doc, photos
docs/                ARCHITECTURE, DECISIONS, DEPLOYMENTS, SECURITY, DEMO_SCRIPT
```

## Product defaults

1. **One escrow per project, via an EIP-1167 factory.** A single mapping contract would be fewer deployments, and EIP-712's cached domain separator does not survive clones. We still use clones: each project gets its own Basescan address, a bug in one project cannot drain another, and the domain separator is computed from `address(this)` at call time so signatures are bound to that clone. The implementation is not upgradeable.

2. **Certa's 0.5% fee is off-chain.** `usage_ledger` records 50 bps of each release against the workspace. The escrow pays the contractor `amount - retention` and nothing else. Taking the fee inside the contract would break the "contractor receives the stage, minus retention" rule and complicate the solvency invariant. Treasury address is recorded for a later on-chain cut. It is not wired into `releaseStage`.

3. **Mobilisation is collected on the first `fund` call**, added to the exact sum of still-pending stages in `0..upToStage`. Later top-ups are stage-only. A mobilisation advance has to be in the contract before the first pour, not after the last stage.

4. **`fund` reverts unless both parties have called `acceptTerms()`.** The product rule "no funding before both acceptances" is enforced on-chain, not only in the UI.

5. **Above the spending cap, `releaseStage` requires `clientApproved`.** At or under the cap, the operator can release. Equal-to-cap does not need an extra approval.

6. **Dispute resolution pays `payBps` of the stage to the contractor, holds retention on that gross, and refunds the rest to the client.** Consultant can call `resolveDispute`. Client (or the operator) can call `resolveDisputeWithSigs` with both EIP-712 signatures.

7. **Defects time starts when the client or consultant calls `startDefectsPeriod()`.** It does not start at deploy. `releaseRetention` waits until `defectsPeriodEnd`.

8. **Cancel refunds funded-but-not-submitted stages and unreleased mobilisation.** Submitted and disputed stages stay locked. There is no path that pays a stage which is not `Submitted` and then released or resolved.

9. **Postgres, with PGlite in unit tests.** No cloud database is required for `pnpm test`. RLS is forced for a non-superuser role `certa_app`. The bot also calls `authorize()` and ignores client-supplied project ids that fail the policy.

10. **Wallets.** If CDP keys are present, party wallets are Coinbase CDP server wallets. If they are not, a deterministic mock wallet is created once per party and labelled mock. Private keys are never stored. Idempotency is a primary key on `wallet_creations.party_id`.

11. **AI never moves money.** The model returns a Zod object. Thresholds: `>= 0.85` recommend release, `0.6–0.85` consultant, below `0.6` or any error holds. Document text is data. The extractor has no tools.

12. **Photos.** Live capture uses a one-time nonce. Gallery uploads and EXIF times outside ±30 minutes are rejected. Duplicates are caught with sha256 and an average hash. A stamped copy is stored beside the original.

13. **Chain indexer is the source of truth for payment status.** The API writes `submitted` only after the tx is broadcast. The indexer moves the row to `confirmed` from the event. Idempotency key is unique on `(stage, attempt)`.

14. **Email and phone numbers are encrypted with AES-256-GCM** under `APP_ENCRYPTION_KEY` before they touch Postgres. GPS is omitted from documents sent outside the project.

15. **Demo FX.** Seed locks ₦1,500 per USDC (`fx_rate_locked` stored as 150000 kobo per USDC). Contract sum ₦45,000,000 is exactly 30,000.000000 USDC. Display rounding is half-up to 2 decimals and is never written back to storage.

16. **Mini App aesthetic.** Navy ledger from the review mockups. Inter, weights 400–800. Light background `#F8FAFC`, cards `#FFFFFF`, navy `#0F2A44`, action orange `#F97316`. Button labels are `#1E293B` on that orange so the contrast clears WCAG AA. White on `#F97316` does not. Status chips use the released, locked, pending, and disputed pairs. Dark follows Telegram `colorScheme`, with `#0B1220` / `#111A2E` when no theme colours are passed. Phone nav is a 72px four-item bar with a navy active pill. At 1024px and wider the same links move into a navy sidebar. Buttons shrink on hover.

17. **Jobs.** Inngest when keys exist. The same job functions run in-process in tests with a fake clock, so the 72h and 7-day timers are exercised without a network.

18. **x402.** `/api/paid/weather` uses `@x402/core` and `@x402/evm` on the server, kept out of the client bundle. The facilitator is `X402_FACILITATOR_URL`, default `https://x402.org/facilitator`, on `eip155:11155111` for $0.01 USDC. The route answers 503 until `X402_PAY_TO_ADDRESS` is a 20-byte address. A `PAYMENT-SIGNATURE` is verified and settled by the facilitator. The weather numbers come from Open-Meteo for the project's stored coordinates, and a row is written only when the settle response carries a 32-byte transaction hash. The daily note links that hash on Etherscan. Allowance left is the workspace allowance minus the sum of `x402_calls`. A pour-stage review tries to pay from `EVM_PRIVATE_KEY` before the approval is stored. No key is set, so no settlement has been made. The demo header does not write a receipt. Materials prices are not invented. `@x402/next` stays unmounted.

23. **Inngest 4.23 takes two arguments.** Triggers, including cron, live on the options object: `createFunction({ id, triggers: [{ cron }] }, handler)`. The three-argument form from older examples does not type-check.

24. **CDP stays out of the Next bundle.** `createPartyWallet` loads `@coinbase/cdp-sdk` with a webpack-ignored dynamic import, and only when all three CDP env vars are set. Without them the address is `sha256(partyId)` and marked mock.

26. **Sample data is off unless `DEMO_SEED=true`.** The Lekki duplex is not loaded on every boot. When the flag is on, the shell shows a Sample data badge. `DEMO_MODE` no longer implies a seed.

30. **The e2e demo folder stays local.** `scripts/e2e-demo/` is gitignored. `pnpm demo:e2e` runs the rehearsal against an in-memory sample project: fund pending through stage 2, join code, gallery reject, live photo accept, pour verdict that does not auto-release, and a pending letterhead PDF. It writes `out/last-run.json` and never invents a Basescan hash. The committed video outline and checklist live in `docs/DEMO_SCRIPT.md`.

29. **A photo check never pays.** `verifyStage` returns a verdict and a decision. `recommend_release` requires confidence at least 0.85, a finished stage, a high-trust photo, and a stage amount at or under 1,000 USDC. An instruction inside the photo text, or an `action` field in the model JSON, cannot take that path. No model key is set, so captures store a text check with `model: null` and the screen says no photo model ran. A consultant approval writes an `approvals` row and does not insert a payment.

28. **Ethereum Sepolia reads are live. Broadcasts are not invented.** The public RPC `https://ethereum-sepolia-rpc.publicnode.com` is chain 11155111, and Circle USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` is the token the app reads. Health reports `rpc: ok` only after that check. A payment-account balance is `balanceOf` on that USDC contract. A stage shows an Etherscan link only when `payments.tx_hash` is a real 32-byte hash. `scripts/broadcast-sepolia.sh` exits if `DEPLOYER_PRIVATE_KEY` is unset. No factory address is recorded until that script writes `deployments/sepolia.json`.

31. **The deploy chain is Ethereum Sepolia.** The deployer holds Sepolia ETH, so the factory broadcasts to chain 11155111. `forge script` on Foundry 1.7.1 needs `script/Deploy.s.sol:DeployScript`. `SEPOLIA_RPC_URL` wins over `BASE_SEPOLIA_RPC_URL` when both are set.

27. **Screens only say what the database stored.** A fund confirmation shows the locked naira and USDC and the stages in that request. It stays "Waiting on chain" until a real transaction hash exists. There is no escrow link, certificate, or "contractor notified" without a stored address, document, or outbound email. Change cards are parsed fields, not JSON. The naira/USDC switch is `localStorage` key `certa-money-unit` and uses the project's locked rate. The phone nav is four items. Development CSP adds `'unsafe-eval'` because the Next dev server evaluates scripts. Production does not.

25. **PGlite is a direct dependency of the web app.** The demo database is in-memory Postgres. Next externalises `@electric-sql/pglite`, and Node resolves it from `apps/web/node_modules`. The Vercel project root is `apps/web`. Install runs `cd ../.. && pnpm install` so the workspace still installs. `outputFileTracingRoot` is the monorepo root so the pnpm store is part of the serverless trace. Copying `.next` up to the repository root broke those paths.

19. **Off-ramp.** Cash out stays closed until a real bank quote exists. The page does not invent a rate or name a provider. No live Cleva or Spenda call.

20. **Local bot transport.** Long polling in `pnpm dev`. Vercel serves `POST /api/telegram` via `webhookCallback`. The webhook rejects a missing or wrong `x-telegram-bot-api-secret-token`.

21. **Stage column.** The stage order column is `stage_index`. `index` is awkward in SQL and in Drizzle.

22. **App database role.** RLS is forced for `certa_app`, a non-login role without bypass. The request sets `app.current_user_id`, `app.current_workspace_id`, and `app.current_workspace_role` inside the transaction, then `SET LOCAL ROLE certa_app`. Tests run on PGlite. A service-role connection would skip RLS, so production should use `certa_app` for tenant queries. `authorize()` still runs first.
