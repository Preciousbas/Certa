import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import path from "node:path";
import { STAGE_VERIFY_SYSTEM } from "../src/server/ai/prompts/stage_verify.v1.js";
import { STAGE_VERIFY_SYSTEM_V2 } from "../src/server/ai/prompts/stage_verify.v2.js";
import { askVerdict, visionModels } from "../src/server/verify/vision.js";

setDefaultAutoSelectFamilyAttemptTimeout(10_000);

type Label = {
  file: string;
  true_stage: number;
  claimed_stage?: number;
  criteria_met: Record<string, boolean>;
  should_verdict: "pass" | "fail" | "unsure";
  licence?: string;
  source?: string;
  note?: string;
};

type Call = {
  model: string;
  prompt: string;
  labelIndex: number;
  predicted: string;
  stage: number | null;
  confidence: number;
  ms: number;
  ok: boolean;
  error: string;
};

function loadEnv(file: string) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? "") : "";
}

function promptsOf(names: string[]): { name: string; system: string }[] {
  return names.map((name) => {
    if (name === "stage_verify.v2") return { name, system: STAGE_VERIFY_SYSTEM_V2 };
    return { name: "stage_verify.v1", system: STAGE_VERIFY_SYSTEM };
  });
}

function bucket(confidence: number): string {
  if (confidence < 0.5) return "0.00–0.49";
  if (confidence < 0.75) return "0.50–0.74";
  if (confidence < 0.9) return "0.75–0.89";
  return "0.90–1.00";
}

function userMessage(label: Label): string {
  const claimed = label.claimed_stage ?? label.true_stage;
  const criteria = Object.keys(label.criteria_met)
    .map((id) => `${id}: the photo shows the claimed stage of the work, and the work for that stage is in place (required)`)
    .join("; ");
  return [
    "Project: Eval, Lagos.",
    "All stages: 1. Mobilisation and site clearing 2. Excavation and foundation 3. Substructure blockwork 4. Ground floor 5. First floor slab 6. Roof 7. Finishes 8. External works.",
    `Claimed stage: ${claimed}.`,
    `Acceptance criteria: ${criteria || "c1: the photo shows the claimed stage of the work, and the work for that stage is in place (required)"}.`,
    "Photo info: photo 1: taken 21 Oct 2026, 12:00 WAT, 20 m from site.",
  ].join(" ");
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T, index);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function rate(hits: number, total: number): string {
  if (total === 0) return "n/a";
  return (hits / total).toFixed(3);
}

function falsePassAt(calls: Call[], labels: Label[], threshold: number): { rate: number; passes: number; falsePasses: number } {
  const passes = calls.filter((call) => call.ok && call.predicted === "pass" && call.confidence >= threshold);
  const falsePasses = passes.filter((call) => labels[call.labelIndex]?.should_verdict !== "pass");
  return { rate: passes.length === 0 ? 0 : falsePasses.length / passes.length, passes: passes.length, falsePasses: falsePasses.length };
}

function chooseThreshold(calls: Call[], labels: Label[], total: number): { t: number; met: boolean; detail: string } {
  if (calls.length * 2 <= total) {
    return {
      t: 0.75,
      met: false,
      detail: `${calls.length} of ${total} replies parsed, so the false-pass rate was not measured. T stays 0.75 and is not proven.`,
    };
  }
  const steps = [0.75, 0.8, 0.85, 0.9, 0.95];
  for (const t of steps) {
    const row = falsePassAt(calls, labels, t);
    if (row.passes > 0 && row.rate <= 0.02) {
      return {
        t,
        met: true,
        detail: `At T=${t.toFixed(2)} the false-pass rate is ${(row.rate * 100).toFixed(1)}% (${row.falsePasses} of ${row.passes} predicted passes).`,
      };
    }
  }
  const last = falsePassAt(calls, labels, 0.95);
  if (last.passes === 0) {
    return {
      t: 0.75,
      met: false,
      detail: "No predicted passes, so the false-pass rate was not measured. T stays 0.75 and is not proven.",
    };
  }
  return {
    t: 0.95,
    met: false,
    detail: `No T from 0.75 to 0.95 keeps the false-pass rate at or under 2%. At 0.95 it is ${(last.rate * 100).toFixed(1)}% (${last.falsePasses} of ${last.passes} predicted passes).`,
  };
}

