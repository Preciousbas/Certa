import { NextRequest } from "next/server";
import { handlePaidWeather } from "../../../../lib/x402-server";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handlePaidWeather(request);
}
