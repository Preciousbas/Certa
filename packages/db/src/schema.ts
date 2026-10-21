import {
  bigint,
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
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
  ...timestamps,
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
  ...timestamps,
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

export const blobs = pgTable("blobs", {
  storageKey: text("storage_key").primaryKey(),
  bytes: text("bytes").notNull(),
  contentType: text("content_type").notNull(),
  ...timestamps,
});
