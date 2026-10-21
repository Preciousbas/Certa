import { apiError, planInput } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ json }) => {
    const input = planInput.safeParse(json);
    if (!input.success) return apiError(400, "This project is missing.");
    return apiError(409, "The desk has nothing to change.");
  },
  { platformAdmin: true },
);
