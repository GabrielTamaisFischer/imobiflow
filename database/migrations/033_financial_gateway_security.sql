-- Fase 51 - Seguranca operacional dos gateways financeiros
-- Prepara rotacao de credenciais, endpoints de webhook por empresa e
-- controle de tentativas de eventos recebidos dos provedores financeiros.

create table if not exists financial_gateway_credential_rotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  gateway_connection_id uuid not null references financial_gateway_connections(id) on delete cascade,
  provider text not null,
  status text not null default 'planned',
  reason text,
  requested_by uuid references users(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  old_secret_hint text,
  new_secret_hint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_gateway_credential_rotations_status_check
    check (status in ('planned', 'approved', 'running', 'completed', 'failed', 'cancelled'))
);

create index if not exists financial_gateway_credential_rotations_company_idx
  on financial_gateway_credential_rotations(company_id, gateway_connection_id, created_at desc);

create trigger financial_gateway_credential_rotations_set_updated_at
before update on financial_gateway_credential_rotations
for each row
execute function set_updated_at();

alter table financial_gateway_credential_rotations enable row level security;

drop policy if exists financial_gateway_credential_rotations_select_policy on financial_gateway_credential_rotations;
create policy financial_gateway_credential_rotations_select_policy
on financial_gateway_credential_rotations
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_gateway_credential_rotations_insert_policy on financial_gateway_credential_rotations;
create policy financial_gateway_credential_rotations_insert_policy
on financial_gateway_credential_rotations
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_gateway_credential_rotations_update_policy on financial_gateway_credential_rotations;
create policy financial_gateway_credential_rotations_update_policy
on financial_gateway_credential_rotations
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists financial_gateway_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  gateway_connection_id uuid not null references financial_gateway_connections(id) on delete cascade,
  provider text not null,
  endpoint_token text not null,
  status text not null default 'active',
  expected_events text[] not null default '{}'::text[],
  allowed_ips text[] not null default '{}'::text[],
  signature_header text,
  secret_hint text,
  last_event_at timestamptz,
  last_valid_event_at timestamptz,
  last_invalid_event_at timestamptz,
  invalid_attempts integer not null default 0,
  created_by uuid references users(id) on delete set null,
  rotated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_gateway_webhook_endpoints_status_check
    check (status in ('active', 'paused', 'rotating', 'disabled')),
  constraint financial_gateway_webhook_endpoints_token_unique
    unique (endpoint_token)
);

create unique index if not exists financial_gateway_webhook_endpoints_connection_active_idx
  on financial_gateway_webhook_endpoints(gateway_connection_id)
  where status = 'active';

create index if not exists financial_gateway_webhook_endpoints_company_idx
  on financial_gateway_webhook_endpoints(company_id, provider, status);

create trigger financial_gateway_webhook_endpoints_set_updated_at
before update on financial_gateway_webhook_endpoints
for each row
execute function set_updated_at();

alter table financial_gateway_webhook_endpoints enable row level security;

drop policy if exists financial_gateway_webhook_endpoints_select_policy on financial_gateway_webhook_endpoints;
create policy financial_gateway_webhook_endpoints_select_policy
on financial_gateway_webhook_endpoints
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_gateway_webhook_endpoints_insert_policy on financial_gateway_webhook_endpoints;
create policy financial_gateway_webhook_endpoints_insert_policy
on financial_gateway_webhook_endpoints
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_gateway_webhook_endpoints_update_policy on financial_gateway_webhook_endpoints;
create policy financial_gateway_webhook_endpoints_update_policy
on financial_gateway_webhook_endpoints
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists financial_gateway_webhook_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  gateway_connection_id uuid references financial_gateway_connections(id) on delete set null,
  webhook_endpoint_id uuid references financial_gateway_webhook_endpoints(id) on delete set null,
  provider text,
  endpoint_token text,
  gateway_event_id text,
  event_type text,
  status text not null default 'received',
  http_status integer,
  signature_valid boolean,
  ip_address text,
  user_agent text,
  error_message text,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint financial_gateway_webhook_attempts_status_check
    check (status in ('received', 'validated', 'rejected', 'processed', 'failed', 'duplicate'))
);

create index if not exists financial_gateway_webhook_attempts_company_idx
  on financial_gateway_webhook_attempts(company_id, created_at desc);

create index if not exists financial_gateway_webhook_attempts_endpoint_idx
  on financial_gateway_webhook_attempts(webhook_endpoint_id, created_at desc);

create index if not exists financial_gateway_webhook_attempts_event_idx
  on financial_gateway_webhook_attempts(provider, gateway_event_id);

alter table financial_gateway_webhook_attempts enable row level security;

drop policy if exists financial_gateway_webhook_attempts_select_policy on financial_gateway_webhook_attempts;
create policy financial_gateway_webhook_attempts_select_policy
on financial_gateway_webhook_attempts
for select
using (
  company_id is null
  or company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id'
);
