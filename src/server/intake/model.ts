import { agentRouterDocCall, type DocModelPart } from "@certa/ai";
import { MODEL_SLOW } from "./messages.js";

export type DocModelSettings = { model: string; key: string; base: string };

let warned = false;

export function resetDocModelWarning(): void {
  warned = false;
}

export function docModelSettings(): DocModelSettings | null {
  const model = process.env.AI_DOC_MODEL?.trim() ?? "";
  const key = (process.env.AI_DOC_API_KEY || process.env.LLM_API_KEY || "").trim();
  if (!model || !key) {
    if (!warned) {
      warned = true;
      console.warn("AI_DOC_MODEL or AI_DOC_API_KEY is not set. Extraction is using the deterministic parser.");
    }
    return null;
  }
  const base = (process.env.AI_DOC_BASE_URL || process.env.LLM_BASE_URL || "https://agentrouter.org/v1").replace(/\/$/, "");
  return { model, key, base };
}

export function docModelSupportsImages(): boolean {
  const model = process.env.AI_DOC_MODEL?.trim() ?? "";
  const key = (process.env.AI_DOC_API_KEY || process.env.LLM_API_KEY || "").trim();
  if (!model || !key) return false;
  return process.env.AI_DOC_SUPPORTS_IMAGES !== "0";
}

export async function proposeWithModel(input: { text: string; images?: DocModelPart[] }): Promise<{ source: "model" | "parser"; text: string | null; notice: string | null }> {
  const settings = docModelSettings();
  if (!settings) return { source: "parser", text: null, notice: null };
  if (process.env.VITEST && process.env.AI_DOC_ALLOW_NETWORK !== "1") return { source: "parser", text: null, notice: null };
  try {
    const text = await agentRouterDocCall({ ...settings, text: input.text, images: input.images });
    return { source: "model", text, notice: null };
  } catch {
    return { source: "parser", text: null, notice: MODEL_SLOW };
  }
}
