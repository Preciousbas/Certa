import { afterEach, describe, expect, it, vi } from "vitest";
import { citationIssues } from "../../src/server/intake/citations.js";
import { interpretGrid, rowFromValues } from "../../src/server/intake/interpret.js";
import { SCAN_V13 } from "../../src/server/intake/messages.js";
import { proposeWithModel, resetDocModelWarning } from "../../src/server/intake/model.js";
import { createSignedUploadUrl } from "../../src/server/storage.js";
import { UPLOAD_MAX_BYTES } from "../../src/server/intake/detect.js";
import { validateDraft } from "../../src/server/intake/validate.js";

const saved = {
  model: process.env.AI_DOC_MODEL,
  key: process.env.AI_DOC_API_KEY,
  llm: process.env.LLM_API_KEY,
  base: process.env.AI_DOC_BASE_URL,
  live: process.env.AI_DOC_ALLOW_NETWORK,
  supabase: process.env.SUPABASE_URL,
  role: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function restore(name: "AI_DOC_MODEL" | "AI_DOC_API_KEY" | "LLM_API_KEY" | "AI_DOC_BASE_URL" | "AI_DOC_ALLOW_NETWORK" | "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("AI_DOC_MODEL", saved.model);
  restore("AI_DOC_API_KEY", saved.key);
  restore("LLM_API_KEY", saved.llm);
  restore("AI_DOC_BASE_URL", saved.base);
  restore("AI_DOC_ALLOW_NETWORK", saved.live);
  restore("SUPABASE_URL", saved.supabase);
  restore("SUPABASE_SERVICE_ROLE_KEY", saved.role);
  vi.restoreAllMocks();
});

describe("model fallback", () => {
  it("warns once and stays on the parser when the model or key is missing", async () => {
    delete process.env.AI_DOC_MODEL;
    delete process.env.AI_DOC_API_KEY;
    delete process.env.LLM_API_KEY;
    resetDocModelWarning();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const first = await proposeWithModel({ text: "Contract sum 1.00" });
    const second = await proposeWithModel({ text: "Contract sum 1.00" });
    expect(first.source).toBe("parser");
    expect(second.source).toBe("parser");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls AI_DOC_MODEL and falls back without throwing when the provider errors", async () => {
    process.env.AI_DOC_MODEL = "doc-model-under-test";
    process.env.AI_DOC_API_KEY = "doc-key-under-test";
    process.env.AI_DOC_BASE_URL = "https://example.test/v1";
    process.env.AI_DOC_ALLOW_NETWORK = "1";
    resetDocModelWarning();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("no", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "{\"stages\":[]}" } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const failed = await proposeWithModel({ text: "Read this." });
    expect(failed.source).toBe("parser");
    expect(failed.notice).toContain("Nothing has been lost.");
    const ok = await proposeWithModel({ text: "Read this.", images: [{ mime: "image/jpeg", base64: "aGVsbG8=", filename: "page.jpg" }] });
    expect(ok.source).toBe("model");
  });
});

describe("citations and derived sums", () => {
  it("flags a value that has no quote in the saved chunks", () => {
    const draft = interpretGrid([
      rowFromValues("sheet", 1, ["Client", "Ada"]),
      rowFromValues("sheet", 2, ["Contractor", "Emmy"]),
      rowFromValues("sheet", 3, ["Bill", "1", "Doors"]),
      rowFromValues("sheet", 4, ["Item", "Description", "Unit", "Qty", "Rate", "Amount"]),
      rowFromValues("sheet", 5, ["1.1", "Door", "nr", "1", "1000.00", "1000.00"]),
    ]);
    const gaps = citationIssues(draft, [{ anchor: "sheet!A4:F4", content: "redacted" }]);
    expect(gaps.some((gap) => gap.code === "V14")).toBe(true);
    expect(gaps.every((gap) => gap.quote === null || gap.message.includes("no source quote or page"))).toBe(true);
  });

  it("derives the contract sum from milestone amounts", () => {
    const plan = validateDraft(interpretGrid([
      rowFromValues("m", 1, ["Client", "Ada"]),
      rowFromValues("m", 2, ["Contractor", "Emmy"]),
      rowFromValues("m", 3, ["Milestone", "1", "Slab", "1000000.00"]),
      rowFromValues("m", 4, ["Milestone", "2", "Roof", "500000.00"]),
    ]), 133111n);
    expect(plan.derived).toBe(true);
    expect(plan.contractSumKobo).toBe(150000000n);
    expect(plan.issues.some((issue) => issue.code === "derived")).toBe(true);
  });

  it("uses the scan sentence for a photo with no model", () => {
    expect(SCAN_V13).toBe("This looks like a scan or photo, please upload a text PDF, CSV or Excel");
  });
});

describe("signed upload", () => {
  it("returns a storage upload URL and keeps the service key off the browser URL", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "signed-upload-test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: "/object/upload/sign/documents/ws/file.csv?token=upload-token", token: "upload-token" }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const signed = await createSignedUploadUrl("documents", "ws/file.csv");
    expect(signed.path).toBe("ws/file.csv");
    expect(signed.uploadUrl).toContain("https://example.supabase.co/storage/v1/object/upload/sign/");
    expect(signed.uploadUrl.includes("signed-upload-test-key")).toBe(false);
    expect(UPLOAD_MAX_BYTES).toBe(20 * 1024 * 1024);
  });
});
