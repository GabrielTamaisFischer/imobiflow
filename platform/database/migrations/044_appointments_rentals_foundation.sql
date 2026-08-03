insert into public.permissions (key, description)
values
  ('appointments.view', 'Visualizar agenda e visitas'),
  ('appointments.manage', 'Criar e gerenciar agenda e visitas'),
  ('rentals.view', 'Visualizar locações'),
  ('rentals.manage', 'Criar e gerenciar locações')
on conflict (key) do update
set description = excluded.description;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  assigned_to uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  appointment_type text not null default 'visit'
    check (appointment_type in ('visit', 'return', 'meeting', 'inspection', 'signature', 'follow_up')),
  title text not null,
  description text,
  location_text text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  reminder_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show')),
  result_notes text,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_company_status_starts_idx
on public.appointments (company_id, status, starts_at);

create index if not exists appointments_company_lead_idx
on public.appointments (company_id, lead_id, starts_at desc)
where lead_id is not null;

create index if not exists appointments_company_property_idx
on public.appointments (company_id, property_id, starts_at desc)
where property_id is not null;

create table if not exists public.rental_agreements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete restrict,
  owner_id uuid references public.property_owners(id) on delete set null,
  tenant_party_id uuid references public.contract_parties(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  status text not null default 'active'
    check (status in ('draft', 'active', 'pending_signature', 'ending', 'ended', 'cancelled', 'overdue')),
  starts_at date not null,
  ends_at date,
  monthly_amount_cents integer not null check (monthly_amount_cents >= 0),
  condominium_fee_cents integer not null default 0 check (condominium_fee_cents >= 0),
  iptu_cents integer not null default 0 check (iptu_cents >= 0),
  insurance_cents integer not null default 0 check (insurance_cents >= 0),
  due_day integer not null check (due_day between 1 and 31),
  adjustment_index text not null default 'ipca',
  guarantee_type text,
  commission_type text not null default 'percentage'
    check (commission_type in ('percentage', 'fixed')),
  commission_rate numeric(8, 4) not null default 10,
  commission_fixed_cents integer not null default 0 check (commission_fixed_cents >= 0),
  operational_fee_cents integer not null default 0 check (operational_fee_cents >= 0),
  operational_fee_payer text not null default 'company'
    check (operational_fee_payer in ('company', 'tenant', 'owner')),
  preferred_payment_method text not null default 'pix'
    check (preferred_payment_method in ('pix', 'boleto', 'hybrid', 'manual')),
  last_charge_due_date date,
  next_charge_due_date date,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rental_agreements_company_contract_uidx
on public.rental_agreements (company_id, contract_id);

create index if not exists rental_agreements_company_status_idx
on public.rental_agreements (company_id, status, starts_at desc);

create index if not exists rental_agreements_company_property_idx
on public.rental_agreements (company_id, property_id, status);

create table if not exists public.rental_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rental_id uuid not null references public.rental_agreements(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rental_events_company_rental_idx
on public.rental_events (company_id, rental_id, created_at desc);

alter table public.appointments enable row level security;
alter table public.rental_agreements enable row level security;
alter table public.rental_events enable row level security;

grant select, insert, update on public.appointments to authenticated;
grant select, insert, update on public.rental_agreements to authenticated;
grant select, insert on public.rental_events to authenticated;

create policy "appointments_select_own_company"
on public.appointments for select to authenticated
using (company_id = private.current_company_id());

create policy "appointments_insert_own_company"
on public.appointments for insert to authenticated
with check (company_id = private.current_company_id());

create policy "appointments_update_own_company"
on public.appointments for update to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

create policy "rental_agreements_select_own_company"
on public.rental_agreements for select to authenticated
using (company_id = private.current_company_id());

create policy "rental_agreements_insert_own_company"
on public.rental_agreements for insert to authenticated
with check (company_id = private.current_company_id());

create policy "rental_agreements_update_own_company"
on public.rental_agreements for update to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

create policy "rental_events_select_own_company"
on public.rental_events for select to authenticated
using (company_id = private.current_company_id());

create policy "rental_events_insert_own_company"
on public.rental_events for insert to authenticated
with check (company_id = private.current_company_id());

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function private.set_updated_at();
drop trigger if exists rental_agreements_set_updated_at on public.rental_agreements;
create trigger rental_agreements_set_updated_at
before update on public.rental_agreements
for each row execute function private.set_updated_at();
