import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import path from "node:path";
import { STAGE_VERIFY_SYSTEM_V2 } from "../src/server/ai/prompts/stage_verify.v2.js";
import { STAGE_VERIFY_SYSTEM_V3 } from "../src/server/ai/prompts/stage_verify.v3.js";
import { checklistFor, checklistUserMessage, STAGE_CHECKLISTS } from "../src/server/verify/checklists.js";
import { alignAnswers, agreeChecklistRuns, scoreChecklist } from "../src/server/verify/checklistScore.js";
import { DEFAULT_PASS_THRESHOLD, FAIL_CONFIDENCE } from "../src/server/verify/decide.js";
import { evalFileStem, labelErrors, parseEvalArgs, plannedCalls } from "../src/server/verify/evalPlan.js";
import { askChecklist, askVerdict, visionModels } from "../src/server/verify/vision.js";

setDefaultAutoSelectFamilyAttemptTimeout(10_000);

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

function outcomeLine(rows: Row[]): string {
  const scored = rows.filter((row) => row.prompt === "stage_verify.v3" && row.run === "pair");
  const correct = scored.filter((row) => row.predicted === row.expected).length;
  const falsePasses = scored.filter((row) => row.false_pass).length;
  const missed = scored.filter((row) => row.expected === "pass" && row.predicted !== "pass").length;
  const timedOut = rows.filter((row) => row.error === "timed out").length;
  return `Correct ${correct} of ${scored.length}. False passes ${falsePasses}. Missed passes ${missed}. Timed out ${timedOut}.`;
}

function report(rows: Row[], model: string, longSide: number): string {
  const scored = rows.filter((row) => row.prompt === "stage_verify.v2" || row.run === "pair");
  const lines = scored.map((row) => {
    return `| ${row.file} | ${row.prompt} | ${row.claimed_stage} | ${row.expected} | ${row.parsed ? row.predicted : "unparsed"} | ${row.false_pass ? "yes" : "no"} | ${row.seconds} |`;
  });
  const prompts = rows.some((row) => row.prompt === "stage_verify.v2")
    ? "Prompts stage_verify.v3 and stage_verify.v2."
    : "Prompt stage_verify.v3.";
  const sections = [
    `# Checklist eval ${new Date().toISOString().slice(0, 10)}`,
    "",
    `Model ${model}. Long side ${longSide} px. ${prompts} Photos ${new Set(rows.map((row) => row.file)).size}. T stays ${DEFAULT_PASS_THRESHOLD}. No chain transaction. v3 asks twice and passes only when both runs pass. Confidence for v3 is yes answers divided by the checklist. v3 seconds in the table are the two runs added. The average below is per call.`,
    "",
    outcomeLine(rows),
    "",
    "| File | Prompt | Claimed | Expected | Predicted | False pass | Seconds |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...lines,
    "",
    summarise("stage_verify.v3", rows.filter((row) => row.prompt === "stage_verify.v3")),
  ];
  if (rows.some((row) => row.prompt === "stage_verify.v2")) {
    sections.push(summarise("stage_verify.v2", rows.filter((row) => row.prompt === "stage_verify.v2")));
  }
  return sections.join("\n");
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
  const args = parseEvalArgs(process.argv.slice(2));
  loadEnv(path.join(process.cwd(), ".env"));
  const model = args.model ?? visionModels().primary;
  const labelled = JSON.parse(readFileSync(path.join(ROOT, "labels.json"), "utf8")) as unknown;
  const problems = labelErrors(labelled);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const labels = (labelled as Label[]).slice(0, args.limit);
  if (labels.length === 0) throw new Error("No labels in tests/fixtures/stage-photos/real/labels.json");
  const missing = labels.filter((label) => !existsSync(path.join(ROOT, label.file)));
  const present = labels.filter((label) => existsSync(path.join(ROOT, label.file)));
  if (missing.length > 0) {
    process.stderr.write(
      `Skipping ${missing.length} missing photo(s): ${missing.map((label) => label.file).join(", ")}.\nThe labels stay in tests/fixtures/stage-photos/real/labels.json. The image files stay on disk and are not committed.\n`,
    );
  }
  if (!args.run) {
    process.stdout.write(`Model ${model}\n`);
    process.stdout.write(`Long side ${args.longSide}\n`);
    process.stdout.write(`Files: ${present.map((label) => label.file).join(" ")}\n`);
    process.stdout.write(`Calls: ${plannedCalls(present.length, args.withV2)}\n`);
    return;
  }
  if (!process.env.LLM_API_KEY && !process.env.AI_DOC_API_KEY) {
    throw new Error("LLM_API_KEY is not set.");
  }
  if (present.length === 0) {
    process.stderr.write("No local photos to score.\n");
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(process.cwd(), "docs/eval");
  mkdirSync(dir, { recursive: true });
  const stem = evalFileStem(date, model, args.longSide);
  const markdown = path.join(dir, `${stem}.md`);
  const journal = path.join(dir, `${stem}.jsonl`);
  writeFileSync(journal, "");
  const rows: Row[] = [];
  let writing = Promise.resolve();
  function publish(row: Row) {
    rows.push(row);
    const line = JSON.stringify(row);
    const snapshot = rows.slice();
    writing = writing.then(() => {
      appendFileSync(journal, `${line}\n`);
      writeFileSync(markdown, report(snapshot, model, args.longSide));
    });
    return writing;
  }

  process.stdout.write(`Model ${model}\n`);
  process.stdout.write(`Long side ${args.longSide}\n`);
  await mapPool(present, 2, async (label) => {
    const bytes = Uint8Array.from(readFileSync(path.join(ROOT, label.file)));
    if (args.withV2) {
      const v2Started = Date.now();
      const v2 = await askVerdict({
        primary: model,
        fallback: model,
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
    }

    const checklist = checklistFor(label.claimed_stage);
    const user = checklistUserMessage(label.claimed_stage);
    const runs: { score: ReturnType<typeof scoreChecklist> | null; ms: number }[] = [];
    for (const run of [1, 2] as const) {
      const started = Date.now();
      const asked = await askChecklist({
        model,
        system: STAGE_VERIFY_SYSTEM_V3,
        user,
        images: [bytes],
        longSide: args.longSide,
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
    const agreed = agreeChecklistRuns(first?.score ?? null, second?.score ?? null);
    const pairRow = rowOf({
      file: label.file,
      prompt: "stage_verify.v3",
      run: "pair",
      claimed_stage: label.claimed_stage,
      expected: label.should_verdict,
      parsed: true,
      predicted: agreed.verdict,
      confidence: agreed.confidence,
      ms: (first?.ms ?? 0) + (second?.ms ?? 0),
      error: first?.score && second?.score ? "" : "one run did not parse",
    });
    await publish(pairRow);
  });

  await writing;
  process.stdout.write(`${markdown}\n`);
  process.stdout.write(`${report(rows, model, args.longSide)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "eval failed"}\n`);
  process.exit(1);
});
