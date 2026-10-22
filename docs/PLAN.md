# Plan

## BoQ intake (current)

An uploaded bill with item, quantity, rate, and amount is checked in code. Stage amounts are the section totals and must equal the contract sum. Production pages skip the seeded Lekki project unless `DEMO_SEED=true`. Both sides accept before `/api/mini/fund` will lock money on an uploaded project. Photos of paper bills and on-chain escrow creation from that schedule are not in this pass.

Written 20 Oct 2026 after a black-box audit of https://certa-two.vercel.app. The auditor did not have this repo. Several findings were already fixed in code and only looked missing from the outside.

## Already real

- Escrow factory `0x4F4c6cc95465ceFe8a967E351EEdE69d40660423` and pilot escrow `0x5289dcc36EdC15AdC6314F75EcBFa745e70BD44d` on Ethereum Sepolia. The pilot holds 2 USDC. No `submitStage` or `releaseStage` has been sent yet.
- The capture route reads JPEG EXIF, stamps the photo, sends it to the vision model, and can broadcast submit plus release when the model recommends release and the chain stage is funded.
- The bot accepts a contract file, extracts however many stages it lists (up to 64), and asks for blank terms.
- Supabase is the database behind `DATABASE_URL`. Production health reports `db: ok`.
- One Central Bank rate is fetched for the fund page, the home note, and the bot.

## What this pass changes

- `/api/health` names the factory even when the Vercel env var is empty, and reports `supabase` when `DATABASE_URL` is a Supabase host.
- Timeline, stage ledger, and the fund total use the chain stage amount times that one Central Bank rate. The schedule printed on the page stays in one sentence, so it no longer pretends to be the money in the escrow.
- The fund page total follows the Naira / USDC choice on that form.
- The seeded 0.78 score is not shown as a live AI check.
- x402 uses `X402_PAY_TO_ADDRESS`, then `CLIENT_ADDRESS`, so the paid routes can return a payment challenge instead of "not configured".
- Wallet says Etherscan. Export certificate opens a real page. Unknown routes get a Certa 404. The shell links the pilot escrow.
- The Telegram webhook passes the Central Bank rate into the bot.

## Still open, and why

- Client, consultant, and operator on the live escrow are one wallet. Those roles are fixed in the create transaction. Splitting them needs a new escrow.
- The spending cap is 5 USDC and each pilot stage is 1 USDC, so Approve cannot trigger on this escrow. The cap is not a setter. A new escrow with one stage above the cap is the next chain step, and it spends test USDC.
- No release transaction exists yet. That happens when a real photo passes the checks on a funded stage.
- x402 still needs a payer to settle $0.01. The route can ask for payment. The bot does not yet send that payment itself.
- Letterhead email, cash-out, and a separate demo workspace that is not the Lekki seed are not in this pass.
- Grammy conversation state for contract follow-up questions is still in process memory.
