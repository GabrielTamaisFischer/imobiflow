insert into public.permissions (key, description)
values
  ('notifications.view', 'Visualizar historico de notificacoes'),
  ('notifications.manage', 'Gerenciar templates e disparos de notificacoes')
on conflict (key) do update
set description = excluded.description;

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  template_key text not null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'system')),
  name text not null,
  subject text,
  body text not null,
  variables_json jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_templates_company_key_channel_idx
on public.notification_templates (company_id, template_key, channel)
where company_id is not null;

create unique index if not exists notification_templates_system_key_channel_idx
on public.notification_templates (template_key, channel)
where company_id is null;

create index if not exists notification_templates_company_status_idx
on public.notification_templates (company_id, status);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid references public.notification_templates(id) on delete set null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'system')),
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  recipient_type text not null check (recipient_type in ('owner', 'tenant', 'lead', 'user', 'company', 'other')),
  recipient_id uuid,
  recipient_name text,
  recipient_contact text not null,
  subject text,
  body text not null,
  status text not null default 'prepared' check (status in ('draft', 'prepared', 'queued', 'sent', 'delivered', 'failed', 'cancelled')),
  provider text not null default 'manual',
  provider_message_id text,
  related_entity_type text,
  related_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_events_company_created_idx
on public.notification_events (company_id, created_at desc);

create index if not exists notification_events_company_status_idx
on public.notification_events (company_id, status, created_at desc);

create index if not exists notification_events_recipient_idx
on public.notification_events (company_id, recipient_type, recipient_id, created_at desc);

alter table public.notification_templates enable row level security;
alter table public.notification_events enable row level security;

grant select on public.notification_templates to authenticated;
grant select on public.notification_events to authenticated;

create policy "notification_templates_select_company_or_system"
on public.notification_templates for select to authenticated
using (company_id is null or company_id = private.current_company_id());

create policy "notification_events_select_own_company"
on public.notification_events for select to authenticated
using (company_id = private.current_company_id());

insert into public.notification_templates (template_key, channel, name, subject, body, variables_json)
values
  (
    'owner_portal_link',
    'whatsapp',
    'Link do Portal do Proprietario',
    null,
    'Ola, {{recipient_name}}. Segue seu acesso ao Portal do Proprietario do ImobiFlow: {{portal_link}}',
    '["recipient_name", "portal_link"]'::jsonb
  ),
  (
    'owner_portal_link',
    'email',
    'Link do Portal do Proprietario',
    'Acesso ao Portal do Proprietario',
    'Ola, {{recipient_name}}.\n\nSegue seu acesso ao Portal do Proprietario do ImobiFlow:\n{{portal_link}}',
    '["recipient_name", "portal_link"]'::jsonb
  ),
  (
    'tenant_portal_link',
    'whatsapp',
    'Link do Portal do Inquilino',
    null,
    'Ola, {{recipient_name}}. Segue seu acesso ao Portal do Inquilino do ImobiFlow: {{portal_link}}',
    '["recipient_name", "portal_link"]'::jsonb
  ),
  (
    'tenant_portal_link',
    'email',
    'Link do Portal do Inquilino',
    'Acesso ao Portal do Inquilino',
    'Ola, {{recipient_name}}.\n\nSegue seu acesso ao Portal do Inquilino do ImobiFlow:\n{{portal_link}}',
    '["recipient_name", "portal_link"]'::jsonb
  ),
  (
    'charge_reminder',
    'whatsapp',
    'Lembrete de cobranca',
    null,
    'Ola, {{recipient_name}}. Sua cobranca de {{amount}} vence em {{due_date}}. Acesse: {{payment_link}}',
    '["recipient_name", "amount", "due_date", "payment_link"]'::jsonb
  )
on conflict do nothing;
