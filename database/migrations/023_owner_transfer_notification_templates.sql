insert into public.notification_templates (template_key, channel, name, subject, body, variables_json)
values
  (
    'owner_transfer_calculated',
    'whatsapp',
    'Repasse calculado ao proprietario',
    null,
    'Ola, {{recipient_name}}. O repasse de {{amount}} referente a {{property_title}} foi calculado com previsao para {{due_date}}. Acompanhe pelo portal: {{portal_link}}',
    '["recipient_name", "amount", "property_title", "due_date", "portal_link"]'::jsonb
  ),
  (
    'owner_transfer_pending',
    'whatsapp',
    'Repasse pendente ao proprietario',
    null,
    'Ola, {{recipient_name}}. Seu repasse de {{amount}} referente a {{property_title}} esta pendente e previsto para {{due_date}}. Portal: {{portal_link}}',
    '["recipient_name", "amount", "property_title", "due_date", "portal_link"]'::jsonb
  ),
  (
    'owner_transfer_paid',
    'whatsapp',
    'Repasse realizado ao proprietario',
    null,
    'Ola, {{recipient_name}}. O repasse de {{amount}} referente a {{property_title}} foi realizado em {{paid_at}}. Comprovante: {{receipt_link}}. Portal: {{portal_link}}',
    '["recipient_name", "amount", "property_title", "paid_at", "receipt_link", "portal_link"]'::jsonb
  ),
  (
    'owner_transfer_calculated',
    'email',
    'Repasse calculado ao proprietario',
    'Repasse calculado - ImobiFlow',
    'Ola, {{recipient_name}}.\n\nO repasse de {{amount}} referente a {{property_title}} foi calculado com previsao para {{due_date}}.\n\nAcompanhe pelo portal:\n{{portal_link}}',
    '["recipient_name", "amount", "property_title", "due_date", "portal_link"]'::jsonb
  ),
  (
    'owner_transfer_pending',
    'email',
    'Repasse pendente ao proprietario',
    'Repasse pendente - ImobiFlow',
    'Ola, {{recipient_name}}.\n\nSeu repasse de {{amount}} referente a {{property_title}} esta pendente e previsto para {{due_date}}.\n\nPortal:\n{{portal_link}}',
    '["recipient_name", "amount", "property_title", "due_date", "portal_link"]'::jsonb
  ),
  (
    'owner_transfer_paid',
    'email',
    'Repasse realizado ao proprietario',
    'Repasse realizado - ImobiFlow',
    'Ola, {{recipient_name}}.\n\nO repasse de {{amount}} referente a {{property_title}} foi realizado em {{paid_at}}.\n\nComprovante: {{receipt_link}}\nPortal: {{portal_link}}',
    '["recipient_name", "amount", "property_title", "paid_at", "receipt_link", "portal_link"]'::jsonb
  )
on conflict do nothing;

insert into public.notification_rule_steps (rule_key, channel, offset_days, trigger_status, template_key)
values
  ('owner_transfer', 'whatsapp', 0, 'pending', 'owner_transfer_pending'),
  ('owner_transfer', 'whatsapp', 0, 'approved', 'owner_transfer_pending'),
  ('owner_transfer', 'whatsapp', 0, 'paid', 'owner_transfer_paid'),
  ('owner_transfer', 'email', 0, 'pending', 'owner_transfer_pending'),
  ('owner_transfer', 'email', 0, 'approved', 'owner_transfer_pending'),
  ('owner_transfer', 'email', 0, 'paid', 'owner_transfer_paid')
on conflict do nothing;
