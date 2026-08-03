insert into public.permissions (key, description)
values
  ('notifications.automation', 'Executar automacoes de notificacoes')
on conflict (key) do update
set description = excluded.description;

create table if not exists public.notification_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_key text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  companies_scanned integer not null default 0,
  events_created integer not null default 0,
  events_skipped integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notification_automation_runs_key_created_idx
on public.notification_automation_runs (automation_key, created_at desc);

alter table public.notification_automation_runs enable row level security;

grant select on public.notification_automation_runs to authenticated;

create policy "notification_automation_runs_select_authenticated"
on public.notification_automation_runs for select to authenticated
using (true);
