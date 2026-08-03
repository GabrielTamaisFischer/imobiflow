-- Fase 58 - Hardening, LGPD, custos por tenant, beta piloto e homologacao final
-- Base multiempresa para governanca, privacidade, retencao, incidentes,
-- custos operacionais, feedback beta e checklist de release.

create table if not exists lgpd_data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  requester_name text not null,
  requester_email text,
  requester_phone text,
  requester_document text,
  subject_type text not null,
  request_type text not null,
  status text not null default 'open',
  priority text not null default 'normal',
  due_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null,
  resolution_notes text,
  verification_status text not null default 'pending',
  verification_metadata jsonb not null default '{}'::jsonb,
  related_user_id uuid references users(id) on delete set null,
  related_owner_id uuid,
  related_tenant_id uuid,
  related_lead_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lgpd_data_subject_requests_subject_type_check
    check (subject_type in ('lead', 'client', 'owner', 'tenant', 'user', 'supplier', 'other')),
  constraint lgpd_data_subject_requests_type_check
    check (
      request_type in (
        'access',
        'correction',
        'deletion',
        'portability',
        'consent_withdrawal',
        'processing_information',
        'objection',
        'other'
      )
    ),
  constraint lgpd_data_subject_requests_status_check
    check (status in ('open', 'in_review', 'waiting_verification', 'resolved', 'rejected', 'cancelled')),
  constraint lgpd_data_subject_requests_priority_check
    check (priority in ('low', 'normal', 'high', 'critical')),
  constraint lgpd_data_subject_requests_verification_status_check
    check (verification_status in ('pending', 'verified', 'failed', 'not_required'))
);

create index if not exists lgpd_data_subject_requests_company_status_idx
  on lgpd_data_subject_requests(company_id, status, priority, created_at desc);

create trigger lgpd_data_subject_requests_set_updated_at
before update on lgpd_data_subject_requests
for each row
execute function set_updated_at();

alter table lgpd_data_subject_requests enable row level security;

drop policy if exists lgpd_data_subject_requests_select_policy on lgpd_data_subject_requests;
create policy lgpd_data_subject_requests_select_policy
on lgpd_data_subject_requests
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists lgpd_data_subject_requests_insert_policy on lgpd_data_subject_requests;
create policy lgpd_data_subject_requests_insert_policy
on lgpd_data_subject_requests
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists lgpd_data_subject_requests_update_policy on lgpd_data_subject_requests;
create policy lgpd_data_subject_requests_update_policy
on lgpd_data_subject_requests
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists data_retention_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  entity_type text not null,
  retention_days integer not null,
  legal_basis text not null,
  action_after_retention text not null default 'archive',
  status text not null default 'active',
  last_reviewed_at timestamptz,
  reviewed_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_retention_policies_action_check
    check (action_after_retention in ('archive', 'anonymize', 'delete', 'manual_review')),
  constraint data_retention_policies_status_check
    check (status in ('active', 'paused', 'archived'))
);

create unique index if not exists data_retention_policies_company_entity_idx
  on data_retention_policies(company_id, entity_type)
  where status = 'active';

create trigger data_retention_policies_set_updated_at
before update on data_retention_policies
for each row
execute function set_updated_at();

alter table data_retention_policies enable row level security;

drop policy if exists data_retention_policies_select_policy on data_retention_policies;
create policy data_retention_policies_select_policy
on data_retention_policies
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists data_retention_policies_insert_policy on data_retention_policies;
create policy data_retention_policies_insert_policy
on data_retention_policies
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists data_retention_policies_update_policy on data_retention_policies;
create policy data_retention_policies_update_policy
on data_retention_policies
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists security_incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  incident_type text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  title text not null,
  description text,
  detected_at timestamptz not null default now(),
  contained_at timestamptz,
  resolved_at timestamptz,
  reported_to_authority_at timestamptz,
  reported_to_customer_at timestamptz,
  assigned_to uuid references users(id) on delete set null,
  resolved_by uuid references users(id) on delete set null,
  root_cause text,
  remediation_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint security_incidents_type_check
    check (
      incident_type in (
        'unauthorized_access',
        'data_leak',
        'payment_gateway_failure',
        'webhook_abuse',
        'credential_exposure',
        'suspicious_login',
        'rls_policy_risk',
        'availability',
        'other'
      )
    ),
  constraint security_incidents_severity_check
    check (severity in ('low', 'medium', 'high', 'critical')),
  constraint security_incidents_status_check
    check (status in ('open', 'triaging', 'contained', 'resolved', 'false_positive', 'cancelled'))
);

create index if not exists security_incidents_company_status_idx
  on security_incidents(company_id, status, severity, detected_at desc);

create trigger security_incidents_set_updated_at
before update on security_incidents
for each row
execute function set_updated_at();

alter table security_incidents enable row level security;

drop policy if exists security_incidents_select_policy on security_incidents;
create policy security_incidents_select_policy
on security_incidents
for select
using (
  company_id is null
  or company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id'
);

drop policy if exists security_incidents_insert_policy on security_incidents;
create policy security_incidents_insert_policy
on security_incidents
for insert
with check (
  company_id is null
  or company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id'
);

drop policy if exists security_incidents_update_policy on security_incidents;
create policy security_incidents_update_policy
on security_incidents
for update
using (
  company_id is null
  or company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id'
)
with check (
  company_id is null
  or company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id'
);

