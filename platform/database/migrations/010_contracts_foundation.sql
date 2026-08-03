create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  contract_type text not null default 'rental'
    check (contract_type in ('rental', 'sale', 'management', 'service', 'other')),
  body_template text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contract_templates_company_status_idx
on public.contract_templates (company_id, status, created_at desc);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  template_id uuid references public.contract_templates(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  contract_number text,
  title text not null,
  contract_type text not null default 'rental'
    check (contract_type in ('rental', 'sale', 'management', 'service', 'other')),
  status text not null default 'draft'
    check (status in ('draft', 'generated', 'sent', 'waiting_signature', 'signed', 'active', 'cancelled', 'expired', 'archived')),
  starts_at date,
  ends_at date,
  total_amount_cents integer,
  monthly_amount_cents integer,
  deposit_cents integer,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, contract_number)
);

create index if not exists contracts_company_status_idx
on public.contracts (company_id, status, created_at desc);

create index if not exists contracts_company_property_idx
on public.contracts (company_id, property_id, created_at desc)
where property_id is not null;

create index if not exists contracts_company_lead_idx
on public.contracts (company_id, lead_id, created_at desc)
where lead_id is not null;

create table if not exists public.contract_parties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  party_type text not null default 'tenant'
    check (party_type in ('owner', 'tenant', 'buyer', 'seller', 'broker', 'witness', 'company', 'other')),
  name text not null,
  document text,
  email text,
  phone text,
  signature_required boolean not null default true,
  signature_status text not null default 'pending'
    check (signature_status in ('pending', 'signed', 'not_required', 'cancelled')),
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contract_parties_company_contract_idx
on public.contract_parties (company_id, contract_id, party_type);

create table if not exists public.contract_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  document_type text not null default 'contract'
    check (document_type in ('contract', 'attachment', 'identity', 'proof', 'other')),
  file_name text,
  file_url text,
  storage_bucket text,
  storage_path text,
  mime_type text,
  file_size integer,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contract_documents_company_contract_idx
on public.contract_documents (company_id, contract_id, created_at desc);

alter table public.contract_templates enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_parties enable row level security;
alter table public.contract_documents enable row level security;

grant select, insert, update on public.contract_templates to authenticated;
grant select, insert, update on public.contracts to authenticated;
grant select, insert, update on public.contract_parties to authenticated;
grant select, insert, update on public.contract_documents to authenticated;

create policy "contract_templates_select_own_company_or_global"
on public.contract_templates for select
to authenticated
using (company_id is null or company_id = private.current_company_id());

create policy "contract_templates_insert_own_company"
on public.contract_templates for insert
to authenticated
with check (company_id = private.current_company_id());

create policy "contract_templates_update_own_company"
on public.contract_templates for update
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

create policy "contracts_select_own_company"
on public.contracts for select
to authenticated
using (company_id = private.current_company_id());

create policy "contracts_insert_own_company"
on public.contracts for insert
to authenticated
with check (company_id = private.current_company_id());

create policy "contracts_update_own_company"
on public.contracts for update
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

create policy "contract_parties_select_own_company"
on public.contract_parties for select
to authenticated
using (company_id = private.current_company_id());

create policy "contract_parties_insert_own_company"
on public.contract_parties for insert
to authenticated
with check (company_id = private.current_company_id());

create policy "contract_parties_update_own_company"
on public.contract_parties for update
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

create policy "contract_documents_select_own_company"
on public.contract_documents for select
to authenticated
using (company_id = private.current_company_id());

create policy "contract_documents_insert_own_company"
on public.contract_documents for insert
to authenticated
with check (company_id = private.current_company_id());

create policy "contract_documents_update_own_company"
on public.contract_documents for update
to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop trigger if exists contract_templates_set_updated_at on public.contract_templates;
create trigger contract_templates_set_updated_at
before update on public.contract_templates
for each row execute function private.set_updated_at();

drop trigger if exists contracts_set_updated_at on public.contracts;
create trigger contracts_set_updated_at
before update on public.contracts
for each row execute function private.set_updated_at();

drop trigger if exists contract_parties_set_updated_at on public.contract_parties;
create trigger contract_parties_set_updated_at
before update on public.contract_parties
for each row execute function private.set_updated_at();
