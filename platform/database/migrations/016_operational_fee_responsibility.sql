alter table public.contracts
  drop constraint if exists contracts_operational_fee_payer_check;

alter table public.financial_charges
  drop constraint if exists financial_charges_fee_payer_check;

alter table public.contracts
  add constraint contracts_operational_fee_payer_check
  check (operational_fee_payer in ('company', 'tenant', 'owner'));

alter table public.financial_charges
  add constraint financial_charges_fee_payer_check
  check (fee_payer in ('company', 'tenant', 'owner'));

alter table public.contracts
  add column if not exists operational_fee_requires_acceptance boolean not null default false,
  add column if not exists operational_fee_acceptance_json jsonb not null default '{}'::jsonb;

alter table public.financial_charges
  add column if not exists fee_acceptance_required boolean not null default false,
  add column if not exists fee_acceptance_confirmed boolean not null default false,
  add column if not exists fee_acceptance_json jsonb not null default '{}'::jsonb;

create table if not exists public.operational_fee_acceptance_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete set null,
  charge_id uuid references public.financial_charges(id) on delete set null,
  fee_payer text not null check (fee_payer in ('company', 'tenant', 'owner')),
  fee_amount_cents integer not null default 0 check (fee_amount_cents >= 0),
  accepted boolean not null default false,
  acceptance_source text not null default 'manual_admin',
  reference_document text,
  ip_address text,
  user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists operational_fee_acceptance_logs_company_created_idx
on public.operational_fee_acceptance_logs (company_id, created_at desc);

create index if not exists operational_fee_acceptance_logs_contract_idx
on public.operational_fee_acceptance_logs (company_id, contract_id, created_at desc);

alter table public.operational_fee_acceptance_logs enable row level security;

grant select on public.operational_fee_acceptance_logs to authenticated;

create policy "operational_fee_acceptance_logs_select_own_company"
on public.operational_fee_acceptance_logs for select to authenticated
using (company_id = private.current_company_id());
