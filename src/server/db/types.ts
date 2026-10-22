// Generated from the public schema after migrations 0001, 0002, and 0003.

export type ApprovalsRow = {
  id: string;
  project_id: string;
  workspace_id: string;
  stage_id: string | null;
  by_user_id: string;
  decision: string;
  reason: string | null;
  at: string;
  created_at: string;
  updated_at: string;
};

export type AuditLogRow = {
  id: string;
  workspace_id: string | null;
  actor_user_id: string | null;
  actor_telegram_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before_hash: string | null;
  after_hash: string | null;
  prev_hash: string;
  row_hash: string;
  ip: string | null;
  created_at: string;
  reason: string | null;
  request_id: string | null;
  project_id: string | null;
};

export type BlobsRow = {
  storage_key: string;
  bytes: string;
  content_type: string;
  created_at: string;
  updated_at: string;
};

export type BoqItemsRow = {
  id: string;
  contract_version_id: string;
  bill_ref: string;
  item_ref: string;
  description: string;
  unit: string | null;
  quantity_milli: string | null;
  rate_kobo: string | null;
  amount_kobo: string;
  stated_amount_kobo: string | null;
  source_anchor: string;
  confidence: number;
};

export type BotSessionsRow = {
  telegram_id: string;
  active_project_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CaptureNoncesRow = {
  id: string;
  project_id: string;
  user_id: string;
  stage_id: string;
  nonce_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChainTxsRow = {
  id: string;
  project_id: string | null;
  stage_id: string | null;
  kind: string;
  idempotency_key: string;
  chain_id: number;
  from_address: string;
  to_address: string;
  calldata: string | null;
  value_micro: string | null;
  status: string;
  tx_hash: string | null;
  block_number: string | null;
  confirmations: number;
  error: string | null;
  attempts: number;
  submitted_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type ChangeRequestsRow = {
  id: string;
  project_id: string;
  workspace_id: string;
  type: string;
  before_json: unknown;
  after_json: unknown;
  requested_by: string;
  status: string;
  response: string | null;
  reason: string | null;
  responded_at: string | null;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractAcceptancesRow = {
  id: string;
  contract_version_id: string;
  user_id: string;
  role: string;
  decision: string;
  reason: string | null;
  content_hash: string;
  created_at: string;
};

export type ContractSummariesRow = {
  id: string;
  project_id: string;
  workspace_id: string;
  version: number;
  json: unknown;
  hash: string;
  accepted_by_client_at: string | null;
  accepted_by_contractor_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractVersionsRow = {
  id: string;
  project_id: string;
  version: number;
  extraction_id: string | null;
  status: string;
  currency: string;
  contract_sum_kobo: string;
  vat_bps: number;
  vat_kobo: string;
  retention_bps: number;
  advance_kobo: string;
  advance_recovery: unknown;
  ld_rate_kobo: string | null;
  ld_period: string | null;
  ld_cap_bps: number | null;
  start_date: string | null;
  completion_date: string | null;
  defects_period_days: number;
  kobo_per_usdc: string;
  fx_source: string;
  fx_as_of: string;
  spending_cap_micro: string;
  terms: unknown;
  document_hashes: string[];
  content_hash: string;
  created_by: string;
  created_at: string;
};

export type DisputesRow = {
  id: string;
  stage_id: string;
  project_id: string;
  workspace_id: string;
  raised_by: string;
  reason: string;
  evidence: unknown;
  status: string;
  opened_at: string;
  deadline_at: string;
  resolution: unknown;
  created_at: string;
  updated_at: string;
};

export type DocumentChunksRow = {
  id: string;
  document_id: string;
  anchor: string;
  kind: string;
  content: string;
  ocr_confidence: number | null;
  ord: number;
};

export type DocumentsRow = {
  id: string;
  project_id: string;
  workspace_id: string;
  kind: string;
  storage_key: string;
  sha256: string;
  parsed_json: unknown;
  parse_status: string;
  created_at: string;
  updated_at: string;
};

export type EscrowsRow = {
  id: string;
  project_id: string;
  contract_version_id: string;
  chain_id: number;
  factory_address: string;
  address: string;
  create_tx_id: string;
  created_at: string;
};

export type ExtractionsRow = {
  id: string;
  project_id: string;
  document_ids: string[];
  status: string;
  model: string;
  prompt_version: string;
  raw_json: unknown;
  validated_json: unknown;
  issues: unknown;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_micro: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type FxRatesRow = {
  id: string;
  kobo_per_usdc: string;
  source: string;
  as_of: string;
  created_at: string;
};

export type JobsRow = {
  id: string;
  kind: string;
  payload: unknown;
  dedupe_key: string | null;
  status: string;
  attempts: number;
  run_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type JoinAttemptsRow = {
  id: string;
  telegram_id: string;
  created_at: string;
};

export type JoinCodesRow = {
  id: string;
  project_id: string;
  workspace_id: string;
  role: string;
  code_hash: string;
  expires_at: string;
  max_uses: number;
  use_count: number;
  created_at: string;
  updated_at: string;
};

export type MembershipsRow = {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  status: string;
  invited_by: string | null;
  joined_at: string;
};

export type NotificationsRow = {
  id: string;
  user_id: string;
  kind: string;
  payload: unknown;
  channel: string;
  status: string;
  telegram_message_id: string | null;
  dedupe_key: string;
  created_at: string;
  sent_at: string | null;
};

export type OutboundEmailsRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  to_ciphertext: string;
  subject: string;
  status: string;
  idempotency_key: string;
  provider_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PartiesRow = {
  id: string;
  project_id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  wallet_address: string | null;
  cdp_wallet_id: string | null;
  wallet_mock: boolean;
  can_view_subs: boolean;
  notification_emails: unknown;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentsRow = {
  id: string;
  stage_id: string | null;
  project_id: string;
  workspace_id: string;
  kind: string;
  amount_usdc: string;
  amount_ngn_kobo: string;
  tx_hash: string | null;
  status: string;
  idempotency_key: string;
  certificate_doc_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PhotosRow = {
  id: string;
  submission_id: string | null;
  project_id: string;
  workspace_id: string;
  storage_key: string;
  sha256: string;
  phash: string;
  captured_at: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  device: string | null;
  checks_json: unknown;
  stamped_key: string | null;
  created_at: string;
  updated_at: string;
};

export type PlansRow = {
  id: string;
  name: string;
  price_ngn_kobo: string;
  interval: string;
  created_at: string;
  updated_at: string;
};

export type ProjectsRow = {
  id: string;
  workspace_id: string;
  name: string;
  site_location: string;
  site_lat: number;
  site_lng: number;
  geofence_radius_m: number;
  status: string;
  fx_rate_locked: string;
  fx_source: string;
  fx_locked_at: string | null;
  escrow_address: string | null;
  spending_cap_usdc: string;
  retention_bps: number;
  defects_period_days: number;
  dispute_timeout_days: number;
  change_reply_hours: number;
  deemed_acceptance: boolean;
  mobilisation_bps: number;
  contract_sum_kobo: string;
  contract_sum_usdc: string;
  terms_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type StagesRow = {
  id: string;
  project_id: string;
  workspace_id: string;
  stage_index: number;
  name: string;
  description: string;
  amount_ngn_kobo: string;
  amount_usdc: string;
  retention_bps: number;
  status: string;
  funded: boolean;
  on_chain_idx: number;
  assigned_party_id: string | null;
  pour: boolean;
  created_at: string;
  updated_at: string;
};

export type SubmissionsRow = {
  id: string;
  stage_id: string;
  project_id: string;
  workspace_id: string;
  submitted_by: string;
  ai_assessment_json: unknown;
  confidence: number | null;
  decision: string | null;
  evidence_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type TelegramIdentitiesRow = {
  telegram_user_id: string;
  user_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  language_code: string | null;
  last_auth_at: string;
};

export type TelegramUpdatesRow = {
  update_id: string;
  received_at: string;
  processed_at: string | null;
  error: string | null;
};

export type UsageLedgerRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  kind: string;
  amount_usdc: string;
  period: string;
  created_at: string;
  updated_at: string;
};

export type UsersRow = {
  id: string;
  telegram_id: string;
  name: string;
  phone_ciphertext: string | null;
  email_ciphertext: string | null;
  locale: string;
  created_at: string;
  updated_at: string;
};

export type VariationsRow = {
  id: string;
  project_id: string;
  proposed_by: string;
  title: string;
  description: string;
  type: string;
  amount_kobo: string;
  affects_stage_id: string | null;
  status: string;
  responded_by: string | null;
  response_reason: string | null;
  respond_by: string;
  applied_tx_id: string | null;
  created_at: string;
};

export type WalletsRow = {
  id: string;
  user_id: string | null;
  project_id: string | null;
  purpose: string;
  provider: string;
  provider_account_ref: string;
  address: string;
  chain_id: number;
  created_at: string;
};

export type WorkspaceMembersRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: string;
  updated_at: string;
};

export type WorkspacesRow = {
  id: string;
  owner_user_id: string;
  name: string;
  company: string;
  plan: string;
  status: string;
  gas_allowance_usdc: string;
  x402_allowance_usdc: string;
  letterhead_file_id: string | null;
  margin_top: number;
  margin_bottom: number;
  created_at: string;
  updated_at: string;
  is_demo: boolean;
};

export type X402CallsRow = {
  id: string;
  project_id: string;
  workspace_id: string;
  endpoint: string;
  cost_usdc: string;
  tx_hash: string | null;
  receipt: unknown;
  response_summary: string | null;
  created_at: string;
  updated_at: string;
};

export type X402SpendRow = {
  id: string;
  project_id: string;
  stage_id: string | null;
  endpoint: string;
  amount_micro: string;
  chain_tx_id: string | null;
  payment_response: unknown;
  result_summary: string;
  created_at: string;
};
