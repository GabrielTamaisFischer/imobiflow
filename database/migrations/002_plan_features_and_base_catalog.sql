create table if not exists public.plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_key text not null,
  feature_name text not null,
  enabled boolean not null default true,
  limits_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (plan_id, feature_key)
);

alter table public.plan_features enable row level security;

grant select on public.plan_features to anon, authenticated;

create policy "plan_features_select_enabled"
on public.plan_features for select
to anon, authenticated
using (enabled = true);

insert into public.permissions (key, description)
values
  ('dashboard.view', 'Visualizar dashboard da empresa'),
  ('crm.view', 'Visualizar CRM e leads'),
  ('crm.manage', 'Criar e gerenciar leads'),
  ('properties.view', 'Visualizar imóveis'),
  ('properties.manage', 'Criar e gerenciar imóveis'),
  ('owners.view', 'Visualizar proprietários'),
  ('inspections.view', 'Visualizar vistorias'),
  ('inspections.manage', 'Criar e gerenciar vistorias'),
  ('contracts.view', 'Visualizar contratos'),
  ('contracts.manage', 'Criar e gerenciar contratos'),
  ('finance.view', 'Visualizar financeiro'),
  ('finance.manage', 'Gerenciar financeiro'),
  ('settings.manage', 'Gerenciar configurações da empresa'),
  ('users.manage', 'Convidar e gerenciar usuários'),
  ('billing.manage', 'Gerenciar plano e assinatura')
on conflict (key) do update
set description = excluded.description;

insert into public.plans (slug, name, billing_interval, price_cents, features_json)
values
  (
    'start-monthly',
    'Start',
    'monthly',
    7900,
    '{"crm": "basic", "properties_limit": 80, "users_limit": 3, "ai_level": "none"}'::jsonb
  ),
  (
    'pro-monthly',
    'Pro',
    'monthly',
    29700,
    '{"crm": "complete", "properties_limit": 500, "users_limit": 15, "ai_level": "limited"}'::jsonb
  ),
  (
    'enterprise-monthly',
    'Enterprise',
    'monthly',
    149700,
    '{"crm": "complete", "properties_limit": null, "users_limit": null, "ai_level": "advanced"}'::jsonb
  ),
  (
    'start-quarterly',
    'Start',
    'quarterly',
    19700,
    '{"crm": "basic", "properties_limit": 80, "users_limit": 3, "ai_level": "none"}'::jsonb
  ),
  (
    'pro-quarterly',
    'Pro',
    'quarterly',
    79700,
    '{"crm": "complete", "properties_limit": 500, "users_limit": 15, "ai_level": "limited"}'::jsonb
  ),
  (
    'enterprise-quarterly',
    'Enterprise',
    'quarterly',
    399700,
    '{"crm": "complete", "properties_limit": null, "users_limit": null, "ai_level": "advanced"}'::jsonb
  )
on conflict (slug) do update
set
  name = excluded.name,
  billing_interval = excluded.billing_interval,
  price_cents = excluded.price_cents,
  features_json = excluded.features_json,
  status = 'active',
  updated_at = now();

with plan_catalog as (
  select id, slug from public.plans
),
feature_catalog as (
  select * from (
    values
      ('start-monthly', 'dashboard', 'Dashboard inicial', '{}'::jsonb),
      ('start-monthly', 'crm_basic', 'CRM básico', '{}'::jsonb),
      ('start-monthly', 'properties', 'Cadastro de imóveis', '{"limit": 80}'::jsonb),
      ('start-monthly', 'agenda_basic', 'Agenda básica', '{}'::jsonb),
      ('start-monthly', 'whatsapp_manual', 'WhatsApp manual', '{}'::jsonb),
      ('pro-monthly', 'dashboard', 'Dashboard inicial', '{}'::jsonb),
      ('pro-monthly', 'crm_complete', 'CRM completo', '{}'::jsonb),
      ('pro-monthly', 'properties', 'Cadastro de imóveis', '{"limit": 500}'::jsonb),
      ('pro-monthly', 'inspections', 'Vistoria inteligente', '{}'::jsonb),
      ('pro-monthly', 'contracts', 'Contratos', '{}'::jsonb),
      ('pro-monthly', 'automation', 'Automações', '{}'::jsonb),
      ('pro-monthly', 'ai_limited', 'IA limitada', '{}'::jsonb),
      ('enterprise-monthly', 'dashboard', 'Dashboard inicial', '{}'::jsonb),
      ('enterprise-monthly', 'crm_complete', 'CRM completo', '{}'::jsonb),
      ('enterprise-monthly', 'properties_unlimited', 'Imóveis sem limite definido', '{}'::jsonb),
      ('enterprise-monthly', 'inspections', 'Vistoria inteligente', '{}'::jsonb),
      ('enterprise-monthly', 'contracts', 'Contratos', '{}'::jsonb),
      ('enterprise-monthly', 'finance_complete', 'Financeiro completo', '{}'::jsonb),
      ('enterprise-monthly', 'billing', 'Boletos e cobranças', '{}'::jsonb),
      ('enterprise-monthly', 'advanced_permissions', 'Permissões avançadas', '{}'::jsonb),
      ('enterprise-monthly', 'ai_advanced', 'IA avançada', '{}'::jsonb),
      ('enterprise-monthly', 'api', 'API e integrações', '{}'::jsonb)
  ) as features(plan_slug, feature_key, feature_name, limits_json)
),
quarterly_features as (
  select
    replace(plan_slug, '-monthly', '-quarterly') as plan_slug,
    feature_key,
    feature_name,
    limits_json
  from feature_catalog
),
all_features as (
  select * from feature_catalog
  union all
  select * from quarterly_features
)
insert into public.plan_features (plan_id, feature_key, feature_name, limits_json)
select p.id, f.feature_key, f.feature_name, f.limits_json
from all_features f
join plan_catalog p on p.slug = f.plan_slug
on conflict (plan_id, feature_key) do update
set
  feature_name = excluded.feature_name,
  limits_json = excluded.limits_json,
  enabled = true;
