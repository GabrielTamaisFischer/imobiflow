alter table public.notification_events
  drop constraint if exists notification_events_status_check;

alter table public.notification_events
  add constraint notification_events_status_check
  check (status in ('draft', 'prepared', 'queued', 'sent', 'delivered', 'read', 'failed', 'bounced', 'blocked', 'cancelled'));

alter table public.notification_delivery_attempts
  drop constraint if exists notification_delivery_attempts_status_check;

alter table public.notification_delivery_attempts
  add constraint notification_delivery_attempts_status_check
  check (status in ('started', 'sent', 'delivered', 'read', 'failed', 'bounced', 'blocked', 'skipped'));

create table if not exists public.notification_provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  notification_event_id uuid references public.notification_events(id) on delete set null,
  provider text not null,
  provider_event_id text,
  provider_message_id text,
  event_type text,
  normalized_status text
    check (normalized_status in ('sent', 'delivered', 'read', 'failed', 'bounced', 'blocked')),
  payload_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists notification_provider_webhook_events_hash_uidx
on public.notification_provider_webhook_events (provider, payload_hash);

create index if not exists notification_provider_webhook_events_message_idx
on public.notification_provider_webhook_events (provider, provider_message_id, created_at desc);

create index if not exists notification_provider_webhook_events_company_idx
on public.notification_provider_webhook_events (company_id, created_at desc);

alter table public.notification_provider_webhook_events enable row level security;

grant select on public.notification_provider_webhook_events to authenticated;

create policy "notification_provider_webhook_events_select_own_company"
on public.notification_provider_webhook_events for select to authenticated
using (company_id = private.current_company_id());