create table if not exists tenant_cost_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  cost_type text not null,
  provider text,
  feature text,
  entity_type text,
  entity_id uuid,
  quantity numeric(12, 4) not null default 1,
  unit_cost_cents integer not null default 0,
  total_cost_cents integer not null default 0,
  billing_period text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint tenant_cost_events_type_check
    check (
      cost_type in (
        'storage',
        'image_upload',
        'pdf_generation',
        'ai_tokens',
        'whatsapp_message',
        'email',
        'sms',
        'gateway_charge',
        'pix',
        'boleto',
        'webhook',
        'api_request',
        'other'
      )
    )
);

create index if not exists tenant_cost_events_company_period_idx
  on tenant_cost_events(company_id, billing_period, cost_type);

create index if not exists tenant_cost_events_company_feature_idx
  on tenant_cost_events(company_id, feature, occurred_at desc);

alter table tenant_cost_events enable row level security;

drop policy if exists tenant_cost_events_select_policy on tenant_cost_events;
create policy tenant_cost_events_select_policy
on tenant_cost_events
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists tenant_cost_events_insert_policy on tenant_cost_events;
create policy tenant_cost_events_insert_policy
on tenant_cost_events
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists tenant_cost_summaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  billing_period text not null,
  status text not null default 'open',
  storage_cost_cents integer not null default 0,
  ai_cost_cents integer not null default 0,
  communication_cost_cents integer not null default 0,
  gateway_cost_cents integer not null default 0,
  document_cost_cents integer not null default 0,
  other_cost_cents integer not null default 0,
  total_cost_cents integer not null default 0,
  estimated_revenue_cents integer not null default 0,
  estimated_margin_cents integer not null default 0,
  generated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_cost_summaries_status_check
    check (status in ('open', 'reviewed', 'closed', 'adjusted'))
);

create unique index if not exists tenant_cost_summaries_company_period_idx
  on tenant_cost_summaries(company_id, billing_period);

create trigger tenant_cost_summaries_set_updated_at
before update on tenant_cost_summaries
for each row
execute function set_updated_at();

alter table tenant_cost_summaries enable row level security;

drop policy if exists tenant_cost_summaries_select_policy on tenant_cost_summaries;
create policy tenant_cost_summaries_select_policy
on tenant_cost_summaries
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists tenant_cost_summaries_insert_policy on tenant_cost_summaries;
create policy tenant_cost_summaries_insert_policy
on tenant_cost_summaries
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists tenant_cost_summaries_update_policy on tenant_cost_summaries;
create policy tenant_cost_summaries_update_policy
on tenant_cost_summaries
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists beta_feedback_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  submitted_by uuid references users(id) on delete set null,
  module text not null,
  feedback_type text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  title text not null,
  description text,
  expected_behavior text,
  actual_behavior text,
  screenshot_url text,
  reproduction_steps jsonb not null default '[]'::jsonb,
  assigned_to uuid references users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null,
  resolution_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_feedback_items_type_check
    check (feedback_type in ('bug', 'improvement', 'question', 'training_need', 'data_issue', 'performance', 'other')),
  constraint beta_feedback_items_severity_check
    check (severity in ('low', 'medium', 'high', 'critical')),
  constraint beta_feedback_items_status_check
    check (status in ('open', 'triaging', 'planned', 'in_progress', 'resolved', 'wont_fix', 'duplicate'))
);

create index if not exists beta_feedback_items_company_status_idx
  on beta_feedback_items(company_id, module, status, severity, created_at desc);

create trigger beta_feedback_items_set_updated_at
before update on beta_feedback_items
for each row
execute function set_updated_at();

alter table beta_feedback_items enable row level security;

drop policy if exists beta_feedback_items_select_policy on beta_feedback_items;
create policy beta_feedback_items_select_policy
on beta_feedback_items
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists beta_feedback_items_insert_policy on beta_feedback_items;
create policy beta_feedback_items_insert_policy
on beta_feedback_items
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists beta_feedback_items_update_policy on beta_feedback_items;
create policy beta_feedback_items_update_policy
on beta_feedback_items
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists release_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  release_name text not null,
  check_key text not null,
  category text not null,
  status text not null default 'pending',
  required boolean not null default true,
  evidence_url text,
  notes text,
  checked_by uuid references users(id) on delete set null,
  checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint release_readiness_checks_category_check
    check (
      category in (
        'security',
        'lgpd',
        'billing',
        'database',
        'performance',
        'observability',
        'backup',
        'support',
        'training',
        'product',
        'integration',
        'other'
      )
    ),
  constraint release_readiness_checks_status_check
    check (status in ('pending', 'passed', 'failed', 'skipped', 'blocked'))
);

create unique index if not exists release_readiness_checks_unique_idx
  on release_readiness_checks(release_name, check_key, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists release_readiness_checks_status_idx
  on release_readiness_checks(release_name, category, status);

create trigger release_readiness_checks_set_updated_at
before update on release_readiness_checks
for each row
execute function set_updated_at();

alter table release_readiness_checks enable row level security;

drop policy if exists release_readiness_checks_select_policy on release_readiness_checks;
create policy release_readiness_checks_select_policy
on release_readiness_checks
for select
using (
  company_id is null
  or company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id'
);

drop policy if exists release_readiness_checks_insert_policy on release_readiness_checks;
create policy release_readiness_checks_insert_policy
on release_readiness_checks
for insert
with check (
  company_id is null
  or company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id'
);

drop policy if exists release_readiness_checks_update_policy on release_readiness_checks;
create policy release_readiness_checks_update_policy
on release_readiness_checks
for update
using (
  company_id is null
  or company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id'
)
with check (
  company_id is null
  or company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id'
);
