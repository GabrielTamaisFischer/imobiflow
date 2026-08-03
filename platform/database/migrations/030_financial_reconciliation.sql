-- Fase 47 - Conciliacao financeira avancada
-- Base persistente para divergencias entre cobrancas, pagamentos, comissoes,
-- repasses e webhooks financeiros.

create table if not exists financial_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  charge_id uuid references financial_charges(id) on delete set null,
  financial_entry_id uuid references financial_entries(id) on delete set null,
  payment_id uuid references financial_payments(id) on delete set null,
  commission_id uuid references commissions(id) on delete set null,
  owner_transfer_id uuid references owner_transfers(id) on delete set null,
  webhook_event_id uuid references financial_webhook_events(id) on delete set null,
  type text not null,
  severity text not null default 'attention',
  status text not null default 'open',
  title text not null,
  description text,
  gateway text,
  payment_method text,
  gross_amount_cents integer not null default 0,
  expected_amount_cents integer,
  actual_amount_cents integer,
  difference_amount_cents integer not null default 0,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null,
  resolution_note text,
  ignored_at timestamptz,
  ignored_by uuid references users(id) on delete set null,
  ignore_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_reconciliation_items_severity_check
    check (severity in ('ok', 'attention', 'critical')),
  constraint financial_reconciliation_items_status_check
    check (status in ('open', 'resolved', 'ignored', 'cancelled')),
  constraint financial_reconciliation_items_type_check
    check (
      type in (
        'paid_charge_without_payment',
        'payment_without_charge_settlement',
        'confirmed_payment_without_commission',
        'confirmed_payment_without_owner_transfer',
        'webhook_without_charge',
        'amount_mismatch',
        'gateway_status_mismatch',
        'manual_review'
      )
    )
);

create unique index if not exists financial_reconciliation_items_company_type_charge_idx
  on financial_reconciliation_items(company_id, type, charge_id)
  where charge_id is not null and status = 'open';

create unique index if not exists financial_reconciliation_items_company_type_webhook_idx
  on financial_reconciliation_items(company_id, type, webhook_event_id)
  where webhook_event_id is not null and status = 'open';

create index if not exists financial_reconciliation_items_company_status_idx
  on financial_reconciliation_items(company_id, status, severity, detected_at desc);

create index if not exists financial_reconciliation_items_company_charge_idx
  on financial_reconciliation_items(company_id, charge_id);

create index if not exists financial_reconciliation_items_company_payment_idx
  on financial_reconciliation_items(company_id, payment_id);

create index if not exists financial_reconciliation_items_company_webhook_idx
  on financial_reconciliation_items(company_id, webhook_event_id);

create trigger financial_reconciliation_items_set_updated_at
before update on financial_reconciliation_items
for each row
execute function set_updated_at();

alter table financial_reconciliation_items enable row level security;

drop policy if exists financial_reconciliation_items_select_policy on financial_reconciliation_items;
create policy financial_reconciliation_items_select_policy
on financial_reconciliation_items
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_reconciliation_items_insert_policy on financial_reconciliation_items;
create policy financial_reconciliation_items_insert_policy
on financial_reconciliation_items
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists financial_reconciliation_items_update_policy on financial_reconciliation_items;
create policy financial_reconciliation_items_update_policy
on financial_reconciliation_items
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');
