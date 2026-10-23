import { failureResponse, FORBIDDEN } from "./errors";

/** Admin pages and APIs answer 403 for a missing session and for anyone who is not a platform admin. */
export function adminDenied(error: unknown): Response {
  const response = failureResponse(error);
  if (response.status === 401 || response.status === 403 || response.status === 404) return failureResponse(FORBIDDEN);
  return response;
}
