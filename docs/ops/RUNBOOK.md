# Certa operations

Names only. Do not paste secret values into this file, into tickets, or into chat.

## Deploy

The web app deploys on Vercel from `main`. Preview deploys come from pull requests. Production is the Vercel Production environment.

1. Merge the pull request into `main`.
2. Vercel builds `pnpm build` (`apps/web`).
3. Confirm `GET /api/health` returns `status: "ok"` after the deploy. A `503` means a required check failed. Read `checks` before retrying the deploy.

The verify worker is the GitHub Actions workflow `.github/workflows/verify-worker.yml`. It is not part of the Vercel build. Leave that workflow as it is.

## Environment variables

Set these in Vercel (Production and Preview separately) and in GitHub Actions secrets for the worker. Leave a variable blank rather than inventing a value.

App and sessions: `APP_URL`, `NEXT_PUBLIC_APP_URL`, `CERTA_ENV`, `SESSION_SECRET`, `APP_ENCRYPTION_KEY`, `SUPPORT_EMAIL`, `ADMIN_TELEGRAM_IDS`, `CRON_SECRET`.

Database: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `STORAGE_BUCKET_PRIVATE`. Keep `CERTA_SKIP_MIGRATIONS=1` on Vercel. Set `CERTA_RUN_MIGRATIONS=1` only for a one-off migrate process, then turn it off.

Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.

Chain: `CHAIN_ID`, `SEPOLIA_RPC_URL`, `BASE_SEPOLIA_RPC_URL`, `RPC_URL`, `RPC_URL_FALLBACK`, `X402_RPC_URL`, `USDC_ADDRESS`, `ESCROW_FACTORY_ADDRESS`, `ESCROW_ADDRESS`, `FULL_ESCROW_ADDRESS`, `CONFIRMATIONS`, `DEPLOYER_PRIVATE_KEY`, `OPERATOR_WALLET_ADDRESS`, `TREASURY_ADDRESS`, `CLIENT_ADDRESS`, `CONTRACTOR_ADDRESS`, `ADMIN_ADDRESS`, `EVM_PRIVATE_KEY`, `BASESCAN_API_KEY`.

CDP and x402: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `X402_FACILITATOR_URL`, `X402_PAY_TO_ADDRESS`, `X402_MAX_PER_CALL_MICRO`, `WEATHER_RAIN_THRESHOLD_PCT`, `CIRCLE_API_KEY`.

AI and mail: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_VISION_MODEL`, `LLM_TEXT_MODEL`, `AI_DOC_PROVIDER`, `AI_DOC_MODEL`, `AI_DOC_API_KEY`, `AI_DOC_FALLBACK_MODEL`, `AI_VISION_PROVIDER`, `AI_VISION_MODEL`, `AI_VISION_FALLBACK_MODEL`, `STT_API_KEY`, `WEATHER_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`.

Jobs and limits: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RATE_LIMIT_MINI_PER_MIN`, `RATE_LIMIT_UPLOAD_PER_HOUR`, `RATE_LIMIT_AI_PER_HOUR`, `RATE_LIMIT_LOGIN_PER_MIN`, `VERIFY_PASS_THRESHOLD`.

Prices (kobo, display only until charging is switched on): `PLAN_MONTHLY_KOBO`, `PLAN_YEARLY_KOBO`, `RELEASE_FEE_BPS`, `RELEASE_FEE_CAP_KOBO`, `FREE_PROJECT_LIMIT_KOBO`, `FX_SOURCE`, `FX_MANUAL_KOBO_PER_USDC`, `FX_MANUAL_AS_OF`.

Demo: `DEMO_MODE`, `DEMO_SEED`, `DEMO_VIDEO_URL`. Production should leave `DEMO_SEED` false.

Errors: `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`. The app does nothing with Sentry when `SENTRY_DSN` is empty. `SENTRY_AUTH_TOKEN` is only for source-map upload at build time.

## Rotate a key

1. Create the new value in the provider (Telegram BotFather, Supabase, CDP, the RPC provider, Resend, Sentry).
2. Put the new value in Vercel and in the GitHub secret used by `verify-worker.yml`. Do not commit it.
3. Redeploy Production so running servers drop the old value.
4. Revoke the old value at the provider.
5. For `TELEGRAM_BOT_TOKEN`, set the webhook again with `TELEGRAM_WEBHOOK_SECRET`.
6. For `SESSION_SECRET` or `APP_ENCRYPTION_KEY`, expect existing sessions or stored emails to stop decrypting. Rotate those only with a plan to re-login and re-save.

## Worker fails

`verify-worker.yml` runs `pnpm tsx scripts/drain-verify.ts` with `CERTA_SKIP_MIGRATIONS=1`. It must not migrate.

1. Open the failed GitHub Actions run. The log line `verify jobs N` is how many jobs it drained.
2. In `/admin` Diagnostics, read the latest job status and `last_error`. Do not edit the row by hand.
3. If the run cannot reach the database, check `DATABASE_URL` on the GitHub secret, not in the repo.
4. Re-run the workflow with `workflow_dispatch` after the cause is fixed. Do not start a second drain while one is still running.

## Release fails

A stage stays `release_failed` and the payment row is `failed`. The app enqueues one retry with the same idempotency key. It must not send a second release.

1. Open the stage in `/admin` and compare the database status with the chain.
2. Read the transaction hash on Etherscan (Sepolia) if one was stored. No hash means nothing was broadcast.
3. Check the operator wallet still has test ETH for gas, and that CDP is `configured` on the diagnostics page.
4. Let the single retry run. If it fails again, fix the cause (RPC, gas, policy) and use the product retry, not a manual transfer.

## RPC is down

`/api/health` sets `checks.rpc` to `down` and returns `503`. Fund and release screens must stay on "Waiting on chain." until a real transaction hash exists.

1. Try `SEPOLIA_RPC_URL`, then `RPC_URL_FALLBACK`.
2. Switch the Vercel value to a working Ethereum Sepolia endpoint and redeploy.
3. Weather checks use `X402_RPC_URL` (Base Sepolia), which is separate from the escrow RPC.

## x402 or CDP is unreachable

Diagnostics shows CDP as `configured` or `unconfigured`, and whether the `X402_PAY_TO_ADDRESS` guard passes. The guard fails when the address is missing, invalid, or the same as `CLIENT_ADDRESS`. Weather fees must go to the treasury, not the client.

1. If CDP is `unconfigured`, set `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, and `CDP_WALLET_SECRET`, then redeploy.
2. If the pay-to guard fails, set `X402_PAY_TO_ADDRESS` to the treasury and redeploy. Do not point it at the client wallet.
3. Fund and release stay off-chain until CDP is configured. Do not broadcast with `DEPLOYER_PRIVATE_KEY` to paper over a CDP outage.

## Read-only

There is no global read-only flag. To stop money movement:

1. Pause the project from the plan screen. Paused projects reject fund, capture, and dispute.
2. Remove `DEPLOYER_PRIVATE_KEY` and the three CDP variables from Vercel and redeploy. Chain writes then fail closed.
3. Disable `verify-worker.yml` in GitHub Actions so the queue stops draining.
4. Leave `GET` pages and `/api/health` up so people can still read the project.

## Who to contact

Write to the address in `SUPPORT_EMAIL`. The GitHub repository is `Preciousbas/Certa`. Do not send keys, initData, or database URLs in that mail.
