import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatNgnFromKobo } from "@certa/shared";
import { studyDocuments } from "../../apps/bot/src/study.js";
import { parseBytes } from "../../src/server/intake/parse.js";
import { buildPreview, planFromRows } from "../../src/server/intake/read.js";
import { blockARows, blockBRows, blockCRows, rowsToCsv, singleSheetRows } from "./fixtures/lekki-blocks.js";
import type { GridRow } from "../../src/server/intake/interpret.js";

const RATE = 150_000n;

async function agree(name: string, rows: GridRow[] | null, bytes: Uint8Array) {
  const document = rows ? null : await parseBytes(name, bytes);
  if (document && !document.ok) throw new Error(name);
  const source = rows ?? (document && document.ok ? document.document.rows : []);
  const main = planFromRows(source, RATE).plan;
  const preview = await buildPreview(name, bytes);
  const studied = await studyDocuments(name, bytes);
  expect("error" in preview).toBe(false);
  if ("error" in preview) return;
  const work = main.stages.filter((stage) => stage.kind !== "reserve");
  expect(preview.stages.map((stage) => stage.name)).toEqual(work.map((stage) => stage.name));
  expect(preview.stages.map((stage) => stage.amount)).toEqual(work.map((stage) => formatNgnFromKobo(stage.amountKobo)));
  expect(preview.contractSum).toBe(formatNgnFromKobo(main.contractSumKobo ?? 0n));
  expect(preview.stages.map((stage) => stage.expectedFinish)).toEqual(work.map((stage) => stage.expectedFinish));
  expect(studied.summary.stages.map((stage) => stage.name)).toEqual(work.map((stage) => stage.name));
  expect(studied.summary.stages.map((stage) => stage.amountKobo)).toEqual(work.map((stage) => stage.amountKobo.toString()));
  expect(studied.summary.contractSumKobo).toBe((main.contractSumKobo ?? 0n).toString());
}

describe("one reader for the main intake, the preview, and the bot", () => {
  it("agrees on blocks A, B and C and the single sheet", async () => {
    await agree("block-a.csv", blockARows, new TextEncoder().encode(rowsToCsv(blockARows)));
    await agree("block-b.csv", blockBRows, new TextEncoder().encode(rowsToCsv(blockBRows)));
    await agree("block-c.csv", blockCRows, new TextEncoder().encode(rowsToCsv(blockCRows)));
    await agree("lekki.csv", singleSheetRows, new TextEncoder().encode(rowsToCsv(singleSheetRows)));
  });

  it("agrees on the five-stage contract", async () => {
    const bytes = new TextEncoder().encode(readFileSync(new URL("../fixtures/contracts/five_stage_contract.txt", import.meta.url)));
    await agree("five_stage_contract.txt", null, bytes);
  });
});
