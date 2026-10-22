import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { interpretGrid } from "../src/server/intake/interpret.js";
import { parseBytes } from "../src/server/intake/parse.js";
import { validateDraft } from "../src/server/intake/validate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/boq");
const models = (process.argv.find((arg) => arg.startsWith("--models=")) ? process.argv.find((arg) => arg.startsWith("--models="))?.slice("--models=".length) : process.argv[process.argv.indexOf("--models") + 1]) ?? "";
const names = models.split(",").map((name) => name.trim()).filter((name) => name.length > 0);
const today = new Date().toISOString().slice(0, 10);
const lines: string[] = [`# Extraction eval ${today}`, "", `Models requested: ${names.join(", ") || "(none)"}`, ""];

const key = process.env.LLM_API_KEY || process.env.AI_DOC_API_KEY || "";
lines.push(`Document model key present: ${key.length > 0 ? `yes (${key.length} characters)` : "no"}`);
lines.push("This run uses the deterministic spreadsheet reader. A model call is not made when the key is absent, and the same file is not sent twice.");
lines.push("");

async function main() {
  let files = 0;
  let reconciled = 0;
  for (const name of readdirSync(root)) {
  if (!name.endsWith(".csv") && !name.endsWith(".xlsx") && !name.endsWith(".pdf")) continue;
  const expectedPath = join(root, name.replace(/\.(csv|xlsx|pdf)$/, ".expected.json"));
  let expected: { contract_sum_kobo?: string } | null = null;
  try {
    expected = JSON.parse(readFileSync(expectedPath, "utf8")) as { contract_sum_kobo?: string };
  } catch {
    expected = null;
  }
  const started = Date.now();
  const parsed = await parseBytes(name, new Uint8Array(readFileSync(join(root, name))));
  const ms = Date.now() - started;
  files += 1;
  if (!parsed.ok) {
    lines.push(`- ${name}: parse ${parsed.failure} in ${ms} ms`);
    continue;
  }
  const plan = validateDraft(interpretGrid(parsed.document.rows), 133111n);
  const sum = plan.contractSumKobo?.toString() ?? "none";
  const match = expected?.contract_sum_kobo ? sum === expected.contract_sum_kobo : null;
  if (match) reconciled += 1;
  const blocking = plan.issues.filter((issue) => issue.severity === "blocking").length;
  lines.push(`- ${name}: contract_sum_kobo ${sum}, blocking ${blocking}, chunks ${parsed.document.chunks.length}, ${ms} ms${match === null ? "" : match ? ", expected sum matched" : ", expected sum differed"}`);
}

lines.push("");
lines.push(`Files read: ${files}. Expected-sum matches: ${reconciled}.`);
lines.push("Field accuracy, BoQ recall and citation rate for a live model are not in this file because no model call was made.");
lines.push("Injection fixture: duplex_lekki_messy.csv is covered by tests/intake/duplex.test.ts, which asserts the contract sum stays 5525500000.");
lines.push("Cost: 0. Latency above is local parse time only.");

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../docs/eval");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `extraction-${today}.md`);
  writeFileSync(out, `${lines.join("\n")}\n`);
  process.stdout.write(`${out}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? `${error.message}\n` : "eval failed\n");
  process.exit(1);
});
