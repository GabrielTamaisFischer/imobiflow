-- Fase 56 - Automacoes WhatsApp, IA imobiliaria e reguas operacionais
-- Base multiempresa para conexoes de comunicacao, templates de mensagem,
-- conversas, execucoes de automacao e uso de IA por tenant.

create table if not exists communication_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  provider text not null,
  channel_type text not null default 'whatsapp',
  display_name text not null,
  status text not null default 'inactive',
  environment text not null default 'sandbox',
  external_account_id text,
  phone_number text,
  phone_number_id text,
  webhook_url text,
  credentials_status text not null default 'missing',
  opt_in_required boolean not null default true,
  daily_message_limit integer,
  monthly_message_limit integer,
  last_healthcheck_at timestamptz,
  last_healthcheck_status text,
  last_error_message text,
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_channels_provider_check
    check (provider in ('whatsapp_cloud_api', 'zapi', 'evolution_api', 'twilio', 'manual', 'other')),
  constraint communication_channels_type_check
    check (channel_type in ('whatsapp', 'sms', 'email', 'push', 'other')),
  constraint communication_channels_status_check
    check (status in ('inactive', 'active', 'error', 'pending_review', 'disabled')),
  constraint communication_channels_environment_check
    check (environment in ('sandbox', 'production')),
  constraint communication_channels_credentials_status_check
    check (credentials_status in ('missing', 'configured', 'invalid', 'rotating', 'expired'))
);

create index if not exists communication_channels_company_status_idx
  on communication_channels(company_id, channel_type, status);

create trigger communication_channels_set_updated_at
before update on communication_channels
for each row
execute function set_updated_at();

alter table communication_channels enable row level security;

drop policy if exists communication_channels_select_policy on communication_channels;
create policy communication_channels_select_policy
on communication_channels
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists communication_channels_insert_policy on communication_channels;
create policy communication_channels_insert_policy
on communication_channels
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists communication_channels_update_policy on communication_channels;
create policy communication_channels_update_policy
on communication_channels
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  channel_type text not null default 'whatsapp',
  template_key text not null,
  name text not null,
  category text not null,
  status text not null default 'draft',
  language text not null default 'pt_BR',
  subject text,
  body text not null,
  variables jsonb not null default '[]'::jsonb,
  provider_template_id text,
  provider_approval_status text,
  opt_in_required boolean not null default true,
  created_by uuid references users(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_templates_channel_check
    check (channel_type in ('whatsapp', 'sms', 'email', 'push', 'other')),
  constraint message_templates_category_check
    check (
      category in (
        'lead_followup',
        'visit_reminder',
        'proposal',
        'contract',
        'inspection',
        'billing',
        'payment_confirmation',
        'overdue_notice',
        'owner_transfer',
        'support',
        'marketing',
        'other'
      )
    ),
  constraint message_templates_status_check
    check (status in ('draft', 'pending_approval', 'active', 'rejected', 'archived')),
  constraint message_templates_provider_approval_check
    check (
      provider_approval_status is null
      or provider_approval_status in ('not_required', 'pending', 'approved', 'rejected', 'paused')
    )
);

create unique index if not exists message_templates_company_key_idx
  on message_templates(company_id, template_key);

create index if not exists message_templates_company_status_idx
  on message_templates(company_id, channel_type, category, status);

create trigger message_templates_set_updated_at
before update on message_templates
for each row
execute function set_updated_at();

alter table message_templates enable row level security;

drop policy if exists message_templates_select_policy on message_templates;
create policy message_templates_select_policy
on message_templates
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists message_templates_insert_policy on message_templates;
create policy message_templates_insert_policy
on message_templates
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists message_templates_update_policy on message_templates;
create policy message_templates_update_policy
on message_templates
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists communication_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_type text not null,
  display_name text not null,
  email text,
  phone text,
  document_number text,
  owner_id uuid,
  tenant_id uuid,
  lead_id uuid,
  client_id uuid,
  opt_in_whatsapp boolean not null default false,
  opt_in_email boolean not null default false,
  opt_in_sms boolean not null default false,
  opt_in_source text,
  opt_in_at timestamptz,
  opt_out_at timestamptz,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_contacts_type_check
    check (contact_type in ('lead', 'client', 'owner', 'tenant', 'broker', 'supplier', 'other')),
  constraint communication_contacts_status_check
    check (status in ('active', 'blocked', 'unsubscribed', 'archived'))
);

create index if not exists communication_contacts_company_type_idx
  on communication_contacts(company_id, contact_type, status);

create index if not exists communication_contacts_company_phone_idx
  on communication_contacts(company_id, phone)
  where phone is not null;

create trigger communication_contacts_set_updated_at
before update on communication_contacts
for each row
execute function set_updated_at();

alter table communication_contacts enable row level security;

drop policy if exists communication_contacts_select_policy on communication_contacts;
create policy communication_contacts_select_policy
on communication_contacts
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists communication_contacts_insert_policy on communication_contacts;
create policy communication_contacts_insert_policy
on communication_contacts
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists communication_contacts_update_policy on communication_contacts;
create policy communication_contacts_update_policy
on communication_contacts
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists communication_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  channel_id uuid references communication_channels(id) on delete set null,
  contact_id uuid references communication_contacts(id) on delete set null,
  channel_type text not null default 'whatsapp',
  subject text,
  status text not null default 'open',
  assigned_to uuid references users(id) on delete set null,
  last_message_at timestamptz,
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_threads_channel_check
    check (channel_type in ('whatsapp', 'sms', 'email', 'push', 'other')),
  constraint communication_threads_status_check
    check (status in ('open', 'pending', 'resolved', 'archived', 'blocked'))
);

create index if not exists communication_threads_company_status_idx
  on communication_threads(company_id, channel_type, status, last_message_at desc);

