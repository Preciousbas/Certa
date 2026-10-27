import {
  bigint,
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramId: bigint("telegram_id", { mode: "bigint" }).notNull().unique(),
  name: text("name").notNull(),
  phoneCiphertext: text("phone_ciphertext"),
  emailCiphertext: text("email_ciphertext"),
  locale: text("locale").notNull().default("en"),
  platformRole: text("platform_role").notNull().default("user"),
  ...timestamps,
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").notNull(),
  name: text("name").notNull(),
  company: text("company").notNull(),
  plan: text("plan").notNull().default("project"),
  status: text("status").notNull().default("active"),
  gasAllowanceUsdc: bigint("gas_allowance_usdc", { mode: "bigint" }).notNull().default(0n),
  x402AllowanceUsdc: bigint("x402_allowance_usdc", { mode: "bigint" }).notNull().default(0n),
  allowanceMicro: bigint("allowance_micro", { mode: "bigint" }).notNull().default(0n),
  letterheadFileId: uuid("letterhead_file_id"),
  marginTop: integer("margin_top").notNull().default(96),
  marginBottom: integer("margin_bottom").notNull().default(72),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("workspace_members_user").on(table.workspaceId, table.userId)],
);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  name: text("name").notNull(),
  siteLocation: text("site_location").notNull(),
  siteLat: doublePrecision("site_lat").notNull(),
  siteLng: doublePrecision("site_lng").notNull(),
  geofenceRadiusM: integer("geofence_radius_m").notNull(),
  status: text("status").notNull().default("draft"),
  fxRateLocked: bigint("fx_rate_locked", { mode: "bigint" }).notNull(),
  fxSource: text("fx_source").notNull(),
  fxLockedAt: timestamp("fx_locked_at", { withTimezone: true }),
  escrowAddress: text("escrow_address"),
  spendingCapUsdc: bigint("spending_cap_usdc", { mode: "bigint" }).notNull(),
  retentionBps: integer("retention_bps").notNull(),
  defectsPeriodDays: integer("defects_period_days").notNull(),
  disputeTimeoutDays: integer("dispute_timeout_days").notNull().default(7),
  changeReplyHours: integer("change_reply_hours").notNull().default(72),
  deemedAcceptance: boolean("deemed_acceptance").notNull().default(false),
  mobilisationBps: integer("mobilisation_bps").notNull().default(0),
  contractSumKobo: bigint("contract_sum_kobo", { mode: "bigint" }).notNull(),
  contractSumUsdc: bigint("contract_sum_usdc", { mode: "bigint" }).notNull(),
  termsHash: text("terms_hash"),
  currentContractVersionId: uuid("current_contract_version_id"),
  chainSync: text("chain_sync").notNull().default("ok"),
  ...timestamps,
});

export const parties = pgTable("parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: text("role").notNull(),
  walletAddress: text("wallet_address"),
  cdpWalletId: text("cdp_wallet_id"),
  walletMock: boolean("wallet_mock").notNull().default(false),
  canViewSubs: boolean("can_view_subs").notNull().default(false),
  notificationEmails: jsonb("notification_emails").$type<string[]>().notNull().default([]),
  emailVerified: boolean("email_verified").notNull().default(false),
  ...timestamps,
});

export const joinCodes = pgTable("join_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  role: text("role").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  maxUses: integer("max_uses").notNull().default(1),
  useCount: integer("use_count").notNull().default(0),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...timestamps,
});

export const joinAttempts = pgTable("join_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramId: bigint("telegram_id", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stages = pgTable("stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  stageIndex: integer("stage_index").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  amountNgnKobo: bigint("amount_ngn_kobo", { mode: "bigint" }).notNull(),
  amountUsdc: bigint("amount_usdc", { mode: "bigint" }).notNull(),
  retentionBps: integer("retention_bps").notNull(),
  status: text("status").notNull().default("not_started"),
  funded: boolean("funded").notNull().default(false),
  onChainIdx: integer("on_chain_idx").notNull(),
  assignedPartyId: uuid("assigned_party_id"),
  pour: boolean("pour").notNull().default(false),
  contractVersionId: uuid("contract_version_id"),
  kind: text("kind").notNull().default("work"),
  acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>().notNull().default([]),
  tags: text("tags").array().notNull().default([]),
  expectedFinish: date("expected_finish"),
  ...timestamps,
});

