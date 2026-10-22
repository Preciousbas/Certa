import { z } from "zod";

export const errorBody = z
  .object({
    error: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().min(1),
  })
  .strict();

export const projectIdField = z.string().uuid();

export const fundInput = z
  .object({
    projectId: projectIdField,
    upToStage: z.number().int().min(0).max(63),
    idempotencyKey: z.string().min(16).max(80),
    currency: z.enum(["usdc", "ngn"]).default("usdc"),
  })
  .strict();

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
  stages: z.array(
    z.object({
      name: z.string().min(1),
      amountNgnKobo: z.string().regex(/^\d+$/),
      amountUsdc: z.string().regex(/^\d+$/),
    }),
  ),
});

export const nonceInput = z.object({ projectId: projectIdField, stageId: projectIdField }).strict();
export const nonceOutput = z.object({ nonce: z.string().min(16), expiresAt: z.string().min(1) }).strict();

export const captureFields = z
  .object({
    projectId: projectIdField,
    stageId: projectIdField,
    nonce: z.string().min(16),
    capturedAt: z.string().regex(/^\d+$/),
    lat: z.string(),
    lng: z.string(),
    accuracy: z.string(),
    deviceInfo: z.string().max(300).optional(),
  })
  .strict();

export const captureOutput = z.object({
  accepted: z.boolean(),
  trust: z.enum(["high", "low", "rejected"]),
  reasons: z.array(z.string()),
  message: z.string(),
  photoId: z.string().uuid().optional(),
});

export const submissionInput = z
  .object({
    projectId: projectIdField,
    stageId: projectIdField,
    nonce: z.string().min(16),
  })
  .strict();

export const submissionOutput = z
  .object({
    ok: z.literal(true),
    message: z.string(),
    submissionId: z.string().uuid(),
  })
  .strict();

export const releaseInput = z
  .object({
    projectId: projectIdField,
    stageId: projectIdField,
    idempotencyKey: z.string().min(16).max(80),
  })
  .strict();

export const changeInput = z
  .object({
    projectId: projectIdField,
    changeId: projectIdField,
    decision: z.enum(["accept", "decline"]),
    reason: z.string().max(500).optional(),
  })
  .strict()
  .refine((value) => value.decision !== "decline" || Boolean(value.reason?.trim()), {
    message: "A no needs a reason.",
  });

export const disputeInput = z
  .object({
    projectId: projectIdField,
    stageId: projectIdField,
    reason: z.string().min(1).max(500),
  })
  .strict();

export const cashoutInput = z.object({ projectId: projectIdField }).strict();

export const reviewInput = z
  .object({
    projectId: projectIdField,
    stageId: projectIdField,
    decision: z.enum(["approve", "reject"]),
    reason: z.string().max(500).optional(),
  })
  .strict();

export const reviewOutput = z
  .object({
    ok: z.literal(true),
    recorded: z.literal(true),
    moneyMoved: z.literal(false),
  })
  .strict();

export const planInput = z.object({ projectId: projectIdField }).strict();
export const planOutput = z.object({ status: z.enum(["active", "paused", "draft", "closed"]) }).strict();

export const documentsInput = z.object({ projectId: projectIdField }).strict();

export const emptyQuery = z.object({}).strict();

export const fileQuery = z
  .object({
    key: z.string().min(1),
    user: z.string().min(1),
    exp: z.string().regex(/^\d+$/),
    sig: z.string().min(1),
  })
  .strict();

export const loginWidgetInput = z
  .object({
    id: z.string().regex(/^\d+$/),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    username: z.string().optional(),
    photo_url: z.string().optional(),
    auth_date: z.string().regex(/^\d+$/),
    hash: z.string().min(1),
  })
  .strict();

export function apiError(status: number, message: string, error = "request_failed"): Response {
  const requestId = crypto.randomUUID();
  const body = errorBody.parse({ error, message, requestId });
  return Response.json(body, { status });
}

export function apiJson<T>(schema: z.ZodType<T>, value: T, status = 200): Response {
  return Response.json(schema.parse(value), { status });
}

export function queryOf(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}
