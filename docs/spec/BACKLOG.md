# Backlog

- Prompt 00–02 spec files are not in the repo. When they arrive, reconcile `0002_foundation.sql` with their table list before adding more migrations.
- Supabase Storage buckets and `supabase gen types` (this prompt's `src/server/db/types.ts`).
- Call `assertServerEnv` on every production boot (`ENFORCE_ENV=1`) after the new variables are set on Vercel. Doing it now would 503 `/api/health` and `/api/mini/fund`.
- Move Inngest's dispute and change timers onto the `jobs` outbox.
- Run every stage status write through `transitionStage`.
- ESLint type-checked rules on `apps/` and `packages/`. They still lint with `tsc` only, because existing display code uses `toFixed` for confidence.
- `scripts/seed-demo.ts` body (prompt 99): one `is_demo` workspace, including a stage above the cap.
- Letterhead email, cash-out partner, and OCR for photographed bills.
