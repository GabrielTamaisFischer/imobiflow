-- Fase 48 - Motor de execucao da conciliacao financeira
-- Registra cada varredura de conciliacao por empresa, permitindo auditoria,
-- metricas operacionais e acompanhamento de divergencias ao longo do tempo.

create table if not exists financial_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  requested_by uuid references users(id) on delete set null,
  period_start date,
  period_end date,
  status text not null default 'running',
  source text not null default 'manual',
  total_charges integer not null default 0,
  total_payments integer not null default 0,
  total_webhooks integer not null default 0,
  total_items integer not null default 0,
  total_attention integer not null default 0,
  total_critical integer not null default 0,
  total_resolved integer not null default 0,
  total_ignored integer not null default 0,
  total_difference_amount_cents integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_reconciliation_runs_status_check
    check (status in ('running', 'completed', 'failed', 'cancelled')),
  constraint financial_reconciliation_runs_source_check
    check (source in ('manual', 'scheduled', 'webhook', 'system'))
);

alter table financial_reconciliation_items
add column if not exists reconciliation_run_id uuid
  references financial_reconciliation_runs(id) on delete set null;

create index if not exists financial_reconciliation_runs_company_status_idx
  on financial_reconciliation_runs(company_id, status, started_at desc);

create index if not exists financial_reconciliation_runs_company_period_idx
  on financial_reconciliation_runs(company_id, period_start, period_end);

create index if not exists financial_reconciliation_items_company_run_idx
  on financial_reconciliation_items(company_id, reconciliation_run_id);

create trigger financial_reconciliation_runs_set_updated_at
before update on financial_reconciliation_runs
for each row
execute function set_updated_at();

alter table financial_reconciliation_runs enable row level security;

drop policy if exists financial_reconciliation_runs_select_policy on financial_reconciliation_runs;
create policy financial_reconciliation_runs_select_policy
on financial_reconciliation_runs
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_reconciliation_runs_insert_policy on financial_reconciliation_runs;
create policy financial_reconciliation_runs_insert_policy
on financial_reconciliation_runs
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_reconciliation_runs_update_policy on financial_reconciliation_runs;
create policy financial_reconciliation_runs_update_policy
on financial_reconciliation_runs
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');
