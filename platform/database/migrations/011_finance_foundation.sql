create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  account_type text not null default 'bank'
    check (account_type in ('cash', 'bank', 'digital_wallet', 'escrow', 'other')),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  opening_balance_cents integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_accounts_company_status_idx
on public.financial_accounts (company_id, status, created_at desc);

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  owner_id uuid references public.property_owners(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  title text not null,
  description text,
  entry_type text not null default 'income'
    check (entry_type in ('income', 'expense')),
  category text,
  status text not null default 'open'
    check (status in ('draft', 'open', 'paid', 'overdue', 'cancelled', 'archived')),
  amount_cents integer not null check (amount_cents >= 0),
  due_date date,
  paid_at timestamptz,
  competence_date date,
  payment_method text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_entries_company_status_idx
on public.financial_entries (company_id, status, due_date nulls last, created_at desc);

create index if not exists financial_entries_company_contract_idx
on public.financial_entries (company_id, contract_id, created_at desc)
where contract_id is not null;

create table if not exists public.financial_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entry_id uuid not null references public.financial_entries(id) on delete cascade,
  account_id uuid references public.financial_accounts(id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  payment_method text,
  paid_at timestamptz not null default now(),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists financial_payments_company_entry_idx
on public.financial_payments (company_id, entry_id, paid_at desc);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  base_amount_cents integer not null default 0,
  commission_rate numeric(8, 4),
  amount_cents integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'paid', 'cancelled')),
  due_date date,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commissions_company_status_idx
on public.commissions (company_id, status, due_date nulls last, created_at desc);

create table if not exists public.owner_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete set null,
  owner_id uuid references public.property_owners(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  gross_amount_cents integer not null default 0,
  deductions_cents integer not null default 0,
  net_amount_cents integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'paid', 'cancelled')),
  due_date date,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists owner_transfers_company_status_idx
on public.owner_transfers (company_id, status, due_date nulls last, created_at desc);

alter table public.financial_accounts enable row level security;
alter table public.financial_entries enable row level security;
alter table public.financial_payments enable row level security;
alter table public.commissions enable row level security;
alter table public.owner_transfers enable row level security;

grant select, insert, update on public.financial_accounts to authenticated;
grant select, insert, update on public.financial_entries to authenticated;
grant select, insert, update on public.financial_payments to authenticated;
grant select, insert, update on public.commissions to authenticated;
grant select, insert, update on public.owner_transfers to authenticated;

create policy "financial_accounts_select_own_company"
on public.financial_accounts for select to authenticated
using (company_id = private.current_company_id());

create policy "financial_accounts_insert_own_company"
on public.financial_accounts for insert to authenticated
with check (company_id = private.current_company_id());

create policy "financial_accounts_update_own_company"
on public.financial_accounts for update to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

create policy "financial_entries_select_own_company"
on public.financial_entries for select to authenticated
using (company_id = private.current_company_id());

create policy "financial_entries_insert_own_company"
on public.financial_entries for insert to authenticated
with check (company_id = private.current_company_id());

create policy "financial_entries_update_own_company"
on public.financial_entries for update to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

create policy "financial_payments_select_own_company"
on public.financial_payments for select to authenticated
using (company_id = private.current_company_id());

create policy "financial_payments_insert_own_company"
on public.financial_payments for insert to authenticated
with check (company_id = private.current_company_id());

create policy "commissions_select_own_company"
on public.commissions for select to authenticated
using (company_id = private.current_company_id());

create policy "commissions_insert_own_company"
on public.commissions for insert to authenticated
with check (company_id = private.current_company_id());

create policy "commissions_update_own_company"
on public.commissions for update to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

create policy "owner_transfers_select_own_company"
on public.owner_transfers for select to authenticated
using (company_id = private.current_company_id());

create policy "owner_transfers_insert_own_company"
on public.owner_transfers for insert to authenticated
with check (company_id = private.current_company_id());

create policy "owner_transfers_update_own_company"
on public.owner_transfers for update to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop trigger if exists financial_accounts_set_updated_at on public.financial_accounts;
create trigger financial_accounts_set_updated_at
before update on public.financial_accounts
for each row execute function private.set_updated_at();

drop trigger if exists financial_entries_set_updated_at on public.financial_entries;
create trigger financial_entries_set_updated_at
before update on public.financial_entries
for each row execute function private.set_updated_at();

drop trigger if exists commissions_set_updated_at on public.commissions;
create trigger commissions_set_updated_at
before update on public.commissions
for each row execute function private.set_updated_at();

drop trigger if exists owner_transfers_set_updated_at on public.owner_transfers;
create trigger owner_transfers_set_updated_at
before update on public.owner_transfers
for each row execute function private.set_updated_at();
