create table if not exists public.portal_property_publications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  provider text not null
    check (provider in ('zap_imoveis', 'olx', 'viva_real')),
  status text not null default 'queued'
    check (status in ('draft', 'queued', 'published', 'rejected', 'paused', 'archived')),
  external_listing_id text,
  listing_url text,
  last_synced_at timestamptz,
  last_error text,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists portal_property_publications_company_property_provider_idx
on public.portal_property_publications (company_id, property_id, provider);

create index if not exists portal_property_publications_company_provider_status_idx
on public.portal_property_publications (company_id, provider, status, updated_at desc);

drop trigger if exists portal_property_publications_set_updated_at on public.portal_property_publications;
create trigger portal_property_publications_set_updated_at
before update on public.portal_property_publications
for each row execute function private.set_updated_at();

alter table public.portal_property_publications enable row level security;

grant select, insert, update, delete on public.portal_property_publications to authenticated;

create policy "portal_property_publications_select_own_company"
on public.portal_property_publications for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "portal_property_publications_insert_own_company"
on public.portal_property_publications for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "portal_property_publications_update_own_company"
on public.portal_property_publications for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "portal_property_publications_delete_own_company"
on public.portal_property_publications for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create table if not exists public.portal_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  publication_id uuid references public.portal_property_publications(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  provider text not null
    check (provider in ('zap_imoveis', 'olx', 'viva_real')),
  external_lead_id text,
  external_listing_id text,
  name text not null,
  email text,
  phone text,
  message text,
  raw_payload jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create unique index if not exists portal_leads_provider_external_lead_idx
on public.portal_leads (company_id, provider, external_lead_id)
where external_lead_id is not null;

create index if not exists portal_leads_company_provider_idx
on public.portal_leads (company_id, provider, created_at desc);

alter table public.portal_leads enable row level security;

grant select, insert on public.portal_leads to authenticated;

create policy "portal_leads_select_own_company"
on public.portal_leads for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "portal_leads_insert_own_company"
on public.portal_leads for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());
