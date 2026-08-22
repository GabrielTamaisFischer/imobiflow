create table if not exists public.property_owner_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references public.property_owners(id) on delete cascade,
  ownership_percentage numeric(5,2),
  is_main_owner boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, property_id, owner_id)
);

create index if not exists idx_property_owner_links_company on public.property_owner_links(company_id);
create index if not exists idx_property_owner_links_property on public.property_owner_links(property_id);
create index if not exists idx_property_owner_links_owner on public.property_owner_links(owner_id);

create table if not exists public.property_price_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  price_type text not null check (price_type in ('sale', 'rent', 'season', 'condominium', 'iptu')),
  old_value_cents integer,
  new_value_cents integer,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_property_price_history_property on public.property_price_history(company_id, property_id, created_at desc);

create table if not exists public.property_audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_property_audit_logs_property on public.property_audit_logs(company_id, property_id, created_at desc);

create table if not exists public.property_feature_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  feature_type text not null check (feature_type in ('infraestrutura', 'lazer', 'piso', 'servicos', 'estrutura', 'culturas')),
  feature_name text not null,
  is_public boolean not null default true,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_property_feature_options_unique
  on public.property_feature_options(company_id, feature_type, lower(feature_name));

create index if not exists idx_property_feature_options_company
  on public.property_feature_options(company_id, feature_type, status);

alter table public.property_owner_links enable row level security;
alter table public.property_price_history enable row level security;
alter table public.property_audit_logs enable row level security;
alter table public.property_feature_options enable row level security;

drop policy if exists property_owner_links_company_access on public.property_owner_links;
create policy property_owner_links_company_access
  on public.property_owner_links
  for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists property_price_history_company_access on public.property_price_history;
create policy property_price_history_company_access
  on public.property_price_history
  for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists property_audit_logs_company_access on public.property_audit_logs;
create policy property_audit_logs_company_access
  on public.property_audit_logs
  for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists property_feature_options_company_access on public.property_feature_options;
create policy property_feature_options_company_access
  on public.property_feature_options
  for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
