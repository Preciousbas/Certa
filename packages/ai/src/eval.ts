import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { heuristicAssess } from "./assess.js";

type Case = { id: string; family: string; notes: string; stageIndex: number };

const cases = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../evals/cases.json"), "utf8")) as Case[];
const families = [...new Set(cases.map((item) => item.family))];
let correct = 0;
for (const item of cases) {
  const result = heuristicAssess(item.notes);
  const hit = result.assessment.stageIndex === item.stageIndex ? 1 : 0;
  correct += hit;
  if (!hit) console.log(`miss ${item.id}: got ${result.assessment.stageIndex}, want ${item.stageIndex}`);
}
const accuracy = correct / cases.length;
console.log(`cases ${cases.length}`);
console.log(`families ${families.join(", ")} (min 10 each: ${families.every((family) => cases.filter((item) => item.family === family).length >= 10)})`);
console.log(`accuracy ${(accuracy * 100).toFixed(1)}%`);
if (accuracy < 0.7) process.exitCode = 1;
