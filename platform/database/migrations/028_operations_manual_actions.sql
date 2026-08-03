insert into public.permissions (key, description)
values
  ('operations.manage', 'Executar acoes administrativas no centro operacional')
on conflict (key) do update
set description = excluded.description;

alter table public.notification_events
  add column if not exists operation_resolved_at timestamptz,
  add column if not exists operation_resolved_by uuid references public.app_users(id) on delete set null,
  add column if not exists operation_resolution_note text;

create index if not exists notification_events_operation_resolution_idx
on public.notification_events (company_id, operation_resolved_at, status, created_at desc);

create table if not exists public.operation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  action_key text not null check (
    action_key in (
      'notification_requeued',
      'notification_dispatched',
      'notification_cancelled',
      'notification_failure_resolved'
    )
  ),
  entity_type text not null,
  entity_id uuid not null,
  previous_status text,
  new_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists operation_audit_logs_company_created_idx
on public.operation_audit_logs (company_id, created_at desc);

create index if not exists operation_audit_logs_entity_idx
on public.operation_audit_logs (entity_type, entity_id, created_at desc);

alter table public.operation_audit_logs enable row level security;

grant select on public.operation_audit_logs to authenticated;

create policy "operation_audit_logs_select_own_company"
on public.operation_audit_logs for select to authenticated
using (company_id = private.current_company_id());