export const contractSummaries = pgTable("contract_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  version: integer("version").notNull(),
  json: jsonb("json").notNull(),
  hash: text("hash").notNull(),
  acceptedByClientAt: timestamp("accepted_by_client_at", { withTimezone: true }),
  acceptedByContractorAt: timestamp("accepted_by_contractor_at", { withTimezone: true }),
  ...timestamps,
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  kind: text("kind").notNull(),
  storageKey: text("storage_key").notNull(),
  sha256: text("sha256").notNull(),
  parsedJson: jsonb("parsed_json"),
  parseStatus: text("parse_status").notNull().default("pending"),
  uploadedBy: uuid("uploaded_by"),
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  detectedType: text("detected_type"),
  sizeBytes: integer("size_bytes"),
  pageCount: integer("page_count"),
  sheetNames: text("sheet_names").array(),
  failureCode: text("failure_code"),
  status: text("status").notNull().default("uploaded"),
  ...timestamps,
});

export const documentChunks = pgTable("document_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull(),
  anchor: text("anchor").notNull(),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  ocrConfidence: real("ocr_confidence"),
  ord: integer("ord").notNull(),
});

export const extractions = pgTable("extractions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  documentIds: uuid("document_ids").array().notNull(),
  status: text("status").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  rawJson: jsonb("raw_json").notNull().default({}),
  validatedJson: jsonb("validated_json"),
  issues: jsonb("issues").notNull().default([]),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costMicro: bigint("cost_micro", { mode: "bigint" }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const boqItems = pgTable("boq_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractVersionId: uuid("contract_version_id").notNull(),
  billRef: text("bill_ref").notNull(),
  itemRef: text("item_ref").notNull(),
  description: text("description").notNull(),
  unit: text("unit"),
  quantityMilli: bigint("quantity_milli", { mode: "bigint" }),
  rateKobo: bigint("rate_kobo", { mode: "bigint" }),
  amountKobo: bigint("amount_kobo", { mode: "bigint" }).notNull(),
  statedAmountKobo: bigint("stated_amount_kobo", { mode: "bigint" }),
  sourceAnchor: text("source_anchor").notNull(),
  confidence: real("confidence").notNull(),
});

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  stageId: uuid("stage_id").notNull(),
  projectId: uuid("project_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  submittedBy: uuid("submitted_by").notNull(),
  aiAssessmentJson: jsonb("ai_assessment_json"),
  confidence: doublePrecision("confidence"),
  decision: text("decision"),
  evidenceHash: text("evidence_hash"),
  status: text("status"),
  ...timestamps,
});

export const photos = pgTable("photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id"),
  projectId: uuid("project_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  storageKey: text("storage_key").notNull(),
  sha256: text("sha256").notNull(),
  phash: text("phash").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  gpsLat: doublePrecision("gps_lat"),
  gpsLng: doublePrecision("gps_lng"),
  device: text("device"),
  checksJson: jsonb("checks_json").notNull(),
  stampedKey: text("stamped_key"),
  stageId: uuid("stage_id"),
  uploadedBy: uuid("uploaded_by"),
  accuracyM: real("accuracy_m"),
  distanceFromSiteM: real("distance_from_site_m"),
  exif: jsonb("exif").notNull().default({}),
  nonce: text("nonce"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  originalKey: text("original_key"),
  widthPx: integer("width_px"),
  heightPx: integer("height_px"),
  ...timestamps,
});

