-- Fase 52 - Homologacao sandbox de gateways financeiros
-- Checklist operacional para validar um provedor financeiro antes de liberar
-- cobrancas reais em producao.

create table if not exists financial_gateway_onboarding_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  gateway_connection_id uuid not null references financial_gateway_connections(id) on delete cascade,
  provider text not null,
  check_type text not null,
  status text not null default 'pending',
  required_for_production boolean not null default true,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  completed_by uuid references users(id) on delete set null,
  evidence_url text,
  external_reference text,
  result_message text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_gateway_onboarding_checks_type_check
    check (
      check_type in (
        'credentials_configured',
        'healthcheck_passed',
        'webhook_endpoint_configured',
        'webhook_signature_validated',
        'pix_charge_created',
        'pix_payment_webhook_received',
        'boleto_charge_created',
        'boleto_settlement_flow_validated',
        'charge_cancellation_validated',
        'financial_reconciliation_validated',
        'audit_log_validated',
        'production_approval'
      )
    ),
  constraint financial_gateway_onboarding_checks_status_check
    check (status in ('pending', 'running', 'passed', 'failed', 'skipped', 'cancelled'))
);

create unique index if not exists financial_gateway_onboarding_checks_unique_idx
  on financial_gateway_onboarding_checks(gateway_connection_id, check_type);

create index if not exists financial_gateway_onboarding_checks_company_status_idx
  on financial_gateway_onboarding_checks(company_id, provider, status);

create index if not exists financial_gateway_onboarding_checks_connection_idx
  on financial_gateway_onboarding_checks(gateway_connection_id, required_for_production, status);

create trigger financial_gateway_onboarding_checks_set_updated_at
before update on financial_gateway_onboarding_checks
for each row
execute function set_updated_at();

alter table financial_gateway_onboarding_checks enable row level security;

drop policy if exists financial_gateway_onboarding_checks_select_policy on financial_gateway_onboarding_checks;
create policy financial_gateway_onboarding_checks_select_policy
on financial_gateway_onboarding_checks
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_gateway_onboarding_checks_insert_policy on financial_gateway_onboarding_checks;
create policy financial_gateway_onboarding_checks_insert_policy
on financial_gateway_onboarding_checks
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_gateway_onboarding_checks_update_policy on financial_gateway_onboarding_checks;
create policy financial_gateway_onboarding_checks_update_policy
on financial_gateway_onboarding_checks
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists financial_gateway_activation_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  gateway_connection_id uuid not null references financial_gateway_connections(id) on delete cascade,
  provider text not null,
  requested_environment text not null default 'production',
  status text not null default 'pending',
  requested_by uuid references users(id) on delete set null,
  reviewed_by uuid references users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  review_notes text,
  missing_checks text[] not null default '{}'::text[],
  risk_level text not null default 'medium',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_gateway_activation_reviews_environment_check
    check (requested_environment in ('sandbox', 'production')),
  constraint financial_gateway_activation_reviews_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint financial_gateway_activation_reviews_risk_level_check
    check (risk_level in ('low', 'medium', 'high', 'critical'))
);

create index if not exists financial_gateway_activation_reviews_company_idx
  on financial_gateway_activation_reviews(company_id, status, requested_at desc);

create index if not exists financial_gateway_activation_reviews_connection_idx
  on financial_gateway_activation_reviews(gateway_connection_id, status);

create trigger financial_gateway_activation_reviews_set_updated_at
before update on financial_gateway_activation_reviews
for each row
execute function set_updated_at();

alter table financial_gateway_activation_reviews enable row level security;

drop policy if exists financial_gateway_activation_reviews_select_policy on financial_gateway_activation_reviews;
create policy financial_gateway_activation_reviews_select_policy
on financial_gateway_activation_reviews
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_gateway_activation_reviews_insert_policy on financial_gateway_activation_reviews;
create policy financial_gateway_activation_reviews_insert_policy
on financial_gateway_activation_reviews
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_gateway_activation_reviews_update_policy on financial_gateway_activation_reviews;
create policy financial_gateway_activation_reviews_update_policy
on financial_gateway_activation_reviews
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');
