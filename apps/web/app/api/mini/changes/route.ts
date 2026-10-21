import { apiError, changeInput } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ json }) => {
    const input = changeInput.safeParse(json);
    if (!input.success) return apiError(400, input.error.issues[0]?.message ?? "A no needs a reason.");
    return apiError(409, "That change is not waiting on you.");
  },
  { roles: ["contractor", "subcontractor"] },
);
