import { z } from "zod";

export const errorBody = z.object({ error: z.string().min(1) });

export const projectIdField = z.string().uuid();

export const fundInput = z.object({
  projectId: projectIdField,
  upToStage: z.number().int().min(0).max(63),
  idempotencyKey: z.string().min(16).max(80),
  currency: z.enum(["usdc", "ngn"]).default("usdc"),
});

const hexAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const hexTx = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

export const fundOutput = z.object({
  ok: z.literal(true),
  created: z.boolean(),
  paymentId: z.string().uuid(),
  status: z.enum(["pending", "confirmed"]),
  rail: z.enum(["usdc", "ngn"]),
  amountUsdc: z.string().regex(/^\d+$/),
  amountNgnKobo: z.string().regex(/^\d+$/),
  txHash: hexTx.nullable(),
  escrowAddress: hexAddress.nullable(),
  contractorNotified: z.boolean(),
  stages: z.array(z.object({
    name: z.string().min(1),
    amountNgnKobo: z.string().regex(/^\d+$/),
    amountUsdc: z.string().regex(/^\d+$/),
  })),
});

export const nonceInput = z.object({
  projectId: projectIdField,
  stageId: projectIdField,
});

export const nonceOutput = z.object({ nonce: z.string().min(16) });

export const captureOutput = z.object({
  accepted: z.boolean(),
  trust: z.enum(["high", "low", "rejected"]),
  reasons: z.array(z.string()),
});

export const releaseInput = z.object({
  projectId: projectIdField,
  stageId: projectIdField,
  idempotencyKey: z.string().min(16).max(80),
});

export const changeInput = z
  .object({
    projectId: projectIdField,
    changeId: projectIdField,
    decision: z.enum(["accept", "decline"]),
    reason: z.string().max(500).optional(),
  })
  .refine((value) => value.decision !== "decline" || Boolean(value.reason?.trim()), {
    message: "A no needs a reason.",
  });

export const disputeInput = z.object({
  projectId: projectIdField,
  stageId: projectIdField,
  reason: z.string().min(1).max(500),
});

export const cashoutInput = z.object({ projectId: projectIdField });

export const reviewInput = z.object({
  projectId: projectIdField,
  stageId: projectIdField,
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});

export const reviewOutput = z.object({
  ok: z.literal(true),
  recorded: z.literal(true),
  moneyMoved: z.literal(false),
});

export const planInput = z.object({ projectId: projectIdField });

export const planOutput = z.object({ status: z.enum(["active", "paused", "draft", "closed"]) });

export function apiError(status: number, error: string): Response {
  return Response.json(errorBody.parse({ error }), { status });
}

export function apiJson<T>(schema: z.ZodType<T>, value: T, status = 200): Response {
  return Response.json(schema.parse(value), { status });
}
