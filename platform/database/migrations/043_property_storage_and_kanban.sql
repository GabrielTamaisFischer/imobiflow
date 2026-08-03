insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'imobiflow-property-media',
    'imobiflow-property-media',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
  ),
  (
    'imobiflow-property-documents',
    'imobiflow-property-documents',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.property_media
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_size integer,
  add column if not exists is_cover boolean not null default false;

alter table public.property_documents
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_size integer;

create index if not exists property_media_property_position_idx
  on public.property_media (company_id, property_id, position, created_at);

create index if not exists property_documents_property_idx
  on public.property_documents (company_id, property_id, created_at desc);
