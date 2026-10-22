# Certa build pack for Cursor — how to use it

Written 20 Oct 2026 for Precious Bassey. Purpose: turn Certa (https://certa-two.vercel.app, bot @CertaApp_bot) from a seeded demo into a real product, built to production standard from the first commit.

## What is in this pack

| File | What it is | Paste into Cursor? |
|---|---|---|
| 00_README.md | This guide | No |
| 01_PRODUCT_SPEC.md | Personas, journeys, screens, UI copy, design tokens | No. Referenced by every prompt (Cursor reads it from the repo) |
| 02_DATA_AND_STATE.md | DB schema, RLS, money rules, stage state machine, audit log | No. Referenced by every prompt |
| 10_foundations.md | Repo inspection, strict TS, env validation, DB, storage, money library, remove seed data | Yes — prompt 1 |
| 20_auth_roles_security.md | Telegram auth, sessions, RBAC, RLS, /admin login, webhook hardening | Yes — prompt 2 |
| 30_contract_boq_intake.md | **The core feature.** Upload contract/BoQ → AI extracts all money info → code validates → both parties accept | Yes — prompt 3 |
| 40_escrow_and_wallets.md | Contract review, Foundry tests, one CDP wallet per role, cap/approve, tx service | Yes — prompt 4 |
| 50_ai_photo_verification.md | In-app capture, GPS/time checks, vision prompt, verdict schema, thresholds, eval set | Yes — prompt 5 |
| 60_telegram_bot.md | Every command, button and message, per role | Yes — prompt 6 |
| 70_x402_fees.md | Live x402 paid weather / materials-price checks | Yes — prompt 7 |
| 80_dashboard_ui.md | Every web page: layout, components, data, copy | Yes — prompt 8 |
| 90_quality_ops.md | Tests, Playwright journeys, CI, Sentry, health, admin | Yes — prompt 9 |
| 99_demo_and_submission.md | Demo workspace seed, 2-minute demo script, README, submission | Yes — prompt 10 |

## Step 0 (once)
1. Open the Certa repo in Cursor.
2. Create a folder `docs/spec/` in the repo and copy **all** files from this pack into it (including this README). Commit them: `git add docs/spec && git commit -m "docs: add build spec pack"`.
3. Pick the strongest model Cursor offers, in **Agent** mode.
4. Make sure `.env.local` has the keys you already use (Supabase, CDP, Telegram bot token). Never paste a secret into chat.

## The rules (follow them every time)
1. **One prompt per chat.** Open a *new* Cursor chat for each numbered file. Paste the whole file as the message. Do not merge two prompts in one chat.
2. **Strict order:** 10 → 20 → 30 → 40 → 50 → 60 → 70 → 80 → 90 → 99. Each builds on the one before.
3. **Do not start the next prompt until the Definition of Done (DoD) passes.** Every prompt ends with a "Definition of Done — run these commands and paste output" section. Cursor must run them and show you the output. Every checkbox must be ticked with evidence.
4. **Paste the verification output back.** Copy Cursor's final report (the DoD output + its "what changed / what is left" summary) and send it to me (Grok Bot). I'll check it before you move on.
5. **If Cursor says "I assumed…"** without having inspected the code, reply: *"Stop. Inspect the code and report what actually exists, then continue."* Every prompt tells Cursor to inspect first and never guess silently.
6. **If a DoD check fails,** stay in the same chat and say: *"The DoD is not met: <paste failing output>. Fix it without weakening the test."*
7. **If the chat gets long or confused** (more than ~40 messages, or Cursor starts repeating itself), ask Cursor: *"Write a handover note to docs/spec/HANDOVER_<prompt>.md: done, not done, next step."* Then open a new chat, paste the same prompt plus "Continue from docs/spec/HANDOVER_<prompt>.md".
8. **Commit after each prompt** on its own branch: `git checkout -b phase/10-foundations` … merge to main only when the DoD passes. Never force-push main.
9. **Never let Cursor delete working features** (funding flow, Export certificate, currency toggle, /api/mini auth, the verified contracts). Every prompt repeats this.

## Time reality
Rise In AgentMaxxing final submissions close **25 Oct 2026**. You chose production standard from the start, which is right. Prompts 10–50 plus 99 give you the real agent loop (upload → extract → accept → fund → photo → AI verdict → approve → release tx) that judges score. 60–90 harden it into a product. If the deadline gets close, run 99 right after whichever prompt you finished last — it records whatever is real; it never fakes anything.

## Facts this pack relies on (from the 20 Oct audit; Cursor must re-confirm in code)
- Next.js app on Vercel; Supabase for DB and storage; CDP configured; grammY-style webhook at `/api/telegram` (unconfirmed).
- EscrowFactory `0x4F4c6cc95465ceFe8a967E351EEdE69d40660423` (verified, solc 0.8.28, **Ethereum Sepolia**, chainId 11155111). Pilot escrow `0x5289dcc36EdC15AdC6314F75EcBFa745e70BD44d` (10 × 1 USDC stages, cap 5 USDC, 2 USDC funded, never submitted/released).
- Server wallet `0xa27b33393f461554500AADf575138544A3620615` is client, consultant and operator today. Contractor `0x57F91305c07603759840ef44b3632d313e3cC5e8`.
- The repo itself has **not** been seen by Grok Bot; nothing in this pack states how the existing code is organised. Cursor must inspect and report.
- x402 facilitators (CDP and x402.org) support **Base Sepolia**, not Ethereum Sepolia (checked in Coinbase's x402 docs on 20 Oct 2026). So the escrow stays on Ethereum Sepolia and the agent's x402 fees are paid on Base Sepolia (prompt 70).
- Sample BoQs in this pack (duplex in prompt 30, gatehouse in prompt 99) are **made up for testing**. Every number in them has been checked to add up.

## Things only you can do (Cursor will ask)
- BotFather: `/setdomain` → certa-two.vercel.app (web login).
- Faucets: Sepolia USDC and ETH for the demo client wallet; Base Sepolia USDC for the agent wallet.
- Create the GitHub repo (private) and branch protection; Vercel env vars; Sentry project.
- Approve any contract redeploy (prompt 40 stops and asks).
- Confirm pricing (₦150,000/month, ₦1,500,000/year, 0.5% release fee) and supply real site photos for the AI eval set if you can.
- Submit on the Rise In platform before 25 Oct 2026.
