-- Fase 53 - Portais do proprietario e do inquilino
-- Base multiempresa para acesso externo a documentos, cobranças,
-- recibos, repasses, comunicados e histórico financeiro.

create table if not exists portal_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  portal_type text not null,
  owner_id uuid,
  tenant_id uuid,
  display_name text not null,
  email text,
  phone text,
  document_number text,
  status text not null default 'invited',
  permissions text[] not null default '{}'::text[],
  invite_token_hash text,
  invitation_sent_at timestamptz,
  invitation_expires_at timestamptz,
  accepted_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  last_login_at timestamptz,
  created_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_memberships_type_check
    check (portal_type in ('owner', 'tenant')),
  constraint portal_memberships_status_check
    check (status in ('invited', 'active', 'suspended', 'revoked', 'expired')),
  constraint portal_memberships_owner_or_tenant_check
    check (
      (portal_type = 'owner' and owner_id is not null and tenant_id is null)
      or
      (portal_type = 'tenant' and tenant_id is not null and owner_id is null)
    )
);

create unique index if not exists portal_memberships_owner_unique_idx
  on portal_memberships(company_id, owner_id)
  where portal_type = 'owner' and status in ('invited', 'active', 'suspended');

create unique index if not exists portal_memberships_tenant_unique_idx
  on portal_memberships(company_id, tenant_id)
  where portal_type = 'tenant' and status in ('invited', 'active', 'suspended');

create index if not exists portal_memberships_company_status_idx
  on portal_memberships(company_id, portal_type, status);

create trigger portal_memberships_set_updated_at
before update on portal_memberships
for each row
execute function set_updated_at();

alter table portal_memberships enable row level security;

drop policy if exists portal_memberships_select_policy on portal_memberships;
create policy portal_memberships_select_policy
on portal_memberships
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists portal_memberships_insert_policy on portal_memberships;
create policy portal_memberships_insert_policy
on portal_memberships
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists portal_memberships_update_policy on portal_memberships;
create policy portal_memberships_update_policy
on portal_memberships
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists portal_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  portal_membership_id uuid references portal_memberships(id) on delete cascade,
  portal_type text not null,
  owner_id uuid,
  tenant_id uuid,
  property_id uuid,
  contract_id uuid,
  charge_id uuid,
  owner_transfer_id uuid,
  document_type text not null,
  title text not null,
  description text,
  file_url text,
  external_url text,
  amount_cents integer,
  due_date date,
  paid_at timestamptz,
  status text not null default 'draft',
  published_at timestamptz,
  read_at timestamptz,
  expires_at timestamptz,
  created_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_documents_portal_type_check
    check (portal_type in ('owner', 'tenant')),
  constraint portal_documents_status_check
    check (status in ('draft', 'published', 'read', 'archived', 'revoked')),
  constraint portal_documents_type_check
    check (
      document_type in (
        'charge',
        'receipt',
        'owner_transfer',
        'owner_statement',
        'contract',
        'inspection_report',
        'property_document',
        'notice',
        'invoice',
        'payment_slip',
        'pix_code',
        'other'
      )
    )
);

create index if not exists portal_documents_company_status_idx
  on portal_documents(company_id, portal_type, status, created_at desc);

create index if not exists portal_documents_membership_idx
  on portal_documents(portal_membership_id, status, created_at desc);

create index if not exists portal_documents_charge_idx
  on portal_documents(company_id, charge_id);

create index if not exists portal_documents_transfer_idx
  on portal_documents(company_id, owner_transfer_id);

create trigger portal_documents_set_updated_at
before update on portal_documents
for each row
execute function set_updated_at();

alter table portal_documents enable row level security;

drop policy if exists portal_documents_select_policy on portal_documents;
create policy portal_documents_select_policy
on portal_documents
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists portal_documents_insert_policy on portal_documents;
create policy portal_documents_insert_policy
on portal_documents
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists portal_documents_update_policy on portal_documents;
create policy portal_documents_update_policy
on portal_documents
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists portal_activity_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  portal_membership_id uuid references portal_memberships(id) on delete set null,
  portal_type text not null,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint portal_activity_logs_portal_type_check
    check (portal_type in ('owner', 'tenant')),
  constraint portal_activity_logs_action_check
    check (
      action in (
        'invite_sent',
        'invite_accepted',
        'login',
        'logout',
        'document_viewed',
        'charge_viewed',
        'boleto_downloaded',
        'pix_copied',
        'receipt_downloaded',
        'statement_viewed',
        'support_requested',
        'access_suspended',
        'access_revoked'
      )
    )
);

create index if not exists portal_activity_logs_company_idx
  on portal_activity_logs(company_id, portal_type, created_at desc);

create index if not exists portal_activity_logs_membership_idx
  on portal_activity_logs(portal_membership_id, created_at desc);

alter table portal_activity_logs enable row level security;

drop policy if exists portal_activity_logs_select_policy on portal_activity_logs;
create policy portal_activity_logs_select_policy
on portal_activity_logs
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists portal_activity_logs_insert_policy on portal_activity_logs;
create policy portal_activity_logs_insert_policy
on portal_activity_logs
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');
