# Document models

Recorded 21 Oct 2026 from the repo, not from a fresh provider catalog page.

| Role | Env | Value in `.env.example` |
| --- | --- | --- |
| Provider | `AI_DOC_PROVIDER` | `agentrouter` |
| Primary | `AI_DOC_MODEL` | `deepseek-v4-flash` |
| Fallback | `AI_DOC_FALLBACK_MODEL` | `deepseek-v4-flash` |

`packages/ai/src/router.ts` calls `{LLM_BASE_URL}/chat/completions` (default `https://agentrouter.org/v1`) with the OpenAI chat-completions body. `assertServerEnv` copies `LLM_TEXT_MODEL` onto `AI_DOC_MODEL` when the AI doc variable is unset.

Structured JSON-schema mode for `deepseek-v4-flash` on AgentRouter was not confirmed against the provider's current docs in this change. Spreadsheet intake does not call the model: headed CSV and XLSX rows are read in code. A scan without a transcript fails as `unreadable` instead of being sent as a whole file.
