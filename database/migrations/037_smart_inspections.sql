-- Fase 55 - Vistoria inteligente completa
-- Base multiempresa para vistorias de entrada, saida, comparacao,
-- fotos, videos, assinaturas, PDF, IA e operacao offline.

create table if not exists inspection_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  inspection_type text not null default 'entry',
  status text not null default 'draft',
  rooms_schema jsonb not null default '[]'::jsonb,
  checklist_schema jsonb not null default '[]'::jsonb,
  created_by uuid references users(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_templates_type_check
    check (inspection_type in ('entry', 'exit', 'periodic', 'maintenance', 'delivery', 'other')),
  constraint inspection_templates_status_check
    check (status in ('draft', 'active', 'archived'))
);

create unique index if not exists inspection_templates_company_name_type_idx
  on inspection_templates(company_id, name, inspection_type);

create index if not exists inspection_templates_company_status_idx
  on inspection_templates(company_id, inspection_type, status);

create trigger inspection_templates_set_updated_at
before update on inspection_templates
for each row
execute function set_updated_at();

alter table inspection_templates enable row level security;

drop policy if exists inspection_templates_select_policy on inspection_templates;
create policy inspection_templates_select_policy
on inspection_templates
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists inspection_templates_insert_policy on inspection_templates;
create policy inspection_templates_insert_policy
on inspection_templates
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists inspection_templates_update_policy on inspection_templates;
create policy inspection_templates_update_policy
on inspection_templates
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists property_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  template_id uuid references inspection_templates(id) on delete set null,
  property_id uuid,
  rental_contract_id uuid,
  owner_id uuid,
  tenant_id uuid,
  assigned_to uuid references users(id) on delete set null,
  inspection_type text not null,
  status text not null default 'draft',
  title text not null,
  reference_code text,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  approved_at timestamptz,
  cancelled_at timestamptz,
  entry_inspection_id uuid references property_inspections(id) on delete set null,
  exit_inspection_id uuid references property_inspections(id) on delete set null,
  comparison_status text,
  ai_summary text,
  ai_risk_level text,
  pdf_url text,
  public_share_url text,
  offline_session_id text,
  last_synced_at timestamptz,
  created_by uuid references users(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_inspections_type_check
    check (inspection_type in ('entry', 'exit', 'periodic', 'maintenance', 'delivery', 'comparison', 'other')),
  constraint property_inspections_status_check
    check (
      status in (
        'draft',
        'scheduled',
        'in_progress',
        'pending_sync',
        'pending_review',
        'completed',
        'approved',
        'sent_for_signature',
        'signed',
        'cancelled',
        'archived'
      )
    ),
  constraint property_inspections_comparison_status_check
    check (
      comparison_status is null
      or comparison_status in ('not_started', 'in_progress', 'completed', 'requires_review')
    ),
  constraint property_inspections_ai_risk_level_check
    check (
      ai_risk_level is null
      or ai_risk_level in ('low', 'medium', 'high', 'critical')
    )
);

create unique index if not exists property_inspections_company_reference_idx
  on property_inspections(company_id, reference_code)
  where reference_code is not null;

create index if not exists property_inspections_company_status_idx
  on property_inspections(company_id, inspection_type, status, created_at desc);

create index if not exists property_inspections_property_idx
  on property_inspections(company_id, property_id, created_at desc);

create index if not exists property_inspections_contract_idx
  on property_inspections(company_id, rental_contract_id, created_at desc);

create trigger property_inspections_set_updated_at
before update on property_inspections
for each row
execute function set_updated_at();

alter table property_inspections enable row level security;

drop policy if exists property_inspections_select_policy on property_inspections;
create policy property_inspections_select_policy
on property_inspections
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists property_inspections_insert_policy on property_inspections;
create policy property_inspections_insert_policy
on property_inspections
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists property_inspections_update_policy on property_inspections;
create policy property_inspections_update_policy
on property_inspections
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists inspection_rooms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  inspection_id uuid not null references property_inspections(id) on delete cascade,
  name text not null,
  room_type text not null default 'other',
  sort_order integer not null default 0,
  condition_status text not null default 'pending',
  notes text,
  ai_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_rooms_condition_status_check
    check (condition_status in ('pending', 'good', 'regular', 'damaged', 'requires_review', 'not_applicable'))
);

create index if not exists inspection_rooms_inspection_idx
  on inspection_rooms(inspection_id, sort_order);

create index if not exists inspection_rooms_company_status_idx
  on inspection_rooms(company_id, condition_status);

create trigger inspection_rooms_set_updated_at
before update on inspection_rooms
for each row
execute function set_updated_at();

