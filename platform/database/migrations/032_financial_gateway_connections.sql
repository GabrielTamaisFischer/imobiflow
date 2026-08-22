-- Fase 49 - Base de integracao com gateways financeiros
-- Estrutura multiempresa para conectar o ImobiFlow a provedores como
-- Asaas, PJBank, Iugu, Mercado Pago, Stripe ou outro gateway compativel
-- com API REST e webhooks.

create table if not exists financial_gateway_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  provider text not null,
  display_name text not null,
  environment text not null default 'sandbox',
  status text not null default 'inactive',
  is_default boolean not null default false,
  supports_pix boolean not null default false,
  supports_boleto boolean not null default false,
  supports_card boolean not null default false,
  supports_transfer boolean not null default false,
  supports_split boolean not null default false,
  external_account_id text,
  webhook_url text,
  webhook_secret_hint text,
  credentials_status text not null default 'missing',
  last_healthcheck_at timestamptz,
  last_healthcheck_status text,
  last_error_message text,
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_gateway_connections_provider_check
    check (provider in ('asaas', 'pjbank', 'iugu', 'mercado_pago', 'stripe', 'manual', 'other')),
  constraint financial_gateway_connections_environment_check
    check (environment in ('sandbox', 'production')),
  constraint financial_gateway_connections_status_check
    check (status in ('inactive', 'active', 'error', 'pending_review', 'disabled')),
  constraint financial_gateway_connections_credentials_status_check
    check (credentials_status in ('missing', 'configured', 'invalid', 'rotating', 'expired'))
);

create unique index if not exists financial_gateway_connections_default_idx
  on financial_gateway_connections(company_id)
  where is_default = true;

create index if not exists financial_gateway_connections_company_status_idx
  on financial_gateway_connections(company_id, status, provider);

create trigger financial_gateway_connections_set_updated_at
before update on financial_gateway_connections
for each row
execute function set_updated_at();

alter table financial_gateway_connections enable row level security;

drop policy if exists financial_gateway_connections_select_policy on financial_gateway_connections;
create policy financial_gateway_connections_select_policy
on financial_gateway_connections
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_gateway_connections_insert_policy on financial_gateway_connections;
create policy financial_gateway_connections_insert_policy
on financial_gateway_connections
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_gateway_connections_update_policy on financial_gateway_connections;
create policy financial_gateway_connections_update_policy
on financial_gateway_connections
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists financial_gateway_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  gateway_connection_id uuid references financial_gateway_connections(id) on delete set null,
  provider text not null,
  operation text not null,
  direction text not null default 'outbound',
  entity_type text,
  entity_id uuid,
  idempotency_key text,
  external_id text,
  request_status text not null default 'pending',
  http_status integer,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_gateway_requests_direction_check
    check (direction in ('outbound', 'inbound')),
  constraint financial_gateway_requests_status_check
    check (request_status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  constraint financial_gateway_requests_operation_check
    check (
      operation in (
        'create_charge',
        'cancel_charge',
        'get_charge',
        'create_pix',
        'create_boleto',
        'create_transfer',
        'get_transfer',
        'webhook_receive',
        'healthcheck',
        'other'
      )
    )
);

create unique index if not exists financial_gateway_requests_idempotency_idx
  on financial_gateway_requests(company_id, provider, idempotency_key)
  where idempotency_key is not null;

create index if not exists financial_gateway_requests_company_status_idx
  on financial_gateway_requests(company_id, request_status, started_at desc);

create index if not exists financial_gateway_requests_company_entity_idx
  on financial_gateway_requests(company_id, entity_type, entity_id);

create trigger financial_gateway_requests_set_updated_at
before update on financial_gateway_requests
for each row
execute function set_updated_at();

alter table financial_gateway_requests enable row level security;

drop policy if exists financial_gateway_requests_select_policy on financial_gateway_requests;
create policy financial_gateway_requests_select_policy
on financial_gateway_requests
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_gateway_requests_insert_policy on financial_gateway_requests;
create policy financial_gateway_requests_insert_policy
on financial_gateway_requests
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_gateway_requests_update_policy on financial_gateway_requests;
create policy financial_gateway_requests_update_policy
on financial_gateway_requests
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');
