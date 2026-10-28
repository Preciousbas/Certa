import { describe, expect, it } from "vitest";
import { fillPartyNames } from "./flow.js";
import { interpretGrid, rowFromValues } from "./interpret.js";
import { validateDraft } from "./validate.js";

const RATE = 133111n;

function pricedSheet(extra: string[][] = []) {
  return interpretGrid([
    ...extra.map((values, index) => rowFromValues("t", index + 1, values)),
    rowFromValues("t", extra.length + 1, ["Bill", "1", "Preliminaries"]),
    rowFromValues("t", extra.length + 2, ["Item", "Description", "Unit", "Qty", "Rate", "Amount"]),
    rowFromValues("t", extra.length + 3, ["1.1", "Preliminaries", "sum", "1", "1000000.00", "1000000.00"]),
    rowFromValues("t", extra.length + 4, ["", "Carried to Summary", "", "", "", "1000000.00"]),
    rowFromValues("t", extra.length + 5, ["General Summary"]),
    rowFromValues("t", extra.length + 6, ["", "CONTRACT SUM", "1000000.00"]),
  ]);
}

describe("fillPartyNames", () => {
  it("fills a sum and stages that named nobody, so the parties are no longer missing", () => {
    const draft = pricedSheet();
    expect(draft.clientName).toBeNull();
    expect(draft.contractorName).toBeNull();
    fillPartyNames(draft, { client: "Ada", contractor: null, consultant: null });
    const plan = validateDraft(draft, RATE);
    expect(plan.issues.some((issue) => issue.rule === "missing_required")).toBe(false);
    expect(draft.clientName).toBe("Ada");
    expect(draft.contractorName).toBe("The contractor");
    expect(draft.consultantName).toBeNull();
  });

  it("still marks the plan missing when there are no stages", () => {
    const draft = interpretGrid([rowFromValues("t", 1, ["", "CONTRACT SUM", "1000000.00"])]);
    fillPartyNames(draft, { client: "Ada", contractor: "Emmy", consultant: null });
    const plan = validateDraft(draft, RATE);
    expect(plan.issues.some((issue) => issue.rule === "missing_required")).toBe(true);
  });

  it("keeps a name written in the BoQ", () => {
    const draft = pricedSheet([
      ["Client", "Ada from the file"],
      ["Consultant", "Kemi from the file"],
    ]);
    fillPartyNames(draft, { client: "Ada from the project", contractor: "Emmy", consultant: "Kemi from the project" });
    expect(draft.clientName).toBe("Ada from the file");
    expect(draft.consultantName).toBe("Kemi from the file");
    expect(draft.contractorName).toBe("Emmy");
  });
});
