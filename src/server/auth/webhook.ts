import { getDatabase, telegramUpdates, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { enqueueJob } from "../jobs/enqueue.js";
import { tokensMatch } from "./http.js";

export const telegramUpdateSchema = z
  .object({
    update_id: z.number().int().nonnegative(),
    message: z.unknown().optional(),
    callback_query: z.unknown().optional(),
    my_chat_member: z.unknown().optional(),
  })
  .strict();

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

const QUICK_MS = 1_800;

export function requireWebhookSecret(request: Request): Response | null {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!secret) {
    const requestId = crypto.randomUUID();
    return Response.json(
      { error: "unconfigured", message: "Bot webhook is not configured.", requestId },
      { status: 503 },
    );
  }
  const header = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!tokensMatch(header, secret)) return new Response(null, { status: 401 });
  return null;
}

export async function acceptTelegramUpdate(
  request: Request,
  deps?: {
    db?: Database;
    dispatch?: (update: TelegramUpdate) => Promise<void>;
  },
): Promise<Response> {
  const denied = requireWebhookSecret(request);
  if (denied) return denied;
  const db = deps?.db ?? (await getDatabase());
  const dispatch = deps?.dispatch ?? (() => Promise.resolve());
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return new Response(null, { status: 200 });
  }
  const parsed = telegramUpdateSchema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 200 });
  const inserted = await db
    .insert(telegramUpdates)
    .values({ updateId: BigInt(parsed.data.update_id) })
    .onConflictDoNothing()
    .returning();
  if (!inserted[0]) return new Response(null, { status: 200 });

  const done = dispatch(parsed.data)
    .then(() => "ok" as const)
    .catch((error: unknown) => (error instanceof Error ? error.message : "failed"));
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    done,
    new Promise<"timeout">((resolve) => {
      timeoutId = setTimeout(() => resolve("timeout"), QUICK_MS);
    }),
  ]);
  if (timeoutId) clearTimeout(timeoutId);

  if (result === "timeout") {
    const payload = JSON.parse(JSON.stringify(parsed.data)) as Record<string, unknown>;
    await enqueueJob(db, {
      kind: "telegram.update",
      dedupeKey: `telegram.update:${parsed.data.update_id}`,
      payload,
    });
    return new Response(null, { status: 200 });
  }
  if (result === "ok") {
    await db
      .update(telegramUpdates)
      .set({ processedAt: new Date() })
      .where(eq(telegramUpdates.updateId, BigInt(parsed.data.update_id)));
  } else {
    await db
      .update(telegramUpdates)
      .set({ error: result.slice(0, 500) })
      .where(eq(telegramUpdates.updateId, BigInt(parsed.data.update_id)));
  }
  return new Response(null, { status: 200 });
}
