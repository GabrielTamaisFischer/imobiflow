create extension if not exists pgcrypto;

create schema if not exists private;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  phone text,
  email text,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  system_key text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, system_key)
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role_id uuid references public.roles(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  status text not null default 'active' check (status in ('active', 'invited', 'inactive', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_unique on public.users (lower(email));
create index if not exists users_company_id_idx on public.users (company_id);
create index if not exists users_role_id_idx on public.users (role_id);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  billing_interval text not null check (billing_interval in ('monthly', 'quarterly')),
  price_cents integer not null default 0,
  features_json jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  status text not null default 'inactive' check (status in ('active', 'pending', 'trial', 'expired', 'cancelled', 'past_due', 'inactive')),
  gateway text check (gateway in ('kiwify', 'cakto')),
  gateway_subscription_id text,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create index if not exists subscriptions_company_status_idx on public.subscriptions (company_id, status);
create index if not exists subscriptions_gateway_subscription_idx on public.subscriptions (gateway, gateway_subscription_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  gateway text not null check (gateway in ('kiwify', 'cakto')),
  gateway_payment_id text,
  status text not null,
  amount_cents integer not null default 0,
  paid_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payments_company_id_idx on public.payments (company_id);
create index if not exists payments_subscription_id_idx on public.payments (subscription_id);

create table if not exists public.gateway_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  gateway text not null check (gateway in ('kiwify', 'cakto')),
  event_name text,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists gateway_events_company_id_idx on public.gateway_events (company_id);
create index if not exists gateway_events_gateway_idx on public.gateway_events (gateway, created_at);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_company_id_idx on public.audit_logs (company_id);
create index if not exists audit_logs_user_id_idx on public.audit_logs (user_id);

create or replace function private.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.users where id = auth.uid() limit 1;
$$;

alter table public.companies enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.users enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.gateway_events enable row level security;
alter table public.audit_logs enable row level security;

grant usage on schema public to anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_company_id() to authenticated;

grant select on public.plans, public.permissions to anon, authenticated;
grant select on public.companies, public.roles, public.role_permissions, public.users, public.subscriptions to authenticated;
grant select on public.payments, public.gateway_events, public.audit_logs to authenticated;

create policy "companies_select_own_company"
on public.companies for select
to authenticated
using (id = private.current_company_id());

create policy "users_select_own_company"
on public.users for select
to authenticated
using (company_id = private.current_company_id());

create policy "roles_select_own_company"
on public.roles for select
to authenticated
using (company_id = private.current_company_id());

create policy "role_permissions_select_own_company"
on public.role_permissions for select
to authenticated
using (
  exists (
    select 1
    from public.roles r
    where r.id = role_permissions.role_id
      and r.company_id = private.current_company_id()
  )
);

create policy "permissions_select_catalog"
on public.permissions for select
to authenticated
using (true);

create policy "plans_select_active"
on public.plans for select
to anon, authenticated
using (status = 'active');

create policy "subscriptions_select_own_company"
on public.subscriptions for select
to authenticated
using (company_id = private.current_company_id());

create policy "payments_select_own_company"
on public.payments for select
to authenticated
using (company_id = private.current_company_id());

create policy "gateway_events_select_own_company"
on public.gateway_events for select
to authenticated
using (company_id = private.current_company_id());

create policy "audit_logs_select_own_company"
on public.audit_logs for select
to authenticated
using (company_id = private.current_company_id());
