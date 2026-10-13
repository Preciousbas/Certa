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
| viem | 2.57.5 | Base Sepolia client. |
| Solidity | 0.8.28 | Spec asked for 0.8.2x. |
| OpenZeppelin | 5.6.1 | SafeERC20, ReentrancyGuard, AccessControl, Pausable, Clones. |
| Foundry | forge 1.7.1 | Already installed. |
| x402 | `@x402/next` and `@x402/fetch` 2.28.0 | The `x402-next` / `x402-fetch` names in the brief are the v1 packages. Current sellers use `@x402/*`. |
| Vitest | 3.2.4 | Unit tests. |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Circle's Base Sepolia USDC. 6 decimals. Confirmed on Circle's contract-address list. |

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

16. **Mini App aesthetic.** Site-office ledger: Fraunces + Figtree + IBM Plex Mono, warm charcoal `#161410`, paper `#f3ecdf`, brass `#e2a04a` used on the primary action and the active stage only. Oxide `#c4654a` is the dispute/safety accent. Telegram theme variables override the defaults when the app runs inside Telegram. Buttons shrink on hover. No gradient text, no pure black or white, no three-column feature grids.

17. **Jobs.** Inngest when keys exist. The same job functions run in-process in tests with a fake clock, so the 72h and 7-day timers are exercised without a network.

18. **x402.** `/api/paid/weather` and `/api/paid/materials-price` return HTTP 402 with an x402 v2 challenge (`amount` `"10000"` = $0.01 USDC on `eip155:84532`). The official `@x402/next` seller middleware is not mounted. Coinbase's CDP SDK imports optional `@x402/*` clients that are not installed, and pulling that graph into the Next bundle broke the build. A `demo` payment header is accepted only when `DEMO_MODE` is not `"0"`. A real facilitator settle, a third-party paid call, and a row in `x402_calls` wait on `X402_FACILITATOR_URL` and a funded operator wallet.

23. **Inngest 4.23 takes two arguments.** Triggers, including cron, live on the options object: `createFunction({ id, triggers: [{ cron }] }, handler)`. The three-argument form from older examples does not type-check.

24. **CDP stays out of the Next bundle.** `createPartyWallet` loads `@coinbase/cdp-sdk` with a webpack-ignored dynamic import, and only when all three CDP env vars are set. Without them the address is `sha256(partyId)` and marked mock.

19. **Off-ramp.** `OffRampProvider` with a demo stub: quote, bank details, then "coming soon". No live Cleva or Spenda call.

20. **Local bot transport.** Long polling in `pnpm dev`. Vercel serves `POST /api/telegram` via `webhookCallback`. The webhook rejects a missing or wrong `x-telegram-bot-api-secret-token`.

21. **Stage column.** The stage order column is `stage_index`. `index` is awkward in SQL and in Drizzle.

22. **App database role.** RLS is forced for `certa_app`, a non-login role without bypass. The request sets `app.current_user_id`, `app.current_workspace_id`, and `app.current_workspace_role` inside the transaction, then `SET LOCAL ROLE certa_app`. Tests run on PGlite. A service-role connection would skip RLS, so production should use `certa_app` for tenant queries. `authorize()` still runs first.
