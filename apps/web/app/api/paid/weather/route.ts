import { handlePaidWeather } from "../../../../lib/x402-server";

export function GET(request: Request) {
  return handlePaidWeather(request);
}
