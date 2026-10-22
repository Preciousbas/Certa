import { createCdpFacilitatorClient } from "@coinbase/cdp-sdk/x402";
import { HTTPFacilitatorClient, x402ResourceServer, type RoutesConfig } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { declareDiscoveryExtension } from "@x402/extensions";
import { withX402 } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import { forecastFromOpenMeteo, openMeteoUrl, weatherQuery } from "../../../src/server/x402/forecast";
import { configuredPayTo, paidAccountDenial } from "../../../src/server/x402/gate";

const NETWORK = "eip155:84532" as const;
const CDP_FACILITATOR = "https://api.cdp.coinbase.com/platform/v2/x402";
const PUBLIC_FACILITATOR = "https://x402.org/facilitator";

export function payToAddress(): `0x${string}` | null {
  return configuredPayTo();
}

export function facilitatorUrl(): string {
  const configured = process.env.X402_FACILITATOR_URL?.trim();
  if (configured) return configured;
  if (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET) return CDP_FACILITATOR;
  return PUBLIC_FACILITATOR;
}

let resource: x402ResourceServer | null = null;
let resourceUrl = "";
let resolvedFacilitator: string | null = null;

async function facilitatorResponds(url: string): Promise<boolean> {
  try {
    const response = await fetch(new URL("supported", `${url.replace(/\/$/, "")}/`), { signal: AbortSignal.timeout(8_000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** CDP is the preferred facilitator. x402.org is the testnet fallback when CDP does not answer. */
export async function activeFacilitatorUrl(): Promise<string> {
  if (resolvedFacilitator) return resolvedFacilitator;
  const preferred = facilitatorUrl();
  if (await facilitatorResponds(preferred)) {
    resolvedFacilitator = preferred;
    return preferred;
  }
  if (preferred !== PUBLIC_FACILITATOR && (await facilitatorResponds(PUBLIC_FACILITATOR))) {
    resolvedFacilitator = PUBLIC_FACILITATOR;
    return resolvedFacilitator;
  }
  return preferred;
}

export async function weatherResourceServer(): Promise<x402ResourceServer> {
  const url = await activeFacilitatorUrl();
  if (resource && resourceUrl === url) return resource;
  const facilitator =
    url.includes("api.cdp.coinbase.com") && process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET
      ? createCdpFacilitatorClient({ baseUrl: url })
      : new HTTPFacilitatorClient({ url });
  const server = new x402ResourceServer(facilitator);
  registerExactEvmScheme(server, { networks: [NETWORK] });
  resource = server;
  resourceUrl = url;
  return server;
}

const weatherOutput = {
  type: "object",
  required: ["location", "generated_at", "hours", "summary"],
  properties: {
    location: { type: "object", required: ["lat", "lng"] },
    generated_at: { type: "string" },
    hours: {
      type: "array",
      items: {
        type: "object",
        required: ["time", "precip_prob_pct", "precip_mm", "temp_c", "wind_kmh"],
      },
    },
    summary: {
      type: "object",
      required: ["max_precip_prob_pct_next_24h", "rain_expected"],
    },
  },
};

function weatherRoutes(payTo: string): RoutesConfig {
  return {
    "/api/paid/weather": {
      accepts: { scheme: "exact", price: "$0.01", network: NETWORK, payTo },
      description:
        "Site weather forecast before a concrete pour. Hourly rain chance, rainfall, temperature, and wind.",
      mimeType: "application/json",
      extensions: declareDiscoveryExtension({
        input: { lat: "6.4474", lng: "3.4723", hours: "48" },
        inputSchema: {
          properties: {
            lat: { type: "string", description: "Latitude" },
            lng: { type: "string", description: "Longitude" },
            hours: { type: "string", description: "1 to 168" },
          },
          required: ["lat", "lng"],
        },
        output: { schema: weatherOutput },
      }),
    },
  };
}

export async function handlePaidWeather(request: NextRequest): Promise<NextResponse> {
  const query = weatherQuery(new URL(request.url));
  if (!query) {
    return NextResponse.json({ error: "Latitude, longitude, and hours are required." }, { status: 400 });
  }
  const denial = paidAccountDenial();
  if (denial) return NextResponse.json({ error: denial.error }, { status: denial.status });
  const payTo = payToAddress();
  if (!payTo) return NextResponse.json({ error: "The payment account is not configured." }, { status: 503 });
  const respond = async (): Promise<NextResponse> => {
    const upstream = await fetch(openMeteoUrl(query.lat, query.lng, query.hours), { signal: AbortSignal.timeout(8_000) }).catch(
      () => null,
    );
    const raw = upstream?.ok ? await upstream.json().catch(() => null) : null;
    const forecast = forecastFromOpenMeteo(raw, { lat: query.lat, lng: query.lng });
    if (!forecast) return NextResponse.json({ error: "The weather service did not answer." }, { status: 502 });
    return NextResponse.json(forecast);
  };
  return withX402(respond, weatherRoutes(payTo), await weatherResourceServer())(request);
}
