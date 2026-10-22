import { StageVerdict, StageVerdictV3 } from "../../lib/validation/stageVerdict.js";
import { STAGE_VERIFY_SYSTEM } from "../ai/prompts/stage_verify.v1.js";
import { resizeLongSide, VISION_LONG_SIDE } from "./jpeg.js";

export const VISION_TIMEOUT_MS = 240_000;

export type VisionRequest = {
  model: string;
  system: string;
  user: string;
  images: Uint8Array[];
  timeoutMs?: number;
};

export type VisionReply = {
  text: string;
  latencyMs: number;
  costMicro: bigint | null;
};

export type VisionClient = (input: VisionRequest) => Promise<VisionReply>;

export class VisionUnavailable extends Error {
  constructor() {
    super("automatic check unavailable");
    this.name = "VisionUnavailable";
  }
}

export class VisionRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisionRejected";
  }
}

type Attempt = { model: string; hint: string };

export function visionAttempts(primary: string, fallback: string, zodError = ""): Attempt[] {
  return [
    { model: primary, hint: "" },
    { model: primary, hint: zodError },
    { model: fallback, hint: zodError },
  ];
}

export function visionModels(): { primary: string; fallback: string; provider: string } {
  const primary = process.env.AI_VISION_MODEL || process.env.LLM_VISION_MODEL || "deepseek-v4-flash";
  const fallback = process.env.AI_VISION_FALLBACK_MODEL || primary;
  const provider = process.env.AI_VISION_PROVIDER || process.env.LLM_PROVIDER || "agentrouter";
  return { primary, fallback, provider };
}

export function parseModelJson(text: string): { verdict: StageVerdict | null; error: string } {
  const extracted = extractJson(text);
  if (!extracted.ok) return { verdict: null, error: extracted.error };
  const parsed = StageVerdict.safeParse(extracted.value);
  if (parsed.success) return { verdict: parsed.data, error: "" };
  return { verdict: null, error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
}

export function parseChecklistJson(text: string): { reply: StageVerdictV3 | null; error: string } {
  const extracted = extractJson(text);
  if (!extracted.ok) return { reply: null, error: extracted.error };
  const parsed = StageVerdictV3.safeParse(extracted.value);
  if (parsed.success) return { reply: parsed.data, error: "" };
  return { reply: null, error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
}

function extractJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    return { ok: true, value: JSON.parse((fenced?.[1] ?? text).trim()) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "invalid json" };
  }
}

export async function defaultVisionClient(input: VisionRequest): Promise<VisionReply> {
  const key = process.env.AI_DOC_API_KEY || process.env.LLM_API_KEY || "";
  if (!key) throw new VisionUnavailable();
  const base = (process.env.LLM_BASE_URL || "https://agentrouter.org/v1").replace(/\/$/, "");
  if (/^gpt-/i.test(input.model)) return postResponses(base, key, input);
  return postChatCompletion(base, key, input);
}