export const aiVerdicts = pgTable("ai_verdicts", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull(),
  stageId: uuid("stage_id").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  verdict: text("verdict").notNull(),
  confidence: real("confidence").notNull(),
  rawJson: jsonb("raw_json").notNull(),
  criteriaResults: jsonb("criteria_results").notNull(),
  reasons: text("reasons").array().notNull(),
  issues: text("issues").array().notNull(),
  safetyFlags: text("safety_flags").array().notNull().default([]),
  missingShots: text("missing_shots").array().notNull().default([]),
  latencyMs: integer("latency_ms"),
  costMicro: bigint("cost_micro", { mode: "bigint" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  stageId: uuid("stage_id"),
  byUserId: uuid("by_user_id").notNull(),
  decision: text("decision").notNull(),
  reason: text("reason"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
});

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  stageId: uuid("stage_id").notNull(),
  projectId: uuid("project_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  raisedBy: uuid("raised_by").notNull(),
  reason: text("reason").notNull(),
  evidence: jsonb("evidence"),
  status: text("status").notNull().default("open"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
  resolution: jsonb("resolution"),
  ...timestamps,
});

export const changeRequests = pgTable("change_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  type: text("type").notNull(),
  beforeJson: jsonb("before_json").notNull(),
  afterJson: jsonb("after_json").notNull(),
  requestedBy: uuid("requested_by").notNull(),
  status: text("status").notNull().default("pending"),
  response: text("response"),
  reason: text("reason"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  ...timestamps,
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  stageId: uuid("stage_id"),
  projectId: uuid("project_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  kind: text("kind").notNull(),
  amountUsdc: bigint("amount_usdc", { mode: "bigint" }).notNull(),
  amountNgnKobo: bigint("amount_ngn_kobo", { mode: "bigint" }).notNull(),
  txHash: text("tx_hash"),
  status: text("status").notNull().default("pending"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  certificateDocId: uuid("certificate_doc_id"),
  ...timestamps,
});

export const x402Spend = pgTable("x402_spend", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  stageId: uuid("stage_id"),
  endpoint: text("endpoint").notNull(),
  amountMicro: bigint("amount_micro", { mode: "bigint" }).notNull(),
  chainTxId: uuid("chain_tx_id"),
  paymentResponse: jsonb("payment_response").$type<Record<string, unknown>>().notNull(),
  resultSummary: text("result_summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const x402Calls = pgTable("x402_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  endpoint: text("endpoint").notNull(),
  costUsdc: bigint("cost_usdc", { mode: "bigint" }).notNull(),
  txHash: text("tx_hash"),
  receipt: jsonb("receipt"),
  responseSummary: text("response_summary"),
  ...timestamps,
});

export const outboundEmails = pgTable("outbound_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  projectId: uuid("project_id"),
  toCiphertext: text("to_ciphertext").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  providerId: text("provider_id"),
  ...timestamps,
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id"),
  workspaceId: uuid("workspace_id"),
  actorUserId: uuid("actor_user_id"),
  actorTelegramId: bigint("actor_telegram_id", { mode: "bigint" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  beforeHash: text("before_hash"),
  afterHash: text("after_hash"),
  prevHash: text("prev_hash").notNull(),
  rowHash: text("row_hash").notNull(),
  ip: text("ip"),
  reason: text("reason"),
  requestId: text("request_id"),
  actorKind: text("actor_kind").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fxRates = pgTable("fx_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  koboPerUsdc: bigint("kobo_per_usdc", { mode: "bigint" }).notNull(),
  source: text("source").notNull(),
  asOf: text("as_of").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  channel: text("channel").notNull().default("telegram"),
  status: text("status").notNull(),
  telegramMessageId: bigint("telegram_message_id", { mode: "bigint" }),
  dedupeKey: text("dedupe_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  dedupeKey: text("dedupe_key"),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  ...timestamps,
});

export const usageLedger = pgTable("usage_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  projectId: uuid("project_id"),
  kind: text("kind").notNull(),
  amountUsdc: bigint("amount_usdc", { mode: "bigint" }).notNull(),
  period: text("period").notNull(),
  ...timestamps,
});

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  priceNgnKobo: bigint("price_ngn_kobo", { mode: "bigint" }).notNull(),
  interval: text("interval").notNull(),
  ...timestamps,
});

export const captureNonces = pgTable("capture_nonces", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  userId: uuid("user_id").notNull(),
  stageId: uuid("stage_id").notNull(),
  nonceHash: text("nonce_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  ...timestamps,
});

export const botSessions = pgTable("bot_sessions", {
  telegramId: bigint("telegram_id", { mode: "bigint" }).primaryKey(),
  activeProjectId: uuid("active_project_id"),
  state: jsonb("state").$type<Record<string, unknown> | null>(),
  stateExpiresAt: timestamp("state_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const telegramIdentities = pgTable("telegram_identities", {
  telegramUserId: bigint("telegram_user_id", { mode: "bigint" }).primaryKey(),
  userId: uuid("user_id").notNull(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  photoUrl: text("photo_url"),
  languageCode: text("language_code"),
  lastAuthAt: timestamp("last_auth_at", { withTimezone: true }).notNull().defaultNow(),
});

export const telegramUpdates = pgTable("telegram_updates", {
  updateId: bigint("update_id", { mode: "bigint" }).primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
});

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("active"),
  notifyChannel: text("notify_channel").notNull().default("telegram"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contractVersions = pgTable("contract_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  version: integer("version").notNull(),
  extractionId: uuid("extraction_id"),
  status: text("status").notNull(),
  currency: text("currency").notNull().default("NGN"),
  contractSumKobo: bigint("contract_sum_kobo", { mode: "bigint" }).notNull(),
  vatBps: integer("vat_bps").notNull().default(0),
  vatKobo: bigint("vat_kobo", { mode: "bigint" }).notNull().default(0n),
  retentionBps: integer("retention_bps").notNull().default(0),
  advanceKobo: bigint("advance_kobo", { mode: "bigint" }).notNull().default(0n),
  advanceRecovery: jsonb("advance_recovery"),
  ldRateKobo: bigint("ld_rate_kobo", { mode: "bigint" }),
  ldPeriod: text("ld_period"),
  ldCapBps: integer("ld_cap_bps"),
  startDate: date("start_date"),
  completionDate: date("completion_date"),
  defectsPeriodDays: integer("defects_period_days").notNull().default(180),
  koboPerUsdc: bigint("kobo_per_usdc", { mode: "bigint" }).notNull(),
  fxSource: text("fx_source").notNull(),
  fxAsOf: date("fx_as_of").notNull(),
  spendingCapMicro: bigint("spending_cap_micro", { mode: "bigint" }).notNull(),
  terms: jsonb("terms").notNull(),
  documentHashes: text("document_hashes").array().notNull(),
  contentHash: text("content_hash").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contractAcceptances = pgTable("contract_acceptances", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractVersionId: uuid("contract_version_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: text("role").notNull(),
  decision: text("decision").notNull(),
  reason: text("reason"),
  contentHash: text("content_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  projectId: uuid("project_id"),
  purpose: text("purpose").notNull(),
  provider: text("provider").notNull().default("cdp"),
  providerAccountRef: text("provider_account_ref").notNull(),
  address: text("address").notNull(),
  chainId: integer("chain_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const escrows = pgTable("escrows", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().unique(),
  contractVersionId: uuid("contract_version_id").notNull(),
  chainId: integer("chain_id").notNull(),
  factoryAddress: text("factory_address").notNull(),
  address: text("address").notNull(),
  createTxId: uuid("create_tx_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chainTxs = pgTable("chain_txs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id"),
  stageId: uuid("stage_id"),
  kind: text("kind").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  chainId: integer("chain_id").notNull(),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  calldata: text("calldata"),
  valueMicro: bigint("value_micro", { mode: "bigint" }),
  status: text("status").notNull(),
  txHash: text("tx_hash").unique(),
  blockNumber: bigint("block_number", { mode: "bigint" }),
  confirmations: integer("confirmations").notNull().default(0),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  nonce: bigint("nonce", { mode: "bigint" }),
  intent: text("intent"),
  replacedHash: text("replaced_hash"),
});

export const blobs = pgTable("blobs", {
  storageKey: text("storage_key").primaryKey(),
  bytes: text("bytes").notNull(),
  contentType: text("content_type").notNull(),
  ...timestamps,
});
