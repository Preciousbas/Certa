import { afterEach, describe, expect, it, vi } from "vitest";
import { agentRouterContract, agentRouterVision } from "./router.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_VISION_MODEL;
  delete process.env.LLM_TEXT_MODEL;
});

describe("agent router", () => {
  it("stays off when no key is set", () => {
    expect(agentRouterVision()).toBeNull();
  });

  it("reads a stage verdict from the chat response", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_BASE_URL = "https://agentrouter.org/v1";
    process.env.LLM_VISION_MODEL = "deepseek-v4-flash";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const headers = new Headers(init.headers);
        expect(headers.get("user-agent")).toBe("opencode/1.0");
        expect(headers.get("authorization")).toBe("Bearer test-key");
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"stageId":"stage-1","complete":true,"confidence":0.9,"evidence":[{"item":"slab","seen":true}],"concerns":[],"safetyFlags":[]}' } }],
          }),
          { status: 200 },
        );
      }),
    );
    const model = agentRouterVision();
    const verdict = await model?.readPhoto({ stageId: "stage-1", notes: "First floor slab poured.", imageSha256: "abc" });
    expect(verdict).toMatchObject({ stageId: "stage-1", complete: true, confidence: 0.9 });
  });

  it("reads a contract summary from the chat response", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_TEXT_MODEL = "deepseek-v4-flash";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '{"parties":[],"contractSumKobo":"100","currency":"NGN","stages":[{"name":"Clearing","description":"Clear","amountKobo":"100","percentBps":10000}],"retentionBps":0,"defectsPeriodDays":0,"mobilisationBps":0,"deadlines":[],"paymentTerms":"","liquidatedDamages":"","ambiguities":["Who is the client?"]}',
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const model = agentRouterContract();
    const summary = await model?.extractContract("one stage only");
    expect(summary).toMatchObject({ ambiguities: ["Who is the client?"], stages: [{ name: "Clearing" }] });
  });
});