alter table inspection_rooms enable row level security;

drop policy if exists inspection_rooms_select_policy on inspection_rooms;
create policy inspection_rooms_select_policy
on inspection_rooms
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists inspection_rooms_insert_policy on inspection_rooms;
create policy inspection_rooms_insert_policy
on inspection_rooms
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists inspection_rooms_update_policy on inspection_rooms;
create policy inspection_rooms_update_policy
on inspection_rooms
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists inspection_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  inspection_id uuid not null references property_inspections(id) on delete cascade,
  room_id uuid references inspection_rooms(id) on delete cascade,
  label text not null,
  item_type text not null default 'general',
  condition_status text not null default 'pending',
  previous_item_id uuid references inspection_items(id) on delete set null,
  comparison_result text,
  notes text,
  repair_estimate_cents integer,
  tenant_responsibility boolean,
  owner_responsibility boolean,
  ai_notes text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_items_condition_status_check
    check (condition_status in ('pending', 'good', 'regular', 'damaged', 'missing', 'replaced', 'not_applicable')),
  constraint inspection_items_comparison_result_check
    check (
      comparison_result is null
      or comparison_result in ('unchanged', 'improved', 'worsened', 'new_damage', 'missing', 'requires_review')
    )
);

create index if not exists inspection_items_inspection_idx
  on inspection_items(inspection_id, sort_order);

create index if not exists inspection_items_room_idx
  on inspection_items(room_id, sort_order);

create index if not exists inspection_items_company_status_idx
  on inspection_items(company_id, condition_status, comparison_result);

create trigger inspection_items_set_updated_at
before update on inspection_items
for each row
execute function set_updated_at();

alter table inspection_items enable row level security;

drop policy if exists inspection_items_select_policy on inspection_items;
create policy inspection_items_select_policy
on inspection_items
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists inspection_items_insert_policy on inspection_items;
create policy inspection_items_insert_policy
on inspection_items
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists inspection_items_update_policy on inspection_items;
create policy inspection_items_update_policy
on inspection_items
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists inspection_media (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  inspection_id uuid not null references property_inspections(id) on delete cascade,
  room_id uuid references inspection_rooms(id) on delete cascade,
  item_id uuid references inspection_items(id) on delete cascade,
  media_type text not null default 'photo',
  file_url text not null,
  thumbnail_url text,
  caption text,
  captured_at timestamptz,
  uploaded_at timestamptz,
  offline_local_id text,
  checksum text,
  ai_tags text[] not null default '{}'::text[],
  ai_description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_media_type_check
    check (media_type in ('photo', 'video', 'audio', 'document', 'other'))
);

create index if not exists inspection_media_inspection_idx
  on inspection_media(inspection_id, created_at desc);

create index if not exists inspection_media_room_idx
  on inspection_media(room_id, created_at desc);

create index if not exists inspection_media_item_idx
  on inspection_media(item_id, created_at desc);

create trigger inspection_media_set_updated_at
before update on inspection_media
for each row
execute function set_updated_at();

alter table inspection_media enable row level security;

drop policy if exists inspection_media_select_policy on inspection_media;
create policy inspection_media_select_policy
on inspection_media
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists inspection_media_insert_policy on inspection_media;
create policy inspection_media_insert_policy
on inspection_media
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists inspection_media_update_policy on inspection_media;
create policy inspection_media_update_policy
on inspection_media
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists inspection_signatures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  inspection_id uuid not null references property_inspections(id) on delete cascade,
  signer_type text not null,
  name text not null,
  email text,
  phone text,
  document_number text,
  status text not null default 'pending',
  signature_url text,
  signed_at timestamptz,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_signatures_signer_type_check
    check (signer_type in ('owner', 'tenant', 'broker', 'inspector', 'witness', 'company_representative', 'other')),
  constraint inspection_signatures_status_check
    check (status in ('pending', 'sent', 'viewed', 'signed', 'declined', 'cancelled', 'expired'))
);

create index if not exists inspection_signatures_inspection_idx
  on inspection_signatures(inspection_id, status);

create trigger inspection_signatures_set_updated_at
before update on inspection_signatures
for each row
execute function set_updated_at();

alter table inspection_signatures enable row level security;

drop policy if exists inspection_signatures_select_policy on inspection_signatures;
create policy inspection_signatures_select_policy
on inspection_signatures
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists inspection_signatures_insert_policy on inspection_signatures;
create policy inspection_signatures_insert_policy
on inspection_signatures
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists inspection_signatures_update_policy on inspection_signatures;
create policy inspection_signatures_update_policy
on inspection_signatures
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');
