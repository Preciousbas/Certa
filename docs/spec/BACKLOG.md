# Backlog

- Prompt 00–02 spec files are not in the repo. When they arrive, reconcile `0002_foundation.sql` with their table list before adding more migrations.
- Supabase Storage buckets and `supabase gen types` (this prompt's `src/server/db/types.ts`).
- Call `assertServerEnv` on every production boot (`ENFORCE_ENV=1`) after the new variables are set on Vercel. Doing it now would 503 `/api/health` and `/api/mini/fund`.
- Move Inngest's dispute and change timers onto the `jobs` outbox.
- Run every stage status write through `transitionStage`.
- ESLint type-checked rules on `apps/` and `packages/`. They still lint with `tsc` only, because existing display code uses `toFixed` for confidence.
- `scripts/seed-demo.ts` body (prompt 99): one `is_demo` workspace, including a stage above the cap.
- Browser reads go through server components and `/api/*`. A Supabase user JWT is not minted.
- Letterhead email, cash-out partner, and OCR for photographed bills.
- BotFather `/setdomain` for `certa-two.vercel.app` before the Telegram Login Widget can sign in on the deployed site.
- A `telegram.update` job runs on the cron worker. Slow webhook updates are dispatched there, and a processed `update_id` is not dispatched again.
- `pnpm audit --prod` highs: `xlsx` has no patched npm release; `postcss` is pinned by Next. See `docs/SECURITY.md`.
- Prompt 30 (BoQ intake): replace the `xlsx` package with `exceljs`. `xlsx` has unpatched high vulnerabilities (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9) and no fixed npm release. Prompt 30 already specifies `exceljs` for `.xlsx`. See `docs/BACKLOG.md`.