function report(labels: Label[], calls: Call[], models: string[], prompts: string[]): string {
  const columns = models.flatMap((model) => prompts.map((prompt) => `${model} / ${prompt}`));
  const matrix = ["pass", "fail", "unsure"].map((truth) => {
    const cells = models.flatMap((model) =>
      prompts.map((prompt) => {
        const subset = calls.filter((call) => call.model === model && call.prompt === prompt && labels[call.labelIndex]?.should_verdict === truth);
        const counts = { pass: 0, fail: 0, unsure: 0 };
        for (const call of subset) {
          const key = call.predicted === "pass" || call.predicted === "fail" ? call.predicted : "unsure";
          counts[key] += 1;
        }
        return `p${counts.pass}/f${counts.fail}/u${counts.unsure}`;
      }),
    );
    return `| ${truth} | ${cells.join(" | ")} |`;
  });
  const parsed = calls.filter((call) => call.ok);
  const passCalls = parsed.filter((call) => labels[call.labelIndex]?.should_verdict === "pass");
  const atDefault = falsePassAt(parsed, labels, 0.75);
  const recallHits = passCalls.filter((call) => call.predicted === "pass" && call.confidence >= 0.75).length;
  const stageHits = parsed.filter((call) => call.stage === labels[call.labelIndex]?.true_stage).length;
  const buckets = ["0.00–0.49", "0.50–0.74", "0.75–0.89", "0.90–1.00"].map((name) => {
    const rows = parsed.filter((call) => bucket(call.confidence) === name);
    const correct = rows.filter((call) => labels[call.labelIndex]?.should_verdict === call.predicted).length;
    return `| ${name} | ${rows.length} | ${rows.length === 0 ? "n/a" : (correct / rows.length).toFixed(2)} |`;
  });
  const latency = calls.reduce((sum, call) => sum + call.ms, 0);
  const chosen = chooseThreshold(parsed, labels, calls.length);
  const failed = calls.filter((call) => !call.ok).length;
  return `# Vision eval ${new Date().toISOString().slice(0, 10)}

Models: ${models.join(", ")}. Prompts: ${prompts.join(", ")}. Labels: ${labels.length}. Finished: ${calls.length}. Parsed replies: ${parsed.length}. Unparsed replies: ${failed}.

## Confusion (truth → predicted pass/fail/unsure)

| Truth | ${columns.join(" | ")} |
| --- | ${columns.map(() => "---").join(" | ")} |
${matrix.join("\n")}

## Scores

Scores below use parsed replies. A predicted pass counts toward precision and the false-pass rate only when confidence is at least 0.75, matching the decision rule at the default threshold. Recall uses the same bar.

- Precision of pass: ${atDefault.passes === 0 ? "n/a" : (1 - atDefault.rate).toFixed(3)} (${atDefault.falsePasses} false passes / ${atDefault.passes} predicted passes).
- False-pass rate: ${atDefault.passes === 0 ? "n/a" : `${(atDefault.rate * 100).toFixed(1)}%`}.
- Recall of pass: ${rate(recallHits, passCalls.length)}.
- Observed-stage accuracy: ${rate(stageHits, parsed.length)}.
- Latency total: ${latency} ms. Mean: ${calls.length === 0 ? "n/a" : Math.round(latency / calls.length)} ms.
- Cost: not returned by the gateway. Stored as null. No price was invented.

## Calibration

| Confidence | n | Accuracy |
| --- | --- | --- |
${buckets.join("\n")}

## Threshold

Chosen T = ${chosen.t.toFixed(2)}. ${chosen.detail}${chosen.met ? " This is the lowest value in {0.75, 0.80, 0.85, 0.90, 0.95} that keeps false passes at or under 2%." : chosen.t === 0.95 ? " The bar was not met on this run, so T stays at the top of the allowed range and the miss is recorded here." : ""}
Unparsed replies are counted in the unsure column.
`;
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env"));
  const fromEnv = visionModels();
  const requested = arg("--models").split(",").map((item) => item.trim()).filter(Boolean);
  const models = requested.length > 0 ? requested : [fromEnv.primary, fromEnv.fallback];
  const uniqueModels = [...new Set(models)];
  let promptNames = (arg("--prompts") || "stage_verify.v1").split(",").map((item) => item.trim()).filter(Boolean);
  if (!arg("--prompts") && uniqueModels.length < 2 && !promptNames.includes("stage_verify.v2")) {
    promptNames = ["stage_verify.v1", "stage_verify.v2"];
  }
  const prompts = promptsOf(promptNames);
  const root = path.join(process.cwd(), "tests/fixtures/stage-photos");
  const allLabels = JSON.parse(readFileSync(path.join(root, "labels.json"), "utf8")) as Label[];
  if (allLabels.length < 40) throw new Error(`Need at least 40 labels, found ${allLabels.length}`);
  const limitText = arg("--limit");
  const photoLimit = limitText ? +limitText : allLabels.length;
  if (!Number.isInteger(photoLimit) || photoLimit < 1) throw new Error("--limit must be a positive whole number.");
  const labels = allLabels.slice(0, photoLimit);
  const jobs: { model: string; prompt: { name: string; system: string }; label: Label; labelIndex: number }[] = [];
  for (const model of uniqueModels) {
    for (const prompt of prompts) {
      labels.forEach((label, labelIndex) => {
        jobs.push({ model, prompt, label, labelIndex });
      });
    }
  }
  const calls: Call[] = [];
  let writing = Promise.resolve();
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(process.cwd(), "docs/eval");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `vision-${date}.md`);
  const journal = path.join(dir, `vision-${date}.jsonl`);
  writeFileSync(journal, "");
  const promptNamesUsed = prompts.map((prompt) => prompt.name);
  function publish(call: Call) {
    calls.push(call);
    const line = JSON.stringify(call);
    const snapshot = calls.slice();
    writing = writing.then(() => {
      appendFileSync(journal, `${line}\n`);
      writeFileSync(file, report(labels, snapshot, uniqueModels, promptNamesUsed));
    });
    return writing;
  }
  await mapPool(jobs, 3, async (job) => {
    const bytes = Uint8Array.from(readFileSync(path.join(root, job.label.file)));
    const started = Date.now();
    const asked = await askVerdict({
      primary: job.model,
      fallback: job.model,
      system: job.prompt.system,
      user: userMessage(job.label),
      images: [bytes],
    });
    const call = {
      model: job.model,
      prompt: job.prompt.name,
      labelIndex: job.labelIndex,
      predicted: asked.verdict?.verdict ?? "unsure",
      stage: asked.verdict?.stage_number_observed ?? null,
      confidence: asked.verdict?.confidence ?? 0,
      ms: Date.now() - started,
      ok: Boolean(asked.verdict),
      error: asked.error,
    } satisfies Call;
    await publish(call);
    process.stdout.write(`finished ${calls.length} of ${jobs.length} ${call.ok ? "parsed" : "unparsed"} ${job.label.file} ${call.ms}ms\n`);
    return call;
  });
  await writing;
  process.stdout.write(`${file}\nparsed ${calls.filter((call) => call.ok).length} of ${calls.length}\n`);
  if (calls.every((call) => !call.ok)) {
    process.stderr.write(`${calls[0]?.error || "The vision gateway returned no verdicts."}\n`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "eval failed"}\n`);
  process.exit(1);
});
