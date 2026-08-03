alter table public.inspection_media
  alter column file_url drop not null;

alter table public.inspection_media
  add column if not exists storage_bucket text not null default 'imobiflow-inspections',
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size integer;

create index if not exists inspection_media_company_storage_path_idx
on public.inspection_media (company_id, storage_bucket, storage_path)
where storage_path is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inspection_media_file_source_check'
      and conrelid = 'public.inspection_media'::regclass
  ) then
    alter table public.inspection_media
      add constraint inspection_media_file_source_check
      check (file_url is not null or storage_path is not null);
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imobiflow-inspections',
  'imobiflow-inspections',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/pdf'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "inspection_storage_select_own_company"
on storage.objects for select
to authenticated
using (
  bucket_id = 'imobiflow-inspections'
  and (storage.foldername(name))[1] = private.current_company_id()::text
);

create policy "inspection_storage_insert_own_company"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'imobiflow-inspections'
  and (storage.foldername(name))[1] = private.current_company_id()::text
);

create policy "inspection_storage_update_own_company"
on storage.objects for update
to authenticated
using (
  bucket_id = 'imobiflow-inspections'
  and (storage.foldername(name))[1] = private.current_company_id()::text
)
with check (
  bucket_id = 'imobiflow-inspections'
  and (storage.foldername(name))[1] = private.current_company_id()::text
);

create policy "inspection_storage_delete_own_company"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'imobiflow-inspections'
  and (storage.foldername(name))[1] = private.current_company_id()::text
);
