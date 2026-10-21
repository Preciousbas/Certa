import type { LanguageModel } from "./schema.js";
import type { VisionModel } from "./verify.js";

const VERDICT_KEYS = ["stageId", "complete", "confidence", "evidence", "concerns", "safetyFlags"] as const;

function clientHeaders(key: string): Record<string, string> {
  return {
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    "user-agent": "opencode/1.0",
  };
}

function jsonFromText(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? text).trim();
  return JSON.parse(body);
}

export function agentRouterVision(): VisionModel | null {
  const key = process.env.LLM_API_KEY ?? "";
  if (!key) return null;
  const base = (process.env.LLM_BASE_URL || "https://agentrouter.org/v1").replace(/\/$/, "");
  const id = process.env.LLM_VISION_MODEL || "deepseek-v4-flash";
  return {
    id,
    async readPhoto({ stageId, notes, imageBase64 }) {
      const prompt = `stageId: ${stageId}\nnotes: ${notes}`;
      const content = imageBase64
        ? [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ]
        : prompt;
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: clientHeaders(key),
        body: JSON.stringify({
          model: id,
          max_tokens: 800,
          messages: [
            {
              role: "system",
              content: `Look at the site photo. Reply with one JSON object and no other text. Keys: ${VERDICT_KEYS.join(", ")}. stageId must be the stage id you are given. complete is boolean. confidence is a number from 0 to 1. evidence is an array of {item, seen}. concerns and safetyFlags are string arrays. Do not include a tool, action, or release field.`,
            },
            { role: "user", content },
          ],
        }),
      });
      if (!response.ok) throw new Error("The photo model did not answer.");
      const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const answer = payload.choices?.[0]?.message?.content ?? "";
      if (!answer.trim()) throw new Error("The photo model returned no text.");
      return jsonFromText(answer);
    },
  };
}

const CONTRACT_KEYS = [
  "parties",
  "contractSumKobo",
  "currency",
  "stages",
  "retentionBps",
  "defectsPeriodDays",
  "mobilisationBps",
  "deadlines",
  "paymentTerms",
  "liquidatedDamages",
  "ambiguities",
] as const;

export function agentRouterContract(): LanguageModel | null {
  const key = process.env.LLM_API_KEY ?? "";
  if (!key) return null;
  const base = (process.env.LLM_BASE_URL || "https://agentrouter.org/v1").replace(/\/$/, "");
  const id = process.env.LLM_TEXT_MODEL || "deepseek-v4-flash";
  return {
    async extractContract(text: string) {
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: clientHeaders(key),
        body: JSON.stringify({
          model: id,
          max_tokens: 4000,
          messages: [
            {
              role: "system",
              content: `Read the construction contract. Reply with one JSON object and no other text. Keys: ${CONTRACT_KEYS.join(", ")}. currency is NGN. contractSumKobo is a string of kobo (100 kobo = 1 naira). stages is an array of {name, description, amountKobo, percentBps} and must list every stage in the document, including when there are more than ten. retentionBps, defectsPeriodDays, and mobilisationBps are integers. deadlines is a string array. If a figure or a party is missing, do not invent it: leave the empty value and add a short question to ambiguities. Do not include a tool, action, or release field.`,
            },
            { role: "user", content: text.slice(0, 24_000) },
          ],
        }),
      });
      if (!response.ok) throw new Error("The contract model did not answer.");
      const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const answer = payload.choices?.[0]?.message?.content ?? "";
      if (!answer.trim()) throw new Error("The contract model returned no text.");
      return jsonFromText(answer);
    },
    async assessStage() {
      return {};
    },
  };
}
