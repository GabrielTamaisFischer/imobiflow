insert into public.permissions (key, description)
values
  ('inspections.sign', 'Assinar e concluir vistorias'),
  ('inspections.pdf', 'Gerar laudos PDF de vistoria')
on conflict (key) do update
set description = excluded.description;

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete restrict,
  created_by uuid references public.users(id) on delete set null,
  assigned_to uuid references public.users(id) on delete set null,
  inspection_type text not null default 'entry'
    check (inspection_type in ('entry', 'exit', 'maintenance', 'periodic')),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'in_progress', 'waiting_signature', 'completed', 'cancelled', 'archived')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  title text not null,
  summary text,
  tenant_name text,
  tenant_document text,
  owner_name text,
  public_token text unique,
  pdf_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspections_company_status_idx
on public.inspections (company_id, status, created_at desc);

create index if not exists inspections_company_property_idx
on public.inspections (company_id, property_id, created_at desc);

create table if not exists public.inspection_rooms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  general_condition text not null default 'not_checked'
    check (general_condition in ('excellent', 'good', 'regular', 'poor', 'damaged', 'not_checked')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspection_rooms_company_inspection_idx
on public.inspection_rooms (company_id, inspection_id, position);

create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  room_id uuid references public.inspection_rooms(id) on delete cascade,
  label text not null,
  category text,
  condition text not null default 'not_checked'
    check (condition in ('excellent', 'good', 'regular', 'poor', 'damaged', 'not_checked')),
  notes text,
  repair_required boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspection_items_company_inspection_idx
on public.inspection_items (company_id, inspection_id, room_id, position);

create table if not exists public.inspection_media (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  room_id uuid references public.inspection_rooms(id) on delete set null,
  item_id uuid references public.inspection_items(id) on delete set null,
  media_type text not null default 'photo'
    check (media_type in ('photo', 'video', 'audio', 'document')),
  file_url text not null,
  caption text,
  position integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inspection_media_company_inspection_idx
on public.inspection_media (company_id, inspection_id, room_id, position);

create table if not exists public.inspection_signatures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  signer_name text not null,
  signer_document text,
  signer_role text not null default 'tenant'
    check (signer_role in ('tenant', 'owner', 'broker', 'manager', 'witness')),
  signature_url text,
  signed_at timestamptz,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists inspection_signatures_company_inspection_idx
on public.inspection_signatures (company_id, inspection_id, created_at);

drop trigger if exists inspections_set_updated_at on public.inspections;
create trigger inspections_set_updated_at
before update on public.inspections
for each row execute function private.set_updated_at();

drop trigger if exists inspection_rooms_set_updated_at on public.inspection_rooms;
create trigger inspection_rooms_set_updated_at
before update on public.inspection_rooms
for each row execute function private.set_updated_at();

drop trigger if exists inspection_items_set_updated_at on public.inspection_items;
create trigger inspection_items_set_updated_at
before update on public.inspection_items
for each row execute function private.set_updated_at();

alter table public.inspections enable row level security;
alter table public.inspection_rooms enable row level security;
alter table public.inspection_items enable row level security;
alter table public.inspection_media enable row level security;
alter table public.inspection_signatures enable row level security;

grant select, insert, update, delete on
  public.inspections,
  public.inspection_rooms,
  public.inspection_items,
  public.inspection_media,
  public.inspection_signatures
to authenticated;

create policy "inspections_select_own_company"
on public.inspections for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspections_insert_own_company"
on public.inspections for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspections_update_own_company"
on public.inspections for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspections_delete_own_company"
on public.inspections for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_rooms_select_own_company"
on public.inspection_rooms for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_rooms_insert_own_company"
on public.inspection_rooms for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_rooms_update_own_company"
on public.inspection_rooms for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_rooms_delete_own_company"
on public.inspection_rooms for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_items_select_own_company"
on public.inspection_items for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_items_insert_own_company"
on public.inspection_items for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_items_update_own_company"
on public.inspection_items for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_items_delete_own_company"
on public.inspection_items for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_media_select_own_company"
on public.inspection_media for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_media_insert_own_company"
on public.inspection_media for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_media_update_own_company"
on public.inspection_media for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_media_delete_own_company"
on public.inspection_media for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_signatures_select_own_company"
on public.inspection_signatures for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_signatures_insert_own_company"
on public.inspection_signatures for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_signatures_update_own_company"
on public.inspection_signatures for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "inspection_signatures_delete_own_company"
on public.inspection_signatures for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());
