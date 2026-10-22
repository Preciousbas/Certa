import { mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import path from "node:path";
import { STAGE_VERIFY_SYSTEM_V2 } from "../src/server/ai/prompts/stage_verify.v2.js";
import { STAGE_VERIFY_SYSTEM_V3 } from "../src/server/ai/prompts/stage_verify.v3.js";
import { checklistFor, checklistUserMessage, STAGE_CHECKLISTS } from "../src/server/verify/checklists.js";
import { alignAnswers, combineChecklistRuns, scoreChecklist } from "../src/server/verify/checklistScore.js";
import { DEFAULT_PASS_THRESHOLD, FAIL_CONFIDENCE } from "../src/server/verify/decide.js";
import { askChecklist, askVerdict } from "../src/server/verify/vision.js";

setDefaultAutoSelectFamilyAttemptTimeout(10_000);

const MODEL = "gpt-6.1-sol";
const ROOT = path.join(process.cwd(), "tests/fixtures/stage-photos/real");

type Label = {
  file: string;
  claimed_stage: number;
  should_verdict: "pass" | "fail" | "unsure";
  note?: string;
};

type Row = {
  file: string;
  prompt: "stage_verify.v3" | "stage_verify.v2";
  run: 1 | 2 | "pair";
  claimed_stage: number;
  expected: Label["should_verdict"];
  parsed: boolean;
  predicted: "pass" | "fail" | "unsure" | "unparsed";
  confidence: number | null;
  seconds: number;
  false_pass: boolean;
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

function seconds(ms: number): number {
  return Math.round(ms / 100) / 10;
}

function v2User(label: Label): string {
  const list = checklistFor(label.claimed_stage);
  const stages = STAGE_CHECKLISTS.map((stage) => `${stage.stage}. ${stage.name}`).join(" ");
  const criteria = list.items.map((item) => `${item.id}: ${item.text} (required)`).join(" ");
  return `Project: Eval. All stages: ${stages}. Claimed stage: ${list.stage}. ${list.name}. Acceptance criteria: ${criteria}. Photo info: photo 1: taken on site.`;
}

function v2Label(verdict: string | undefined, confidence: number): Row["predicted"] {
  if (verdict === "pass" && confidence >= DEFAULT_PASS_THRESHOLD) return "pass";
  if (verdict === "fail" && confidence >= FAIL_CONFIDENCE) return "fail";
  return "unsure";
}

function rowOf(input: Omit<Row, "false_pass" | "seconds"> & { ms: number }): Row {
  return {
    file: input.file,
    prompt: input.prompt,
    run: input.run,
    claimed_stage: input.claimed_stage,
    expected: input.expected,
    parsed: input.parsed,
    predicted: input.predicted,
    confidence: input.confidence,
    seconds: seconds(input.ms),
    false_pass: input.predicted === "pass" && input.expected !== "pass",
    error: input.error,
  };
}

function summarise(title: string, rows: Row[]): string {
  const calls = rows.filter((row) => row.run !== "pair");
  const scored = rows.filter((row) => (row.prompt === "stage_verify.v3" ? row.run === "pair" : row.run === 1));
  const parsed = scored.filter((row) => row.parsed);
  const correct = parsed.filter((row) => row.predicted === row.expected).length;
  const falsePasses = scored.filter((row) => row.false_pass).length;
  const mean = calls.length === 0 ? 0 : calls.reduce((sum, row) => sum + row.seconds, 0) / calls.length;
  return [
    `## ${title}`,
    "",
    `Parsed ${parsed.length} of ${scored.length}. Correct pass/fail ${correct}. False passes ${falsePasses}. Average ${seconds(mean * 1000)} seconds per call.`,
    "",
  ].join("\n");
}

function report(rows: Row[]): string {
  const scored = rows.filter((row) => row.prompt === "stage_verify.v2" || row.run === "pair");
  const lines = scored.map((row) => {
    return `| ${row.file} | ${row.prompt} | ${row.claimed_stage} | ${row.expected} | ${row.parsed ? row.predicted : "unparsed"} | ${row.false_pass ? "yes" : "no"} | ${row.seconds} |`;
  });
  return [
    `# Checklist eval ${new Date().toISOString().slice(0, 10)}`,
    "",
    `Model ${MODEL}. Prompts stage_verify.v3 and stage_verify.v2. Photos ${new Set(rows.map((row) => row.file)).size}. T stays ${DEFAULT_PASS_THRESHOLD}. No chain transaction. v3 asks twice and passes only when both runs pass. Confidence for v3 is yes answers divided by the checklist. v3 seconds in the table are the two runs added. The average below is per call.`,
    "",
    "| File | Prompt | Claimed | Expected | Predicted | False pass | Seconds |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...lines,
    "",
    summarise("stage_verify.v3", rows.filter((row) => row.prompt === "stage_verify.v3")),
    summarise("stage_verify.v2", rows.filter((row) => row.prompt === "stage_verify.v2")),
  ].join("\n");
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      await fn(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env"));
  if (!process.env.LLM_API_KEY && !process.env.AI_DOC_API_KEY) {
    throw new Error("LLM_API_KEY is not set.");
  }
  const labels = (JSON.parse(readFileSync(path.join(ROOT, "labels.json"), "utf8")) as Label[]).slice(0, 6);
  if (labels.length === 0) throw new Error("No labels in tests/fixtures/stage-photos/real/labels.json");
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(process.cwd(), "docs/eval");
  mkdirSync(dir, { recursive: true });
  const markdown = path.join(dir, `checklist-${date}.md`);
  const journal = path.join(dir, `checklist-${date}.jsonl`);
  writeFileSync(journal, "");
  const rows: Row[] = [];
  let writing = Promise.resolve();
  function publish(row: Row) {
    rows.push(row);
    const line = JSON.stringify(row);
    const snapshot = rows.slice();
    writing = writing.then(() => {
      appendFileSync(journal, `${line}\n`);
      writeFileSync(markdown, report(snapshot));
    });
    return writing;
  }

  await mapPool(labels, 2, async (label) => {
    const bytes = Uint8Array.from(readFileSync(path.join(ROOT, label.file)));
    const v2Started = Date.now();
    const v2 = await askVerdict({
      primary: MODEL,
      fallback: MODEL,
      system: STAGE_VERIFY_SYSTEM_V2,
      user: v2User(label),
      images: [bytes],
    });
    const v2Row = rowOf({
      file: label.file,
      prompt: "stage_verify.v2",
      run: 1,
      claimed_stage: label.claimed_stage,
      expected: label.should_verdict,
      parsed: Boolean(v2.verdict),
      predicted: v2.verdict ? v2Label(v2.verdict.verdict, v2.verdict.confidence) : "unparsed",
      confidence: v2.verdict?.confidence ?? null,
      ms: Date.now() - v2Started,
      error: v2.error,
    });
    await publish(v2Row);
    process.stdout.write(`v2 ${label.file} ${v2Row.predicted} ${v2Row.seconds}s\n`);

    const checklist = checklistFor(label.claimed_stage);
    const user = checklistUserMessage(label.claimed_stage);
    const runs: { score: ReturnType<typeof scoreChecklist> | null; ms: number }[] = [];
    for (const run of [1, 2] as const) {
      const started = Date.now();
      const asked = await askChecklist({
        model: MODEL,
        system: STAGE_VERIFY_SYSTEM_V3,
        user,
        images: [bytes],
      });
      const score = asked.reply ? scoreChecklist(alignAnswers(checklist.items, asked.reply.items)) : null;
      const elapsed = Date.now() - started;
      const call = rowOf({
        file: label.file,
        prompt: "stage_verify.v3",
        run,
        claimed_stage: label.claimed_stage,
        expected: label.should_verdict,
        parsed: Boolean(score),
        predicted: score?.verdict ?? "unparsed",
        confidence: score?.confidence ?? null,
        ms: elapsed,
        error: asked.error,
      });
      runs.push({ score, ms: elapsed });
      await publish(call);
      process.stdout.write(`v3 run ${run} ${label.file} ${call.predicted} ${call.seconds}s\n`);
    }
    const [first, second] = runs;
    const pair = first?.score && second?.score ? combineChecklistRuns(first.score, second.score) : null;
    const pairRow = rowOf({
      file: label.file,
      prompt: "stage_verify.v3",
      run: "pair",
      claimed_stage: label.claimed_stage,
      expected: label.should_verdict,
      parsed: Boolean(pair),
      predicted: pair?.verdict ?? "unparsed",
      confidence: pair?.confidence ?? null,
      ms: (first?.ms ?? 0) + (second?.ms ?? 0),
      error: pair ? "" : "one run did not parse",
    });
    await publish(pairRow);
  });

  await writing;
  process.stdout.write(`${markdown}\n`);
  process.stdout.write(`${report(rows)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "eval failed"}\n`);
  process.exit(1);
});
