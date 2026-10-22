import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().min(1),
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional(),
});

export function clientEnv(source: Record<string, string | undefined>) {
  return clientSchema.parse({
    NEXT_PUBLIC_APP_URL: source.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: source.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
  });
}
