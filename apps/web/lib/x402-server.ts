import type { HTTPResponseInstructions, x402HTTPResourceServer } from "@x402/core/server";
import { getDatabase, projects, workspaces, x402Calls } from "@certa/db";
import { eq } from "drizzle-orm";
import {
  allowanceLeft,
  isDemoPayment,
  openMeteoUrl,
  paymentAccount,
  rainFromOpenMeteo,
  settlementReceipt,
  WEATHER_PRICE_USDC,
} from "./x402";

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";

let serverPromise: Promise<x402HTTPResourceServer> | null = null;
let serverPayTo = "";

async function weatherServer(payTo: string): Promise<x402HTTPResourceServer> {
  if (serverPromise && serverPayTo === payTo) return serverPromise;
  serverPayTo = payTo;
  serverPromise = buildServer(payTo).catch((error: unknown) => {
    serverPromise = null;
    throw error;
  });
  return serverPromise;
}

async function buildServer(payTo: string): Promise<x402HTTPResourceServer> {
  const core = await import(/* webpackIgnore: true */ "@x402/core/server");
  const evm = await import(/* webpackIgnore: true */ "@x402/evm/exact/server");
  const facilitator = new core.HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const resource = new core.x402ResourceServer(facilitator);
  evm.registerExactEvmScheme(resource, { networks: ["eip155:11155111"] });
  const httpServer = new core.x402HTTPResourceServer(resource, {
    "GET /api/paid/weather": {
      accepts: {
        scheme: "exact",
        price: "$0.01",
        network: "eip155:11155111",
        payTo,
      },
      description: "Weather for the open site",
      mimeType: "application/json",
    },
  });
  await httpServer.initialize();
  return httpServer;
}

function fromInstructions(instructions: HTTPResponseInstructions): Response {
  const headers = new Headers(instructions.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  const body = typeof instructions.body === "string" ? instructions.body : JSON.stringify(instructions.body ?? { error: "Payment required" });
  return new Response(body, { status: instructions.status, headers });
}

export async function handlePaidWeather(request: Request): Promise<Response> {
  const payTo = paymentAccount();
  if (!payTo) return Response.json({ error: "The payment account is not configured." }, { status: 503 });
  if (isDemoPayment(request)) return Response.json({ settled: false, summary: "The demo header is not a payment." });

  const url = new URL(request.url);
  const paymentHeader = request.headers.get("payment-signature") ?? request.headers.get("PAYMENT-SIGNATURE") ?? undefined;
  let server: x402HTTPResourceServer;
  try {
    server = await weatherServer(payTo);
  } catch {
    return Response.json({ error: "The facilitator did not answer." }, { status: 502 });
  }
  const result = await server.processHTTPRequest({
    adapter: {
      getHeader: (name) => request.headers.get(name) ?? undefined,
      getMethod: () => "GET",
      getPath: () => url.pathname,
      getUrl: () => request.url,
      getAcceptHeader: () => request.headers.get("accept") ?? "",
      getUserAgent: () => request.headers.get("user-agent") ?? "",
    },
    path: url.pathname,
    method: "GET",
    paymentHeader,
  });
  if (result.type === "payment-error") return fromInstructions(result.response);
  if (result.type !== "payment-verified") return Response.json({ error: "Payment required" }, { status: 402 });

  const db = await getDatabase();
  const project = (await db.select().from(projects)).find((row) => row.termsHash !== "seeded-terms");
  const workspace = project ? (await db.select().from(workspaces).where(eq(workspaces.id, project.workspaceId)))[0] : undefined;
  const spent = project
    ? (await db.select().from(x402Calls).where(eq(x402Calls.projectId, project.id))).reduce((sum, row) => sum + row.costUsdc, 0n)
    : 0n;
  if (!project || !workspace || allowanceLeft(workspace.x402AllowanceUsdc, spent) < WEATHER_PRICE_USDC) {
    return Response.json({ error: project ? "The agent allowance is used up." : "No project is open." }, { status: 402 });
  }

  const upstream = await fetch(openMeteoUrl(project.siteLat, project.siteLng), { signal: AbortSignal.timeout(8_000) }).catch(() => null);
  const raw = upstream?.ok ? await upstream.text() : "";
  let weather: ReturnType<typeof rainFromOpenMeteo> = null;
  if (raw) {
    try {
      weather = rainFromOpenMeteo(JSON.parse(raw) as unknown);
    } catch {
      weather = null;
    }
  }
  if (!weather) return Response.json({ error: "The weather service did not answer." }, { status: 502 });

  const settled = await server.processSettlement(result.paymentPayload, result.paymentRequirements, result.declaredExtensions);
  const receipt = settlementReceipt(settled, payTo, weather.summary, raw);
  if (!settled.success || !receipt) {
    return fromInstructions("response" in settled ? settled.response : { status: 402, headers: settled.headers, body: { error: "Payment was not settled." } });
  }
  await db.insert(x402Calls).values({
    projectId: project.id,
    workspaceId: project.workspaceId,
    endpoint: "/api/paid/weather",
    costUsdc: receipt.costUsdc,
    txHash: receipt.txHash,
    receipt: receipt.receipt,
    responseSummary: receipt.responseSummary,
  });
  const headers = new Headers(settled.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify({
    site: project.siteLocation,
    summary: weather.summary,
    paid: "0.01 USDC",
    txHash: receipt.txHash,
  }), { status: 200, headers });
}
