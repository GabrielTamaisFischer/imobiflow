insert into public.permissions (key, description)
values
  ('owners.manage', 'Criar e gerenciar proprietários'),
  ('properties.publish', 'Publicar imóveis e alterar disponibilidade')
on conflict (key) do update
set description = excluded.description;

create table if not exists public.property_owners (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  owner_type text not null default 'individual'
    check (owner_type in ('individual', 'company')),
  name text not null,
  document text,
  email text,
  phone text,
  whatsapp text,
  address_json jsonb not null default '{}'::jsonb,
  notes text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_owners_company_status_idx
on public.property_owners (company_id, status, created_at desc);

create index if not exists property_owners_company_document_idx
on public.property_owners (company_id, document);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_id uuid references public.property_owners(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  code text,
  title text not null,
  description text,
  property_type text not null default 'apartment'
    check (property_type in ('apartment', 'house', 'commercial', 'land', 'rural', 'other')),
  operation text not null default 'sale'
    check (operation in ('sale', 'rent', 'both')),
  status text not null default 'draft'
    check (status in ('draft', 'available', 'reserved', 'sold', 'rented', 'inactive', 'archived')),
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  zip_code text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  bedrooms integer,
  bathrooms integer,
  suites integer,
  parking_spaces integer,
  private_area numeric(12, 2),
  total_area numeric(12, 2),
  sale_price_cents integer,
  rent_price_cents integer,
  condominium_fee_cents integer,
  iptu_cents integer,
  features_json jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists properties_company_code_unique_idx
on public.properties (company_id, lower(code))
where code is not null;

create index if not exists properties_company_status_idx
on public.properties (company_id, status, created_at desc);

create index if not exists properties_company_owner_idx
on public.properties (company_id, owner_id);

create index if not exists properties_company_location_idx
on public.properties (company_id, city, neighborhood);

create table if not exists public.property_media (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  media_type text not null default 'photo'
    check (media_type in ('photo', 'video', 'tour', 'floor_plan')),
  url text not null,
  caption text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists property_media_company_property_idx
on public.property_media (company_id, property_id, position);

create table if not exists public.property_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  document_type text not null,
  file_url text not null,
  title text not null,
  visibility text not null default 'internal'
    check (visibility in ('internal', 'owner', 'tenant')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists property_documents_company_property_idx
on public.property_documents (company_id, property_id, created_at desc);

drop trigger if exists property_owners_set_updated_at on public.property_owners;
create trigger property_owners_set_updated_at
before update on public.property_owners
for each row execute function private.set_updated_at();

drop trigger if exists properties_set_updated_at on public.properties;
create trigger properties_set_updated_at
before update on public.properties
for each row execute function private.set_updated_at();

alter table public.property_owners enable row level security;
alter table public.properties enable row level security;
alter table public.property_media enable row level security;
alter table public.property_documents enable row level security;

grant select, insert, update, delete on
  public.property_owners,
  public.properties,
  public.property_media,
  public.property_documents
to authenticated;

create policy "property_owners_select_own_company"
on public.property_owners for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "property_owners_insert_own_company"
on public.property_owners for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "property_owners_update_own_company"
on public.property_owners for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "property_owners_delete_own_company"
on public.property_owners for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "properties_select_own_company"
on public.properties for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "properties_insert_own_company"
on public.properties for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "properties_update_own_company"
on public.properties for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "properties_delete_own_company"
on public.properties for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "property_media_select_own_company"
on public.property_media for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "property_media_insert_own_company"
on public.property_media for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "property_media_update_own_company"
on public.property_media for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "property_media_delete_own_company"
on public.property_media for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "property_documents_select_own_company"
on public.property_documents for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "property_documents_insert_own_company"
on public.property_documents for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "property_documents_update_own_company"
on public.property_documents for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "property_documents_delete_own_company"
on public.property_documents for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());
