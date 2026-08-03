insert into public.permissions (key, description)
values
  ('costs.view', 'Visualizar custos operacionais da empresa'),
  ('costs.manage', 'Registrar e ajustar eventos de custo operacional')
on conflict (key) do update
set description = excluded.description;

create table if not exists public.cost_catalog_items (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null unique,
  name text not null,
  unit text not null,
  unit_cost_cents numeric(14, 6) not null default 0,
  category text not null default 'operational',
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_usage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  metric_key text not null,
  quantity numeric(14, 4) not null default 1 check (quantity >= 0),
  unit text not null,
  unit_cost_cents numeric(14, 6) not null default 0,
  total_cost_cents numeric(14, 6) not null default 0,
  source text not null default 'manual',
  related_entity_type text,
  related_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  storage_mb numeric(14, 4) not null default 0,
  photos_count integer not null default 0,
  pdfs_count integer not null default 0,
  ai_requests_count integer not null default 0,
  whatsapp_messages_count integer not null default 0,
  charges_count integer not null default 0,
  pix_count integer not null default 0,
  boleto_count integer not null default 0,
  active_users_count integer not null default 0,
  api_requests_count integer not null default 0,
  estimated_cost_cents numeric(14, 6) not null default 0,
  estimated_revenue_cents integer not null default 0,
  estimated_margin_cents numeric(14, 6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, period_start, period_end)
);

create index if not exists tenant_usage_events_company_occurred_idx
on public.tenant_usage_events (company_id, occurred_at desc);

create index if not exists tenant_usage_events_company_metric_idx
on public.tenant_usage_events (company_id, metric_key, occurred_at desc);

create index if not exists tenant_cost_snapshots_company_period_idx
on public.tenant_cost_snapshots (company_id, period_start desc, period_end desc);

alter table public.cost_catalog_items enable row level security;
alter table public.tenant_usage_events enable row level security;
alter table public.tenant_cost_snapshots enable row level security;

grant select on public.cost_catalog_items to authenticated;
grant select on public.tenant_usage_events to authenticated;
grant select on public.tenant_cost_snapshots to authenticated;

create policy "cost_catalog_items_select_active"
on public.cost_catalog_items for select to authenticated
using (status = 'active');

create policy "tenant_usage_events_select_own_company"
on public.tenant_usage_events for select to authenticated
using (company_id = private.current_company_id());

create policy "tenant_cost_snapshots_select_own_company"
on public.tenant_cost_snapshots for select to authenticated
using (company_id = private.current_company_id());

drop trigger if exists cost_catalog_items_set_updated_at on public.cost_catalog_items;
create trigger cost_catalog_items_set_updated_at
before update on public.cost_catalog_items
for each row execute function private.set_updated_at();

drop trigger if exists tenant_cost_snapshots_set_updated_at on public.tenant_cost_snapshots;
create trigger tenant_cost_snapshots_set_updated_at
before update on public.tenant_cost_snapshots
for each row execute function private.set_updated_at();

insert into public.cost_catalog_items (metric_key, name, unit, unit_cost_cents, category)
values
  ('storage_mb', 'Armazenamento', 'MB', 0.008, 'infrastructure'),
  ('photo_upload', 'Foto armazenada', 'photo', 0.15, 'storage'),
  ('pdf_generated', 'PDF gerado', 'pdf', 1.5, 'documents'),
  ('ai_request', 'Uso de IA', 'request', 4.5, 'ai'),
  ('whatsapp_message', 'Mensagem WhatsApp', 'message', 12.0, 'communication'),
  ('charge_generated', 'Cobrança emitida', 'charge', 20.0, 'finance'),
  ('pix_generated', 'PIX gerado', 'pix', 3.0, 'finance'),
  ('boleto_generated', 'Boleto emitido', 'boleto', 379.0, 'finance'),
  ('active_user', 'Usuário ativo', 'user', 40.0, 'account'),
  ('api_request', 'Consumo de API', 'request', 0.02, 'api')
on conflict (metric_key) do update
set
  name = excluded.name,
  unit = excluded.unit,
  unit_cost_cents = excluded.unit_cost_cents,
  category = excluded.category,
  status = 'active',
  updated_at = now();
