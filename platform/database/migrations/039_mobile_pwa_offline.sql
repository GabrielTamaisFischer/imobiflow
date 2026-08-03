-- Fase 57 - Mobile/PWA, offline e sincronizacao
-- Base multiempresa para dispositivos, instalacoes PWA, sessoes offline,
-- fila de sincronizacao, conflitos e notificacoes push.

create table if not exists mobile_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  device_fingerprint text not null,
  device_name text,
  platform text not null default 'web',
  app_version text,
  os_version text,
  browser_name text,
  status text not null default 'active',
  last_seen_at timestamptz,
  trusted_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_devices_platform_check
    check (platform in ('web', 'pwa', 'android', 'ios', 'desktop', 'other')),
  constraint mobile_devices_status_check
    check (status in ('active', 'trusted', 'revoked', 'blocked', 'expired'))
);

create unique index if not exists mobile_devices_company_fingerprint_idx
  on mobile_devices(company_id, device_fingerprint);

create index if not exists mobile_devices_company_user_idx
  on mobile_devices(company_id, user_id, status);

create trigger mobile_devices_set_updated_at
before update on mobile_devices
for each row
execute function set_updated_at();

alter table mobile_devices enable row level security;

drop policy if exists mobile_devices_select_policy on mobile_devices;
create policy mobile_devices_select_policy
on mobile_devices
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists mobile_devices_insert_policy on mobile_devices;
create policy mobile_devices_insert_policy
on mobile_devices
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists mobile_devices_update_policy on mobile_devices;
create policy mobile_devices_update_policy
on mobile_devices
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists pwa_installations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  mobile_device_id uuid references mobile_devices(id) on delete set null,
  install_source text not null default 'browser',
  status text not null default 'active',
  installed_at timestamptz not null default now(),
  last_opened_at timestamptz,
  uninstalled_at timestamptz,
  service_worker_version text,
  cache_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pwa_installations_source_check
    check (install_source in ('browser', 'android_prompt', 'ios_share_sheet', 'desktop', 'manual', 'other')),
  constraint pwa_installations_status_check
    check (status in ('active', 'stale', 'uninstalled', 'blocked'))
);

create index if not exists pwa_installations_company_user_idx
  on pwa_installations(company_id, user_id, status);

create trigger pwa_installations_set_updated_at
before update on pwa_installations
for each row
execute function set_updated_at();

alter table pwa_installations enable row level security;

drop policy if exists pwa_installations_select_policy on pwa_installations;
create policy pwa_installations_select_policy
on pwa_installations
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists pwa_installations_insert_policy on pwa_installations;
create policy pwa_installations_insert_policy
on pwa_installations
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists pwa_installations_update_policy on pwa_installations;
create policy pwa_installations_update_policy
on pwa_installations
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists offline_sync_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  mobile_device_id uuid references mobile_devices(id) on delete set null,
  session_key text not null,
  feature text not null,
  status text not null default 'open',
  started_at timestamptz not null default now(),
  last_activity_at timestamptz,
  synced_at timestamptz,
  failed_at timestamptz,
  closed_at timestamptz,
  error_message text,
  total_items integer not null default 0,
  synced_items integer not null default 0,
  failed_items integer not null default 0,
  conflict_items integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offline_sync_sessions_feature_check
    check (
      feature in (
        'inspection',
        'lead_followup',
        'property_capture',
        'document_capture',
        'communication',
        'other'
      )
    ),
  constraint offline_sync_sessions_status_check
    check (status in ('open', 'syncing', 'synced', 'failed', 'conflict', 'closed', 'cancelled'))
);

create unique index if not exists offline_sync_sessions_company_session_key_idx
  on offline_sync_sessions(company_id, session_key);

create index if not exists offline_sync_sessions_company_status_idx
  on offline_sync_sessions(company_id, feature, status, started_at desc);

create trigger offline_sync_sessions_set_updated_at
before update on offline_sync_sessions
for each row
execute function set_updated_at();

