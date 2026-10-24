import { describe, expect, it } from "vitest";
import { chooseDocuments } from "./choose.js";

const sheet = { rows: [{ sheet: "BOQ", row: 1, cells: [], anchor: "A1", content: "Slab" }] };

function row(id: string, sha256: string, createdAt: string, status = "parsed", parsedJson: unknown = sheet) {
  return { id, sha256, status, parseStatus: status, createdAt: new Date(createdAt), parsedJson };
}

describe("chooseDocuments", () => {
  it("keeps the newest successful copy of one sha256 and drops the rest", () => {
    const chosen = chooseDocuments([
      row("old", "same", "2026-10-23T19:41:00Z"),
      row("mid", "same", "2026-10-23T22:04:00Z", "failed", null),
      row("new", "same", "2026-10-24T05:23:00Z"),
    ]);
    expect(chosen.map((item) => item.id)).toEqual(["new"]);
  });

  it("still combines two different files", () => {
    const other = { rows: [{ sheet: "BOQ", row: 2, cells: [], anchor: "A2", content: "Roof" }] };
    const chosen = chooseDocuments([
      row("a", "sha-a", "2026-10-23T19:41:00Z"),
      row("b", "sha-b", "2026-10-23T20:00:00Z", "parsed", other),
    ]);
    expect(chosen.map((item) => item.id).sort()).toEqual(["a", "b"]);
  });

  it("counts one sheet when the same parsed rows were stored under two hashes", () => {
    const chosen = chooseDocuments([
      row("first", "sha-a", "2026-10-23T19:41:00Z"),
      row("second", "sha-b", "2026-10-23T19:46:00Z"),
    ]);
    expect(chosen.map((item) => item.id)).toEqual(["second"]);
  });
});
