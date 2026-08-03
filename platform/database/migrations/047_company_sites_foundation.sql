create table if not exists public.company_sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  slug text not null,
  custom_domain text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'offline', 'archived')),
  brand_name text not null,
  headline text,
  description text,
  phone text,
  whatsapp text,
  email text,
  logo_url text,
  primary_color text not null default '#111827',
  settings_json jsonb not null default '{}'::jsonb,
  seo_json jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_sites_company_unique_idx
on public.company_sites (company_id);

create unique index if not exists company_sites_slug_unique_idx
on public.company_sites (lower(slug));

create unique index if not exists company_sites_custom_domain_unique_idx
on public.company_sites (lower(custom_domain))
where custom_domain is not null;

create index if not exists company_sites_status_idx
on public.company_sites (status, published_at desc);

create table if not exists public.site_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid not null references public.company_sites(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  name text not null,
  email text,
  phone text,
  message text,
  source_url text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists site_leads_company_created_idx
on public.site_leads (company_id, created_at desc);

create index if not exists site_leads_site_created_idx
on public.site_leads (site_id, created_at desc);

drop trigger if exists company_sites_set_updated_at on public.company_sites;
create trigger company_sites_set_updated_at
before update on public.company_sites
for each row execute function private.set_updated_at();

alter table public.company_sites enable row level security;
alter table public.site_leads enable row level security;

grant select, insert, update, delete on public.company_sites, public.site_leads to authenticated;

create policy "company_sites_select_own_company"
on public.company_sites for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "company_sites_insert_own_company"
on public.company_sites for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "company_sites_update_own_company"
on public.company_sites for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "company_sites_delete_own_company"
on public.company_sites for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "site_leads_select_own_company"
on public.site_leads for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "site_leads_insert_own_company"
on public.site_leads for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "site_leads_update_own_company"
on public.site_leads for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "site_leads_delete_own_company"
on public.site_leads for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());
