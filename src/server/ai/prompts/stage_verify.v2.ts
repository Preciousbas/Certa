import { STAGE_VERIFY_SYSTEM } from "./stage_verify.v1.js";

export const PROMPT_VERSION = "stage_verify.v2";

/** Eval-only stricter wording. The live photo check is stage_verify.v3. */
export const STAGE_VERIFY_SYSTEM_V2 = `${STAGE_VERIFY_SYSTEM}
11. Formwork still on a slab, exposed reinforcement without concrete, or an earlier floor than the claim is "not_met", not "met".`;
