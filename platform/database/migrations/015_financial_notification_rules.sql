create table if not exists public.notification_rule_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  rule_key text not null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'system')),
  offset_days integer not null default 0,
  trigger_status text not null,
  template_key text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_rule_steps_company_key_channel_offset_idx
on public.notification_rule_steps (company_id, rule_key, channel, offset_days)
where company_id is not null;

create unique index if not exists notification_rule_steps_system_key_channel_offset_idx
on public.notification_rule_steps (rule_key, channel, offset_days)
where company_id is null;

create index if not exists notification_rule_steps_company_status_idx
on public.notification_rule_steps (company_id, status);

alter table public.notification_rule_steps enable row level security;

grant select on public.notification_rule_steps to authenticated;

create policy "notification_rule_steps_select_company_or_system"
on public.notification_rule_steps for select to authenticated
using (company_id is null or company_id = private.current_company_id());

insert into public.notification_templates (template_key, channel, name, subject, body, variables_json)
values
  (
    'charge_created',
    'whatsapp',
    'Cobranca gerada',
    null,
    'Ola, {{recipient_name}}. Sua cobranca de {{amount}} foi gerada com vencimento em {{due_date}}. Acesse: {{payment_link}}',
    '["recipient_name", "amount", "due_date", "payment_link"]'::jsonb
  ),
  (
    'charge_due_reminder',
    'whatsapp',
    'Lembrete antes do vencimento',
    null,
    'Ola, {{recipient_name}}. Lembrete: sua cobranca de {{amount}} vence em {{due_date}}. Acesse: {{payment_link}}',
    '["recipient_name", "amount", "due_date", "payment_link"]'::jsonb
  ),
  (
    'charge_overdue_notice',
    'whatsapp',
    'Aviso de cobranca vencida',
    null,
    'Ola, {{recipient_name}}. Identificamos uma cobranca vencida de {{amount}}, com vencimento em {{due_date}}. Regularize pelo link: {{payment_link}}',
    '["recipient_name", "amount", "due_date", "payment_link"]'::jsonb
  ),
  (
    'charge_payment_confirmed',
    'whatsapp',
    'Pagamento confirmado',
    null,
    'Ola, {{recipient_name}}. Recebemos o pagamento de {{amount}}. Obrigado. Seu historico fica disponivel em: {{payment_link}}',
    '["recipient_name", "amount", "payment_link"]'::jsonb
  ),
  (
    'charge_created',
    'email',
    'Cobranca gerada',
    'Cobranca gerada - ImobiFlow',
    'Ola, {{recipient_name}}.\n\nSua cobranca de {{amount}} foi gerada com vencimento em {{due_date}}.\n\nAcesse: {{payment_link}}',
    '["recipient_name", "amount", "due_date", "payment_link"]'::jsonb
  ),
  (
    'charge_due_reminder',
    'email',
    'Lembrete antes do vencimento',
    'Lembrete de vencimento - ImobiFlow',
    'Ola, {{recipient_name}}.\n\nSua cobranca de {{amount}} vence em {{due_date}}.\n\nAcesse: {{payment_link}}',
    '["recipient_name", "amount", "due_date", "payment_link"]'::jsonb
  ),
  (
    'charge_overdue_notice',
    'email',
    'Aviso de cobranca vencida',
    'Cobranca vencida - ImobiFlow',
    'Ola, {{recipient_name}}.\n\nIdentificamos uma cobranca vencida de {{amount}}, com vencimento em {{due_date}}.\n\nRegularize pelo link: {{payment_link}}',
    '["recipient_name", "amount", "due_date", "payment_link"]'::jsonb
  ),
  (
    'charge_payment_confirmed',
    'email',
    'Pagamento confirmado',
    'Pagamento confirmado - ImobiFlow',
    'Ola, {{recipient_name}}.\n\nRecebemos o pagamento de {{amount}}. Obrigado.\n\nSeu historico fica disponivel em: {{payment_link}}',
    '["recipient_name", "amount", "payment_link"]'::jsonb
  )
on conflict do nothing;

insert into public.notification_rule_steps (rule_key, channel, offset_days, trigger_status, template_key)
values
  ('rent_charge_collection', 'whatsapp', -3, 'waiting_payment', 'charge_due_reminder'),
  ('rent_charge_collection', 'whatsapp', 0, 'waiting_payment', 'charge_due_reminder'),
  ('rent_charge_collection', 'whatsapp', 3, 'overdue', 'charge_overdue_notice'),
  ('rent_charge_collection', 'whatsapp', 7, 'overdue', 'charge_overdue_notice'),
  ('rent_charge_collection', 'whatsapp', 15, 'overdue', 'charge_overdue_notice'),
  ('rent_charge_collection', 'email', -3, 'waiting_payment', 'charge_due_reminder'),
  ('rent_charge_collection', 'email', 0, 'waiting_payment', 'charge_due_reminder'),
  ('rent_charge_collection', 'email', 3, 'overdue', 'charge_overdue_notice'),
  ('rent_charge_collection', 'email', 7, 'overdue', 'charge_overdue_notice'),
  ('rent_charge_collection', 'email', 15, 'overdue', 'charge_overdue_notice')
on conflict do nothing;
