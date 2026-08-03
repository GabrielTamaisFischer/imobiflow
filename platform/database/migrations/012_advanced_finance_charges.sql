alter table public.contracts
  add column if not exists commission_type text not null default 'percentage'
    check (commission_type in ('percentage', 'fixed')),
  add column if not exists commission_rate numeric(8, 4) not null default 10,
  add column if not exists commission_fixed_cents integer not null default 0,
  add column if not exists operational_fee_cents integer not null default 0,
  add column if not exists operational_fee_payer text not null default 'company'
    check (operational_fee_payer in ('company', 'tenant')),
  add column if not exists billing_day integer
    check (billing_day is null or (billing_day >= 1 and billing_day <= 31)),
  add column if not exists transfer_day_offset integer not null default 1
    check (transfer_day_offset >= 0 and transfer_day_offset <= 30),
  add column if not exists auto_generate_charges boolean not null default false,
  add column if not exists preferred_payment_method text not null default 'pix'
    check (preferred_payment_method in ('pix', 'boleto', 'hybrid', 'manual')),
  add column if not exists financial_rules jsonb not null default '{}'::jsonb;

create table if not exists public.payment_gateway_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  name text not null,
  status text not null default 'inactive'
    check (status in ('active', 'inactive', 'testing', 'blocked', 'archived')),
  credentials_ref text,
  webhook_secret_ref text,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_gateway_accounts_company_status_idx
on public.payment_gateway_accounts (company_id, status, provider);

create table if not exists public.financial_charges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  owner_id uuid references public.property_owners(id) on delete set null,
  tenant_party_id uuid references public.contract_parties(id) on delete set null,
  entry_id uuid references public.financial_entries(id) on delete set null,
  gateway_account_id uuid references public.payment_gateway_accounts(id) on delete set null,
  gateway_charge_id text,
  payment_method text not null default 'pix'
    check (payment_method in ('pix', 'boleto', 'hybrid', 'credit_card', 'bank_transfer', 'manual')),
  gross_amount_cents integer not null check (gross_amount_cents >= 0),
  base_rent_amount_cents integer not null default 0 check (base_rent_amount_cents >= 0),
  fee_amount_cents integer not null default 0 check (fee_amount_cents >= 0),
  fee_payer text not null default 'company'
    check (fee_payer in ('company', 'tenant')),
  commission_amount_cents integer not null default 0 check (commission_amount_cents >= 0),
  net_owner_amount_cents integer not null default 0 check (net_owner_amount_cents >= 0),
  due_date date not null,
  paid_at timestamptz,
  status text not null default 'waiting_payment'
    check (
      status in (
        'pending',
        'waiting_payment',
        'processing',
        'waiting_compensation',
        'paid',
        'overdue',
        'cancelled',
        'refunded',
        'failed',
        'disputed',
        'transfer_pending',
        'transferred'
      )
    ),
  pix_qr_code text,
  pix_copy_paste text,
  boleto_barcode text,
  boleto_digitable_line text,
  payment_url text,
  boleto_pdf_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, gateway_charge_id)
);

create index if not exists financial_charges_company_status_idx
on public.financial_charges (company_id, status, due_date, created_at desc);

create index if not exists financial_charges_company_contract_idx
on public.financial_charges (company_id, contract_id, due_date desc);

create table if not exists public.financial_webhook_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  charge_id uuid references public.financial_charges(id) on delete set null,
  provider text not null,
  event_type text not null,
  gateway_event_id text,
  gateway_charge_id text,
  status_before text,
  status_after text,
  gross_amount_cents integer,
  net_amount_cents integer,
  raw_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (provider, gateway_event_id)
);

create index if not exists financial_webhook_events_company_created_idx
on public.financial_webhook_events (company_id, created_at desc)
where company_id is not null;

create table if not exists public.financial_audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  charge_id uuid references public.financial_charges(id) on delete set null,
  entry_id uuid references public.financial_entries(id) on delete set null,
  contract_id uuid references public.contracts(id) on delete set null,
  owner_id uuid references public.property_owners(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  event_type text not null,
  gateway_event_id text,
  gateway_charge_id text,
  gross_amount_cents integer,
  net_amount_cents integer,
  commission_amount_cents integer,
  fee_amount_cents integer,
  status_before text,
  status_after text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists financial_audit_logs_company_created_idx
on public.financial_audit_logs (company_id, created_at desc);

alter table public.payment_gateway_accounts enable row level security;
alter table public.financial_charges enable row level security;
alter table public.financial_webhook_events enable row level security;
alter table public.financial_audit_logs enable row level security;

grant select, insert, update on public.payment_gateway_accounts to authenticated;
grant select, insert, update on public.financial_charges to authenticated;
grant select on public.financial_webhook_events to authenticated;
grant select on public.financial_audit_logs to authenticated;

create policy "payment_gateway_accounts_select_own_company"
on public.payment_gateway_accounts for select to authenticated
using (company_id = private.current_company_id());

create policy "payment_gateway_accounts_insert_own_company"
on public.payment_gateway_accounts for insert to authenticated
with check (company_id = private.current_company_id());

create policy "payment_gateway_accounts_update_own_company"
on public.payment_gateway_accounts for update to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

create policy "financial_charges_select_own_company"
on public.financial_charges for select to authenticated
using (company_id = private.current_company_id());

create policy "financial_charges_insert_own_company"
on public.financial_charges for insert to authenticated
with check (company_id = private.current_company_id());

create policy "financial_charges_update_own_company"
on public.financial_charges for update to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

create policy "financial_webhook_events_select_own_company"
on public.financial_webhook_events for select to authenticated
using (company_id = private.current_company_id());

create policy "financial_audit_logs_select_own_company"
on public.financial_audit_logs for select to authenticated
using (company_id = private.current_company_id());

drop trigger if exists payment_gateway_accounts_set_updated_at on public.payment_gateway_accounts;
create trigger payment_gateway_accounts_set_updated_at
before update on public.payment_gateway_accounts
for each row execute function private.set_updated_at();

drop trigger if exists financial_charges_set_updated_at on public.financial_charges;
create trigger financial_charges_set_updated_at
before update on public.financial_charges
for each row execute function private.set_updated_at();
