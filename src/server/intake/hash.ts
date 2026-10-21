import { createHash } from "node:crypto";

export type HashInput = {
  terms: unknown;
  stages: { name: string; amount_kobo: string; amount_micro: string; criteria: string[]; tags: string[] }[];
  fx: { kobo_per_usdc: string; source: string; as_of: string };
  cap: string;
  retention: string;
  document_hashes: string[];
};

export function canonicalJson(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(input: HashInput): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
