insert into public.permissions (key, description)
values
  ('integrations.view', 'Visualizar integrações externas da empresa'),
  ('integrations.manage', 'Configurar integrações externas da empresa')
on conflict (key) do update
set description = excluded.description;

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  provider text not null,
  category text not null
    check (category in ('communication', 'real_estate_portal', 'payment', 'identity', 'productivity', 'other')),
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'testing', 'active', 'paused', 'error', 'archived')),
  environment text not null default 'sandbox'
    check (environment in ('sandbox', 'production')),
  credentials_ref text,
  webhook_secret_ref text,
  settings jsonb not null default '{}'::jsonb,
  capabilities jsonb not null default '[]'::jsonb,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists integration_connections_company_provider_env_unique_idx
on public.integration_connections (company_id, provider, environment)
where status <> 'archived';

create index if not exists integration_connections_company_status_idx
on public.integration_connections (company_id, status, provider);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null,
  event_type text not null,
  external_id text,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists integration_events_company_provider_idx
on public.integration_events (company_id, provider, received_at desc);

drop trigger if exists integration_connections_set_updated_at on public.integration_connections;
create trigger integration_connections_set_updated_at
before update on public.integration_connections
for each row execute function private.set_updated_at();

alter table public.integration_connections enable row level security;
alter table public.integration_events enable row level security;

grant select, insert, update, delete on
  public.integration_connections,
  public.integration_events
to authenticated;

create policy "integration_connections_select_own_company"
on public.integration_connections for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "integration_connections_insert_own_company"
on public.integration_connections for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "integration_connections_update_own_company"
on public.integration_connections for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "integration_connections_delete_own_company"
on public.integration_connections for delete
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "integration_events_select_own_company"
on public.integration_events for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "integration_events_insert_own_company"
on public.integration_events for insert
to authenticated
with check (auth.uid() is not null and (company_id is null or company_id = private.current_company_id()));

create policy "integration_events_update_own_company"
on public.integration_events for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());