async function postChatCompletion(base: string, key: string, input: VisionRequest): Promise<VisionReply> {
  const started = Date.now();
  const images = await Promise.all(input.images.map((image) => resizeLongSide(image, VISION_LONG_SIDE)));
  const content: unknown[] = [{ type: "text", text: input.user }];
  for (const image of images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${Buffer.from(image).toString("base64")}` },
    });
  }
  const body: Record<string, unknown> = {
    model: input.model,
    temperature: 0,
    max_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.system },
      { role: "user", content },
    ],
  };
  const response = await postChat(base, key, body, input.timeoutMs ?? VISION_TIMEOUT_MS);
  const payload = (await response.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };
  if (!response.ok) throw new VisionRejected(payload.error?.message || `vision gateway ${response.status}`);
  const text = payload.choices?.[0]?.message?.content ?? "";
  return { text, latencyMs: Date.now() - started, costMicro: null };
}

type ResponsePart = { type?: string; text?: string };
type ResponseItem = { type?: string; content?: ResponsePart[] };
type ResponsePayload = {
  error?: { message?: string };
  output_text?: string;
  output?: ResponseItem[];
};

function responseText(payload: ResponsePayload): string {
  if (payload.output_text?.trim()) return payload.output_text;
  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.text) parts.push(part.text);
    }
  }
  return parts.join("");
}

async function postResponses(base: string, key: string, input: VisionRequest): Promise<VisionReply> {
  const started = Date.now();
  const images = await Promise.all(input.images.map((image) => resizeLongSide(image, VISION_LONG_SIDE)));
  const content: unknown[] = [{ type: "input_text", text: input.user }];
  for (const image of images) {
    content.push({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${Buffer.from(image).toString("base64")}`,
    });
  }
  const body: Record<string, unknown> = {
    model: input.model,
    max_output_tokens: 8000,
    instructions: input.system,
    input: [{ role: "user", content }],
    text: { format: { type: "json_object" } },
  };
  const response = await postJson(`${base}/responses`, key, body, input.timeoutMs ?? VISION_TIMEOUT_MS);
  const payload = (await response.json()) as ResponsePayload;
  if (response.status === 400 && body.text) {
    delete body.text;
    const again = await postJson(`${base}/responses`, key, body, input.timeoutMs ?? VISION_TIMEOUT_MS);
    const second = (await again.json()) as ResponsePayload;
    if (!again.ok) throw new VisionRejected(second.error?.message || `vision gateway ${again.status}`);
    return { text: responseText(second), latencyMs: Date.now() - started, costMicro: null };
  }
  if (!response.ok) throw new VisionRejected(payload.error?.message || `vision gateway ${response.status}`);
  return { text: responseText(payload), latencyMs: Date.now() - started, costMicro: null };
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function postJson(url: string, key: string, body: Record<string, unknown>, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "user-agent": "opencode/1.0",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function postChat(base: string, key: string, body: Record<string, unknown>, timeoutMs: number): Promise<Response> {
  const first = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "user-agent": "opencode/1.0",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (first.status !== 400 || !("response_format" in body)) return first;
  const plain = { ...body };
  delete plain.response_format;
  return fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "user-agent": "opencode/1.0",
    },
    body: JSON.stringify(plain),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function askVerdict(input: {
  system?: string;
  user: string;
  images: Uint8Array[];
  primary?: string;
  fallback?: string;
  client?: VisionClient;
  timeoutMs?: number;
}): Promise<{ verdict: StageVerdict | null; raw: string; model: string; latencyMs: number; error: string }> {
  const models = visionModels();
  const primary = input.primary ?? models.primary;
  const fallback = input.fallback ?? models.fallback;
  const client = input.client ?? defaultVisionClient;
  const system = input.system ?? STAGE_VERIFY_SYSTEM;
  const budget = input.timeoutMs ?? VISION_TIMEOUT_MS;
  const startedAt = Date.now();
  let hint = "";
  let raw = "";
  let latency = 0;
  let model = primary;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = budget - (Date.now() - startedAt);
    if (remaining <= 0) return { verdict: null, raw, model, latencyMs: latency, error: "timed out" };
    model = attempt === 2 ? fallback : primary;
    const user = hint ? `${input.user}\nThe previous JSON failed validation: ${hint}\nReturn only JSON matching the schema.` : input.user;
    try {
      const reply = await client({ model, system, user, images: input.images, timeoutMs: remaining });
      raw = reply.text;
      latency += reply.latencyMs;
    } catch (error) {
      if (isTimeout(error) || budget - (Date.now() - startedAt) <= 0) {
        return { verdict: null, raw: "", model, latencyMs: latency, error: "timed out" };
      }
      if (error instanceof VisionUnavailable || error instanceof VisionRejected) {
        return { verdict: null, raw: "", model, latencyMs: latency, error: error.message };
      }
      raw = "";
      hint = "The model did not return JSON.";
      continue;
    }
    const parsed = parseModelJson(raw);
    if (parsed.verdict) return { verdict: parsed.verdict, raw, model, latencyMs: latency, error: "" };
    hint = parsed.error;
    if (attempt === 2) return { verdict: null, raw, model, latencyMs: latency, error: parsed.error };
  }
  return { verdict: null, raw, model, latencyMs: latency, error: hint };
}

export async function askChecklist(input: {
  system: string;
  user: string;
  images: Uint8Array[];
  model: string;
  client?: VisionClient;
  timeoutMs?: number;
}): Promise<{ reply: StageVerdictV3 | null; raw: string; latencyMs: number; error: string }> {
  const client = input.client ?? defaultVisionClient;
  const budget = input.timeoutMs ?? VISION_TIMEOUT_MS;
  const startedAt = Date.now();
  let hint = "";
  let raw = "";
  let latency = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = budget - (Date.now() - startedAt);
    if (remaining <= 0) return { reply: null, raw, latencyMs: latency, error: "timed out" };
    const user = hint ? `${input.user}\nThe previous JSON failed validation: ${hint}\nReturn only the checklist JSON.` : input.user;
    try {
      const reply = await client({
        model: input.model,
        system: input.system,
        user,
        images: input.images,
        timeoutMs: remaining,
      });
      raw = reply.text;
      latency += reply.latencyMs;
    } catch (error) {
      if (isTimeout(error) || budget - (Date.now() - startedAt) <= 0) {
        return { reply: null, raw: "", latencyMs: latency, error: "timed out" };
      }
      if (error instanceof VisionUnavailable || error instanceof VisionRejected) {
        return { reply: null, raw: "", latencyMs: latency, error: error.message };
      }
      hint = "The model did not return JSON.";
      continue;
    }
    const parsed = parseChecklistJson(raw);
    if (parsed.reply) return { reply: parsed.reply, raw, latencyMs: latency, error: "" };
    hint = parsed.error;
  }
  return { reply: null, raw, latencyMs: latency, error: hint || "invalid json" };
}
