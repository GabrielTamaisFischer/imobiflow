create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_pipelines_company_default_idx
on public.crm_pipelines (company_id)
where is_default = true;

create index if not exists crm_pipelines_company_id_idx
on public.crm_pipelines (company_id);

create table if not exists public.crm_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pipeline_id uuid not null references public.crm_pipelines(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  probability integer not null default 0 check (probability between 0 and 100),
  color text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, position)
);

create index if not exists crm_stages_company_pipeline_idx
on public.crm_stages (company_id, pipeline_id, position);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stage_id uuid references public.crm_stages(id) on delete set null,
  assigned_to uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  name text not null,
  email text,
  phone text,
  source text,
  interest_type text not null default 'not_defined'
    check (interest_type in ('sale', 'rent', 'both', 'not_defined')),
  status text not null default 'open'
    check (status in ('open', 'won', 'lost', 'archived')),
  budget_cents integer,
  property_reference text,
  notes text,
  last_contact_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_company_status_idx
on public.leads (company_id, status, created_at desc);

create index if not exists leads_company_stage_idx
on public.leads (company_id, stage_id);

create index if not exists leads_assigned_to_idx
on public.leads (assigned_to);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  body text not null,
  visibility text not null default 'internal' check (visibility in ('internal', 'shared')),
  created_at timestamptz not null default now()
);

create index if not exists lead_notes_company_lead_idx
on public.lead_notes (company_id, lead_id, created_at desc);

create table if not exists public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_to uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_tasks_company_status_idx
on public.lead_tasks (company_id, status, due_at);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_events_company_lead_idx
on public.lead_events (company_id, lead_id, created_at desc);

drop trigger if exists crm_pipelines_set_updated_at on public.crm_pipelines;
create trigger crm_pipelines_set_updated_at
before update on public.crm_pipelines
for each row execute function private.set_updated_at();

drop trigger if exists crm_stages_set_updated_at on public.crm_stages;
create trigger crm_stages_set_updated_at
before update on public.crm_stages
for each row execute function private.set_updated_at();

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function private.set_updated_at();

drop trigger if exists lead_tasks_set_updated_at on public.lead_tasks;
create trigger lead_tasks_set_updated_at
before update on public.lead_tasks
for each row execute function private.set_updated_at();

alter table public.crm_pipelines enable row level security;
alter table public.crm_stages enable row level security;
alter table public.leads enable row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_tasks enable row level security;
alter table public.lead_events enable row level security;

grant execute on function private.set_updated_at() to authenticated;
grant select, insert, update, delete on
  public.crm_pipelines,
  public.crm_stages,
  public.leads,
  public.lead_notes,
  public.lead_tasks,
  public.lead_events
to authenticated;

create policy "crm_pipelines_select_own_company"
on public.crm_pipelines for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "crm_pipelines_insert_own_company"
on public.crm_pipelines for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "crm_pipelines_update_own_company"
on public.crm_pipelines for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "crm_stages_select_own_company"
on public.crm_stages for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "crm_stages_insert_own_company"
on public.crm_stages for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "crm_stages_update_own_company"
on public.crm_stages for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "leads_select_own_company"
on public.leads for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "leads_insert_own_company"
on public.leads for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "leads_update_own_company"
on public.leads for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "leads_delete_own_company"
on public.leads for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "lead_notes_select_own_company"
on public.lead_notes for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "lead_notes_insert_own_company"
on public.lead_notes for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "lead_tasks_select_own_company"
on public.lead_tasks for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "lead_tasks_insert_own_company"
on public.lead_tasks for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "lead_tasks_update_own_company"
on public.lead_tasks for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "lead_events_select_own_company"
on public.lead_events for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "lead_events_insert_own_company"
on public.lead_events for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());
