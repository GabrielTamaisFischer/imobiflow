alter table public.property_owners
  add column if not exists portal_token uuid not null default gen_random_uuid(),
  add column if not exists portal_enabled boolean not null default true,
  add column if not exists portal_last_access_at timestamptz;

alter table public.contract_parties
  add column if not exists portal_token uuid not null default gen_random_uuid(),
  add column if not exists portal_enabled boolean not null default true,
  add column if not exists portal_last_access_at timestamptz;

create unique index if not exists property_owners_portal_token_unique_idx
on public.property_owners (portal_token);

create unique index if not exists contract_parties_portal_token_unique_idx
on public.contract_parties (portal_token);

create table if not exists public.portal_access_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  portal_type text not null check (portal_type in ('owner', 'tenant')),
  owner_id uuid references public.property_owners(id) on delete set null,
  contract_party_id uuid references public.contract_parties(id) on delete set null,
  event_type text not null default 'view',
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists portal_access_logs_company_created_idx
on public.portal_access_logs (company_id, created_at desc);

alter table public.portal_access_logs enable row level security;

grant select on public.portal_access_logs to authenticated;

create policy "portal_access_logs_select_own_company"
on public.portal_access_logs for select to authenticated
using (company_id = private.current_company_id());
