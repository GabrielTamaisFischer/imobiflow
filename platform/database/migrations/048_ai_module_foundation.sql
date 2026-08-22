-- Fase 68 - IA imobiliaria preparada para provider real
-- Estrutura multiempresa para creditos, templates, solicitacoes e historico
-- sem gerar dados ficticios nem depender de provider externo nesta fase.

insert into public.permissions (key, description)
values
  ('ai.view', 'Visualizar uso, historico e limites de IA'),
  ('ai.use', 'Solicitar geracoes e analises de IA'),
  ('ai.manage', 'Gerenciar templates e limites de IA')
on conflict (key) do update
set description = excluded.description;

with role_permission_catalog as (
  select *
  from (
    values
      ('owner', 'ai.view'),
      ('owner', 'ai.use'),
      ('owner', 'ai.manage'),
      ('admin', 'ai.view'),
      ('admin', 'ai.use'),
      ('admin', 'ai.manage'),
      ('manager', 'ai.view'),
      ('manager', 'ai.use'),
      ('broker', 'ai.view'),
      ('broker', 'ai.use'),
      ('inspector', 'ai.view'),
      ('inspector', 'ai.use'),
      ('legal', 'ai.view'),
      ('legal', 'ai.use')
  ) as catalog(role_system_key, permission_key)
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join role_permission_catalog rpc on rpc.role_system_key = r.system_key
join public.permissions p on p.key = rpc.permission_key
on conflict (role_id, permission_id) do nothing;

create table if not exists public.ai_credit_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  monthly_limit integer not null default 0,
  used_credits integer not null default 0,
  reserved_credits integer not null default 0,
  source text not null default 'plan',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_credit_balances_period_check check (period_end >= period_start),
  constraint ai_credit_balances_values_check
    check (monthly_limit >= 0 and used_credits >= 0 and reserved_credits >= 0),
  unique (company_id, period_start, period_end)
);

create index if not exists ai_credit_balances_company_period_idx
on public.ai_credit_balances (company_id, period_start desc, period_end desc);

create table if not exists public.ai_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  template_key text not null,
  feature text not null,
  name text not null,
  description text,
  system_prompt text not null,
  required_context jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_prompt_templates_feature_check
    check (feature in ('property_description', 'whatsapp_message', 'inspection_summary', 'lead_analysis', 'contract_summary', 'other')),
  constraint ai_prompt_templates_status_check
    check (status in ('active', 'draft', 'archived')),
  unique (company_id, template_key)
);

create index if not exists ai_prompt_templates_company_feature_idx
on public.ai_prompt_templates (company_id, feature, status);

create table if not exists public.ai_generation_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  template_id uuid references public.ai_prompt_templates(id) on delete set null,
  feature text not null,
  status text not null default 'pending_provider',
  entity_type text,
  entity_id uuid,
  input_text text,
  instructions text,
  source_context jsonb not null default '{}'::jsonb,
  result_text text,
  provider text,
  model text,
  credits_estimated integer not null default 1,
  credits_charged integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_generation_requests_feature_check
    check (feature in ('property_description', 'whatsapp_message', 'inspection_summary', 'lead_analysis', 'contract_summary', 'other')),
  constraint ai_generation_requests_status_check
    check (status in ('pending_provider', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
  constraint ai_generation_requests_credits_check
    check (credits_estimated >= 0 and credits_charged >= 0)
);

create index if not exists ai_generation_requests_company_created_idx
on public.ai_generation_requests (company_id, created_at desc);

create index if not exists ai_generation_requests_company_feature_idx
on public.ai_generation_requests (company_id, feature, status, created_at desc);

create index if not exists ai_generation_requests_company_entity_idx
on public.ai_generation_requests (company_id, entity_type, entity_id);

drop trigger if exists ai_credit_balances_set_updated_at on public.ai_credit_balances;
create trigger ai_credit_balances_set_updated_at
before update on public.ai_credit_balances
for each row execute function private.set_updated_at();

drop trigger if exists ai_prompt_templates_set_updated_at on public.ai_prompt_templates;
create trigger ai_prompt_templates_set_updated_at
before update on public.ai_prompt_templates
for each row execute function private.set_updated_at();

drop trigger if exists ai_generation_requests_set_updated_at on public.ai_generation_requests;
create trigger ai_generation_requests_set_updated_at
before update on public.ai_generation_requests
for each row execute function private.set_updated_at();

alter table public.ai_credit_balances enable row level security;
alter table public.ai_prompt_templates enable row level security;
alter table public.ai_generation_requests enable row level security;

grant select, insert, update, delete on
  public.ai_credit_balances,
  public.ai_prompt_templates,
  public.ai_generation_requests
to authenticated;

create policy "ai_credit_balances_select_own_company"
on public.ai_credit_balances for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "ai_credit_balances_insert_own_company"
on public.ai_credit_balances for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "ai_credit_balances_update_own_company"
on public.ai_credit_balances for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "ai_prompt_templates_select_global_or_own_company"
on public.ai_prompt_templates for select
to authenticated
using (company_id is null or company_id = private.current_company_id());

create policy "ai_prompt_templates_insert_own_company"
on public.ai_prompt_templates for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "ai_prompt_templates_update_own_company"
on public.ai_prompt_templates for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "ai_generation_requests_select_own_company"
on public.ai_generation_requests for select
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id());

create policy "ai_generation_requests_insert_own_company"
on public.ai_generation_requests for insert
to authenticated
with check (auth.uid() is not null and company_id = private.current_company_id());

create policy "ai_generation_requests_update_own_company"
on public.ai_generation_requests for update
to authenticated
using (auth.uid() is not null and company_id = private.current_company_id())
with check (auth.uid() is not null and company_id = private.current_company_id());

insert into public.ai_prompt_templates (
  company_id,
  template_key,
  feature,
  name,
  description,
  system_prompt,
  required_context,
  status
)
values
  (
    null,
    'property_description_default',
    'property_description',
    'Descricao de imovel',
    'Gera descricao comercial a partir de dados reais do imovel.',
    'Use somente os dados reais informados. Nao invente caracteristicas, valores, localizacao, metragem ou disponibilidade.',
    '["property.title", "property.type", "property.operation", "property.values", "property.address", "property.features"]'::jsonb,
    'active'
  ),
  (
    null,
    'whatsapp_message_default',
    'whatsapp_message',
    'Mensagem WhatsApp',
    'Sugere mensagem curta usando contexto real do lead, imovel ou cobranca.',
    'Use linguagem objetiva e profissional. Nao prometa condicoes, descontos ou disponibilidade sem dado confirmado.',
    '["recipient", "objective", "related_entity"]'::jsonb,
    'active'
  ),
  (
    null,
    'inspection_summary_default',
    'inspection_summary',
    'Resumo de vistoria',
    'Padroniza observacoes de vistoria sem criar fatos novos.',
    'Melhore a redacao tecnica sem alterar sentido ou adicionar avarias nao informadas.',
    '["inspection.type", "rooms", "observations", "media"]'::jsonb,
    'active'
  ),
  (
    null,
    'lead_analysis_default',
    'lead_analysis',
    'Analise de lead',
    'Classifica o lead com base em historico e dados reais disponiveis.',
    'Analise somente sinais presentes no historico. Quando faltar dado, indique incerteza.',
    '["lead.source", "lead.interest", "lead.budget", "lead.history"]'::jsonb,
    'active'
  )
on conflict (company_id, template_key) do nothing;
