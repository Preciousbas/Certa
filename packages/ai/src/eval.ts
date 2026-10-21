import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { heuristicAssess, strictHeuristic } from "./assess.js";
import { decide } from "./schema.js";

type Case = { id: string; family: string; notes: string; stageIndex: number };

const cases = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../evals/cases.json"), "utf8")) as Case[];
const completeIds = new Set(["slab-06"]);
const families = [...new Set(cases.map((item) => item.family))];
const prompts = [
  { name: "loose-notes", run: heuristicAssess },
  { name: "strict-notes", run: strictHeuristic },
];

console.log(`cases ${cases.length}`);
console.log(`families ${families.join(", ")} (min 10 each: ${families.every((family) => cases.filter((item) => item.family === family).length >= 10)})`);
console.log("complete labels: slab-06 only. Every other note is unfinished work.");
console.log("prompt\tstage accuracy\tfalse releases\tmissed finishes\trecommend release");

for (const prompt of prompts) {
  let identified = 0;
  let falseReleases = 0;
  let missedFinishes = 0;
  let recommended = 0;
  for (const item of cases) {
    const result = prompt.run(item.notes);
    const identifiedHit = result.assessment.stageIndex === item.stageIndex;
    if (identifiedHit) identified += 1;
    else console.log(`miss ${prompt.name} ${item.id}: got ${result.assessment.stageIndex}, want ${item.stageIndex}`);
    const at85 = decide(result.assessment);
    const shouldRelease = completeIds.has(item.id);
    if (at85 === "recommend_release") recommended += 1;
    if (at85 === "recommend_release" && !shouldRelease) falseReleases += 1;
    if (at85 !== "recommend_release" && shouldRelease) missedFinishes += 1;
  }
  const accuracy = identified / cases.length;
  console.log(`${prompt.name}\t${(accuracy * 100).toFixed(1)}%\t${falseReleases}\t${missedFinishes}\t${recommended}`);
  if (prompt.name === "loose-notes" && accuracy < 0.7) process.exitCode = 1;
}
