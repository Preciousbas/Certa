# Document models

Recorded 21 Oct 2026 from the repo, not from a fresh provider catalog page.

| Role | Env | Value in `.env.example` |
| --- | --- | --- |
| Provider | `AI_DOC_PROVIDER` | `agentrouter` |
| Primary | `AI_DOC_MODEL` | `deepseek-v4-flash` |
| Fallback | `AI_DOC_FALLBACK_MODEL` | `deepseek-v4-flash` |

`packages/ai/src/router.ts` calls `{LLM_BASE_URL}/chat/completions` (default `https://agentrouter.org/v1`) with the OpenAI chat-completions body. `assertServerEnv` copies `LLM_TEXT_MODEL` onto `AI_DOC_MODEL` when the AI doc variable is unset.

Structured JSON-schema mode for `deepseek-v4-flash` on AgentRouter was not confirmed against the provider's current docs in this change. Spreadsheet intake does not call the model: headed CSV and XLSX rows are read in code. A scan without a transcript fails as `unreadable` instead of being sent as a whole file.

## Stage photo checks

Recorded 21 Oct 2026. The gateway is still AgentRouter. The photo model is `gpt-6.1-sol`. The fallback is `gpt-6-astra`. `deepseek-v4-flash` is not the photo fallback.

| Role | Env | Value in `.env.example` |
| --- | --- | --- |
| Provider | `AI_VISION_PROVIDER` | `agentrouter` |
| Primary | `AI_VISION_MODEL` | `gpt-6.1-sol` |
| Fallback | `AI_VISION_FALLBACK_MODEL` | `gpt-6-astra` |
| Pass threshold | `VERIFY_PASS_THRESHOLD` | `0.75` |

This repo does not call `api.deepseek.com` directly. Photo model ids that start with `gpt-` go to `{LLM_BASE_URL}/responses` (default `https://agentrouter.org/v1`), the OpenAI Responses API. The system prompt is `instructions`, each JPEG is an `input_image` data URL, `max_output_tokens` is 8000, and `text.format` is `json_object`. A gateway HTTP 400 on that format is retried once without `text`. Other photo models still use `{LLM_BASE_URL}/chat/completions` with `temperature: 0` and `response_format: { type: "json_object" }`, retried once without `response_format` on HTTP 400. JSON mode does not guarantee the schema. The reply is parsed and checked with `StageVerdict`. A Zod failure is sent back once, then the fallback model is tried, then the stage goes to `needs_more_evidence`. A gateway rejection stops there and does not call the fallback.

The stage-photo model is `gpt-6.1-sol`, with `gpt-6-astra` as the fallback, on the same gateway. `deepseek-v4-flash` stays the text model (`LLM_TEXT_MODEL` / `LLM_VISION_MODEL` is not the photo fallback). A vision HTTP call aborts after 240 seconds. A timeout is stored as an unsure verdict and the stage moves to `needs_more_evidence`, where a consultant can override it. Images are JPEG data URLs, longest side at most 1024 px, re-encoded without EXIF. The live job still uses `stage_verify.v1`. `stage_verify.v2` is eval-only. `stage_verify.v3` answers a checklist and the code computes confidence.
