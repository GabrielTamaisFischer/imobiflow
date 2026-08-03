alter table public.property_owners
  add column if not exists client_type text default 'proprietario'
    check (client_type in ('comprador', 'construtor', 'investidor', 'locatario', 'proprietario')),
  add column if not exists residential_phone text,
  add column if not exists commercial_phone text;

alter table public.properties
  add column if not exists country text default 'Brasil',
  add column if not exists condominium_name text,
  add column if not exists nearby_highways jsonb not null default '[]'::jsonb,
  add column if not exists responsible_user_id uuid references public.users(id) on delete set null,
  add column if not exists capture_json jsonb not null default '{}'::jsonb,
  add column if not exists primary_details_json jsonb not null default '{}'::jsonb,
  add column if not exists measurements_json jsonb not null default '{}'::jsonb,
  add column if not exists commercial_terms_json jsonb not null default '{}'::jsonb,
  add column if not exists amenity_groups_json jsonb not null default '{}'::jsonb,
  add column if not exists videos_json jsonb not null default '[]'::jsonb,
  add column if not exists publication_settings_json jsonb not null default '{}'::jsonb,
  add column if not exists description_template_key text;

create index if not exists properties_company_condominium_idx
on public.properties (company_id, condominium_name)
where condominium_name is not null;