alter table offline_sync_sessions enable row level security;

drop policy if exists offline_sync_sessions_select_policy on offline_sync_sessions;
create policy offline_sync_sessions_select_policy
on offline_sync_sessions
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists offline_sync_sessions_insert_policy on offline_sync_sessions;
create policy offline_sync_sessions_insert_policy
on offline_sync_sessions
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists offline_sync_sessions_update_policy on offline_sync_sessions;
create policy offline_sync_sessions_update_policy
on offline_sync_sessions
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists offline_sync_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  sync_session_id uuid not null references offline_sync_sessions(id) on delete cascade,
  client_item_id text not null,
  entity_type text not null,
  entity_id uuid,
  operation text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  server_snapshot jsonb,
  client_snapshot jsonb,
  conflict_reason text,
  resolution_strategy text,
  resolved_by uuid references users(id) on delete set null,
  resolved_at timestamptz,
  synced_at timestamptz,
  failed_at timestamptz,
  error_message text,
  retry_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offline_sync_items_operation_check
    check (operation in ('create', 'update', 'delete', 'upload_media', 'acknowledge', 'other')),
  constraint offline_sync_items_status_check
    check (status in ('pending', 'syncing', 'synced', 'failed', 'conflict', 'resolved', 'ignored')),
  constraint offline_sync_items_resolution_strategy_check
    check (
      resolution_strategy is null
      or resolution_strategy in ('server_wins', 'client_wins', 'merge', 'manual', 'ignored')
    )
);

create unique index if not exists offline_sync_items_session_client_idx
  on offline_sync_items(sync_session_id, client_item_id);

create index if not exists offline_sync_items_company_status_idx
  on offline_sync_items(company_id, entity_type, status, created_at desc);

create index if not exists offline_sync_items_entity_idx
  on offline_sync_items(company_id, entity_type, entity_id);

create trigger offline_sync_items_set_updated_at
before update on offline_sync_items
for each row
execute function set_updated_at();

alter table offline_sync_items enable row level security;

drop policy if exists offline_sync_items_select_policy on offline_sync_items;
create policy offline_sync_items_select_policy
on offline_sync_items
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists offline_sync_items_insert_policy on offline_sync_items;
create policy offline_sync_items_insert_policy
on offline_sync_items
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists offline_sync_items_update_policy on offline_sync_items;
create policy offline_sync_items_update_policy
on offline_sync_items
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists push_notification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  mobile_device_id uuid references mobile_devices(id) on delete set null,
  provider text not null default 'web_push',
  endpoint text not null,
  public_key text,
  auth_secret_hint text,
  status text not null default 'active',
  categories text[] not null default '{}'::text[],
  last_sent_at timestamptz,
  last_error_message text,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_notification_subscriptions_provider_check
    check (provider in ('web_push', 'firebase', 'apns', 'expo', 'other')),
  constraint push_notification_subscriptions_status_check
    check (status in ('active', 'expired', 'revoked', 'failed'))
);

create unique index if not exists push_notification_subscriptions_endpoint_idx
  on push_notification_subscriptions(company_id, endpoint);

create index if not exists push_notification_subscriptions_company_user_idx
  on push_notification_subscriptions(company_id, user_id, status);

create trigger push_notification_subscriptions_set_updated_at
before update on push_notification_subscriptions
for each row
execute function set_updated_at();

alter table push_notification_subscriptions enable row level security;

drop policy if exists push_notification_subscriptions_select_policy on push_notification_subscriptions;
create policy push_notification_subscriptions_select_policy
on push_notification_subscriptions
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists push_notification_subscriptions_insert_policy on push_notification_subscriptions;
create policy push_notification_subscriptions_insert_policy
on push_notification_subscriptions
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists push_notification_subscriptions_update_policy on push_notification_subscriptions;
create policy push_notification_subscriptions_update_policy
on push_notification_subscriptions
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');
