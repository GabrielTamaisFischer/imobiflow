create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  import_type text not null default 'properties'
    check (import_type in ('properties', 'owners', 'owners_properties')),
  source_type text not null default 'csv'
    check (source_type in ('csv', 'excel', 'xml', 'json', 'zip', 'url')),
  file_name text not null,
  status text not null default 'previewed'
    check (status in ('previewed', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  imported_owners integer not null default 0,
  imported_properties integer not null default 0,
  skipped_rows integer not null default 0,
  mapping_json jsonb not null default '{}'::jsonb,
  preview_json jsonb not null default '{}'::jsonb,
  error_report_json jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists import_jobs_company_created_idx
on public.import_jobs (company_id, created_at desc);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  import_id uuid not null references public.import_jobs(id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null default '{}'::jsonb,
  mapped_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'valid', 'invalid', 'imported', 'skipped', 'failed')),
  errors_json jsonb not null default '[]'::jsonb,
  owner_id uuid references public.property_owners(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists import_rows_company_import_idx
on public.import_rows (company_id, import_id, row_number);

create index if not exists import_rows_company_status_idx
on public.import_rows (company_id, import_id, status);

drop trigger if exists import_jobs_set_updated_at on public.import_jobs;
create trigger import_jobs_set_updated_at
before update on public.import_jobs
for each row execute function private.set_updated_at();

alter table public.import_jobs enable row level security;
alter table public.import_rows enable row level security;

grant select, insert, update, delete on public.import_jobs, public.import_rows to authenticated;

create policy "import_jobs_select_own_company"
on public.import_jobs for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "import_jobs_insert_own_company"
on public.import_jobs for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "import_jobs_update_own_company"
on public.import_jobs for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "import_jobs_delete_own_company"
on public.import_jobs for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "import_rows_select_own_company"
on public.import_rows for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "import_rows_insert_own_company"
on public.import_rows for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "import_rows_update_own_company"
on public.import_rows for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "import_rows_delete_own_company"
on public.import_rows for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());
