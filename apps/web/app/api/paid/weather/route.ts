import { handlePaidWeather } from "../../../../lib/x402-server";
import { apiError, emptyQuery, queryOf } from "../../../../lib/schemas";

function requirePaidAccess(request: Request) {
  const query = emptyQuery.safeParse(queryOf(request));
  if (!query.success) return apiError(400, "That request is not valid.");
  return handlePaidWeather(request);
}

export function GET(request: Request) {
  return requirePaidAccess(request);
}
