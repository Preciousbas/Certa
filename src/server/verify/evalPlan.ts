import { findChecklist } from "./checklists.js";

export type EvalArgs = {
  model: string | null;
  limit: number;
  longSide: 1024 | 1568;
  withV2: boolean;
  run: boolean;
};

const VERDICTS = new Set(["pass", "fail", "unsure"]);

export function parseEvalArgs(argv: string[]): EvalArgs {
  let model: string | null = null;
  let limit = 6;
  let longSide: 1024 | 1568 = 1024;
  let withV2 = false;
  let run = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? "";
    if (flag === "--run") {
      run = true;
      continue;
    }
    if (flag === "--with-v2") {
      withV2 = true;
      continue;
    }
    if (flag === "--model" || flag === "--limit" || flag === "--long-side") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${flag} needs a value.`);
      index += 1;
      if (flag === "--model") {
        if (!value.trim() || value.startsWith("-")) throw new Error("--model needs a model id.");
        model = value;
        continue;
      }
      if (flag === "--limit") {
        if (!/^\d+$/.test(value)) throw new Error("--limit must be a whole number from 1 to 20.");
        let parsed = 0;
        for (const char of value) parsed = parsed * 10 + char.charCodeAt(0) - 48;
        if (parsed < 1 || parsed > 20)
          throw new Error("--limit must be a whole number from 1 to 20.");
        limit = parsed;
        continue;
      }
      if (value !== "1024" && value !== "1568")
        throw new Error("--long-side must be 1024 or 1568.");
      longSide = value === "1568" ? 1568 : 1024;
      continue;
    }
    throw new Error(`Unknown argument ${flag}.`);
  }
  return { model, limit, longSide, withV2, run };
}

export function plannedCalls(photos: number, withV2: boolean): number {
  return photos * (withV2 ? 3 : 2);
}

export function evalFileStem(date: string, model: string, longSide: number): string {
  const body = `${date}-${model}-${longSide}`.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
  return `checklist-${body}`;
}

export function labelErrors(labels: unknown): string[] {
  if (!Array.isArray(labels)) return ["Labels must be a list."];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const entry of labels) {
    if (!entry || typeof entry !== "object") {
      errors.push("A label must be an object.");
      continue;
    }
    const row = entry as { file?: unknown; claimed_stage?: unknown; should_verdict?: unknown };
    const file = row.file;
    if (typeof file !== "string" || !file.endsWith(".jpg") || file.includes("/")) {
      errors.push("Each file must be a .jpg name with no slash.");
    } else if (seen.has(file)) {
      errors.push(`duplicate file ${file}`);
    } else {
      seen.add(file);
    }
    const stage = row.claimed_stage;
    if (typeof stage !== "number" || !Number.isInteger(stage) || !findChecklist(stage)) {
      errors.push(`claimed_stage ${String(stage)} is not a known checklist stage`);
    }
    const verdict = row.should_verdict;
    if (typeof verdict !== "string" || !VERDICTS.has(verdict)) {
      errors.push(`should_verdict ${String(verdict)} must be pass, fail, or unsure`);
    }
  }
  return errors;
}
