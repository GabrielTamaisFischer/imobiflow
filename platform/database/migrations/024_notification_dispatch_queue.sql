alter table public.notification_events
  add column if not exists scheduled_for timestamptz,
  add column if not exists queued_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists max_attempts integer not null default 3 check (max_attempts > 0),
  add column if not exists failure_reason text,
  add column if not exists provider_response jsonb not null default '{}'::jsonb;

create index if not exists notification_events_company_schedule_idx
on public.notification_events (company_id, status, scheduled_for nulls first, created_at)
where status in ('prepared', 'queued', 'failed');

create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  notification_event_id uuid not null references public.notification_events(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'system')),
  provider text not null,
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('started', 'sent', 'delivered', 'failed', 'skipped')),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_delivery_attempts_event_idx
on public.notification_delivery_attempts (notification_event_id, created_at desc);

create index if not exists notification_delivery_attempts_company_idx
on public.notification_delivery_attempts (company_id, created_at desc);

alter table public.notification_delivery_attempts enable row level security;

grant select on public.notification_delivery_attempts to authenticated;

create policy "notification_delivery_attempts_select_own_company"
on public.notification_delivery_attempts for select to authenticated
using (company_id = private.current_company_id());