create index if not exists communication_threads_contact_idx
  on communication_threads(contact_id, last_message_at desc);

create trigger communication_threads_set_updated_at
before update on communication_threads
for each row
execute function set_updated_at();

alter table communication_threads enable row level security;

drop policy if exists communication_threads_select_policy on communication_threads;
create policy communication_threads_select_policy
on communication_threads
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists communication_threads_insert_policy on communication_threads;
create policy communication_threads_insert_policy
on communication_threads
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists communication_threads_update_policy on communication_threads;
create policy communication_threads_update_policy
on communication_threads
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists communication_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  thread_id uuid references communication_threads(id) on delete set null,
  channel_id uuid references communication_channels(id) on delete set null,
  contact_id uuid references communication_contacts(id) on delete set null,
  template_id uuid references message_templates(id) on delete set null,
  direction text not null,
  channel_type text not null default 'whatsapp',
  status text not null default 'queued',
  body text,
  media_url text,
  provider_message_id text,
  failure_reason text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_messages_direction_check
    check (direction in ('inbound', 'outbound')),
  constraint communication_messages_channel_check
    check (channel_type in ('whatsapp', 'sms', 'email', 'push', 'other')),
  constraint communication_messages_status_check
    check (status in ('queued', 'sent', 'delivered', 'read', 'failed', 'cancelled', 'received'))
);

create index if not exists communication_messages_company_status_idx
  on communication_messages(company_id, channel_type, status, created_at desc);

create index if not exists communication_messages_thread_idx
  on communication_messages(thread_id, created_at desc);

create index if not exists communication_messages_provider_idx
  on communication_messages(company_id, provider_message_id)
  where provider_message_id is not null;

create trigger communication_messages_set_updated_at
before update on communication_messages
for each row
execute function set_updated_at();

alter table communication_messages enable row level security;

drop policy if exists communication_messages_select_policy on communication_messages;
create policy communication_messages_select_policy
on communication_messages
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists communication_messages_insert_policy on communication_messages;
create policy communication_messages_insert_policy
on communication_messages
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists communication_messages_update_policy on communication_messages;
create policy communication_messages_update_policy
on communication_messages
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists automation_flows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  trigger_type text not null,
  status text not null default 'draft',
  steps jsonb not null default '[]'::jsonb,
  conditions jsonb not null default '{}'::jsonb,
  throttle_config jsonb not null default '{}'::jsonb,
  created_by uuid references users(id) on delete set null,
  activated_by uuid references users(id) on delete set null,
  activated_at timestamptz,
  paused_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_flows_trigger_check
    check (
      trigger_type in (
        'lead_created',
        'lead_no_followup',
        'visit_scheduled',
        'proposal_sent',
        'contract_pending_signature',
        'inspection_scheduled',
        'charge_created',
        'charge_due_soon',
        'charge_overdue',
        'payment_confirmed',
        'owner_transfer_completed',
        'manual',
        'scheduled'
      )
    ),
  constraint automation_flows_status_check
    check (status in ('draft', 'active', 'paused', 'archived'))
);

create index if not exists automation_flows_company_status_idx
  on automation_flows(company_id, trigger_type, status);

create trigger automation_flows_set_updated_at
before update on automation_flows
for each row
execute function set_updated_at();

alter table automation_flows enable row level security;

drop policy if exists automation_flows_select_policy on automation_flows;
create policy automation_flows_select_policy
on automation_flows
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists automation_flows_insert_policy on automation_flows;
create policy automation_flows_insert_policy
on automation_flows
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists automation_flows_update_policy on automation_flows;
create policy automation_flows_update_policy
on automation_flows
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  automation_flow_id uuid references automation_flows(id) on delete set null,
  trigger_type text not null,
  status text not null default 'queued',
  entity_type text,
  entity_id uuid,
  contact_id uuid references communication_contacts(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  failed_at timestamptz,
  error_message text,
  steps_executed jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_runs_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled', 'skipped'))
);

create index if not exists automation_runs_company_status_idx
  on automation_runs(company_id, trigger_type, status, created_at desc);

create index if not exists automation_runs_entity_idx
  on automation_runs(company_id, entity_type, entity_id);

create trigger automation_runs_set_updated_at
before update on automation_runs
for each row
execute function set_updated_at();

alter table automation_runs enable row level security;

drop policy if exists automation_runs_select_policy on automation_runs;
create policy automation_runs_select_policy
on automation_runs
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists automation_runs_insert_policy on automation_runs;
create policy automation_runs_insert_policy
on automation_runs
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists automation_runs_update_policy on automation_runs;
create policy automation_runs_update_policy
on automation_runs
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  feature text not null,
  provider text,
  model text,
  status text not null default 'completed',
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_cents integer not null default 0,
  entity_type text,
  entity_id uuid,
  request_metadata jsonb not null default '{}'::jsonb,
  response_metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  constraint ai_usage_events_feature_check
    check (
      feature in (
        'property_description',
        'lead_scoring',
        'whatsapp_reply',
        'inspection_summary',
        'contract_summary',
        'financial_analysis',
        'support_assistant',
        'other'
      )
    ),
  constraint ai_usage_events_status_check
    check (status in ('completed', 'failed', 'cancelled'))
);

create index if not exists ai_usage_events_company_feature_idx
  on ai_usage_events(company_id, feature, created_at desc);

create index if not exists ai_usage_events_company_entity_idx
  on ai_usage_events(company_id, entity_type, entity_id);

alter table ai_usage_events enable row level security;

drop policy if exists ai_usage_events_select_policy on ai_usage_events;
create policy ai_usage_events_select_policy
on ai_usage_events
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists ai_usage_events_insert_policy on ai_usage_events;
create policy ai_usage_events_insert_policy
on ai_usage_events
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');
