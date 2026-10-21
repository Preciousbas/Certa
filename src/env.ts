import { z } from "zod";

const required = z.string().min(1);

const serverSchema = z.object({
  DATABASE_URL: required,
  TELEGRAM_BOT_TOKEN: required,
  TELEGRAM_WEBHOOK_SECRET: required,
  TELEGRAM_BOT_USERNAME: required,
  APP_URL: required,
  CHAIN_ID: z.literal("11155111"),
  RPC_URL: required,
  RPC_URL_FALLBACK: required,
  USDC_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  ESCROW_FACTORY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  CDP_API_KEY_ID: required,
  CDP_API_KEY_SECRET: required,
  CDP_WALLET_SECRET: required,
  AI_DOC_PROVIDER: required,
  AI_DOC_MODEL: required,
  AI_DOC_FALLBACK_MODEL: required,
  AI_VISION_PROVIDER: required,
  AI_VISION_MODEL: required,
  AI_VISION_FALLBACK_MODEL: required,
  LLM_API_KEY: required,
  SESSION_SECRET: z.string().min(32),
  ADMIN_TELEGRAM_IDS: required,
  SUPPORT_EMAIL: z.string().email(),
  FX_SOURCE: z.enum(["manual", "api"]),
  FX_MANUAL_KOBO_PER_USDC: z.string().regex(/^\d+$/),
  FX_MANUAL_AS_OF: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  UPSTASH_REDIS_REST_URL: required,
  UPSTASH_REDIS_REST_TOKEN: required,
  CRON_SECRET: required,
  SENTRY_DSN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

function messageFor(issue: z.ZodIssue): string {
  const name = String(issue.path[0] ?? "environment");
  const missing = issue.code === "invalid_type" || issue.code === "too_small";
  return missing
    ? `Invalid environment: ${name} is required`
    : `Invalid environment: ${name} is invalid`;
}

/** Fail with the variable name only. Call this at boot when ENFORCE_ENV=1. */
export function assertServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const mapped = {
    ...source,
    APP_URL: source.APP_URL || source.NEXT_PUBLIC_APP_URL,
    RPC_URL: source.RPC_URL || source.SEPOLIA_RPC_URL,
    AI_DOC_PROVIDER: source.AI_DOC_PROVIDER || source.LLM_PROVIDER,
    AI_DOC_MODEL: source.AI_DOC_MODEL || source.LLM_TEXT_MODEL,
    AI_VISION_PROVIDER: source.AI_VISION_PROVIDER || source.LLM_PROVIDER,
    AI_VISION_MODEL: source.AI_VISION_MODEL || source.LLM_VISION_MODEL,
    AI_DOC_FALLBACK_MODEL: source.AI_DOC_FALLBACK_MODEL || source.LLM_TEXT_MODEL,
    AI_VISION_FALLBACK_MODEL: source.AI_VISION_FALLBACK_MODEL || source.LLM_VISION_MODEL,
  };
  const parsed = serverSchema.safeParse(mapped);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(first ? messageFor(first) : "Invalid environment: environment is required");
  }
  return parsed.data;
}

export function bootEnv(): void {
  if (process.env.ENFORCE_ENV !== "1") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.VITEST) return;
  try {
    assertServerEnv(process.env);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid environment: environment is required";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
