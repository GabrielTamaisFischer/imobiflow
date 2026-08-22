-- Fase 54 - Contratos e assinatura digital
-- Base multiempresa para templates, contratos gerados, signatarios,
-- eventos de assinatura e auditoria documental.

create table if not exists contract_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  contract_type text not null,
  status text not null default 'draft',
  version integer not null default 1,
  body text not null default '',
  variables jsonb not null default '[]'::jsonb,
  created_by uuid references users(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_templates_type_check
    check (
      contract_type in (
        'rental',
        'sale',
        'management',
        'inspection',
        'proposal',
        'owner_authorization',
        'tenant_notice',
        'other'
      )
    ),
  constraint contract_templates_status_check
    check (status in ('draft', 'active', 'archived'))
);

create unique index if not exists contract_templates_company_name_version_idx
  on contract_templates(company_id, name, version);

create index if not exists contract_templates_company_status_idx
  on contract_templates(company_id, contract_type, status);

create trigger contract_templates_set_updated_at
before update on contract_templates
for each row
execute function set_updated_at();

alter table contract_templates enable row level security;

drop policy if exists contract_templates_select_policy on contract_templates;
create policy contract_templates_select_policy
on contract_templates
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists contract_templates_insert_policy on contract_templates;
create policy contract_templates_insert_policy
on contract_templates
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists contract_templates_update_policy on contract_templates;
create policy contract_templates_update_policy
on contract_templates
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists contract_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  template_id uuid references contract_templates(id) on delete set null,
  contract_type text not null,
  status text not null default 'draft',
  title text not null,
  reference_code text,
  property_id uuid,
  owner_id uuid,
  tenant_id uuid,
  lead_id uuid,
  deal_id uuid,
  rental_contract_id uuid,
  generated_body text not null default '',
  variables_snapshot jsonb not null default '{}'::jsonb,
  pdf_url text,
  external_signature_id text,
  signature_provider text,
  signature_url text,
  signature_requested_at timestamptz,
  signed_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz,
  created_by uuid references users(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_documents_type_check
    check (
      contract_type in (
        'rental',
        'sale',
        'management',
        'inspection',
        'proposal',
        'owner_authorization',
        'tenant_notice',
        'other'
      )
    ),
  constraint contract_documents_status_check
    check (
      status in (
        'draft',
        'pending_review',
        'approved',
        'sent_for_signature',
        'partially_signed',
        'signed',
        'cancelled',
        'expired',
        'archived'
      )
    )
);

create unique index if not exists contract_documents_company_reference_idx
  on contract_documents(company_id, reference_code)
  where reference_code is not null;

create index if not exists contract_documents_company_status_idx
  on contract_documents(company_id, contract_type, status, created_at desc);

create index if not exists contract_documents_property_idx
  on contract_documents(company_id, property_id);

create index if not exists contract_documents_owner_idx
  on contract_documents(company_id, owner_id);

create index if not exists contract_documents_tenant_idx
  on contract_documents(company_id, tenant_id);

create trigger contract_documents_set_updated_at
before update on contract_documents
for each row
execute function set_updated_at();

alter table contract_documents enable row level security;

drop policy if exists contract_documents_select_policy on contract_documents;
create policy contract_documents_select_policy
on contract_documents
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists contract_documents_insert_policy on contract_documents;
create policy contract_documents_insert_policy
on contract_documents
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists contract_documents_update_policy on contract_documents;
create policy contract_documents_update_policy
on contract_documents
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists contract_signers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contract_document_id uuid not null references contract_documents(id) on delete cascade,
  signer_type text not null,
  name text not null,
  email text,
  phone text,
  document_number text,
  status text not null default 'pending',
  signature_order integer not null default 1,
  external_signer_id text,
  signature_url text,
  invited_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  declined_reason text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_signers_type_check
    check (
      signer_type in (
        'owner',
        'tenant',
        'guarantor',
        'witness',
        'broker',
        'company_representative',
        'other'
      )
    ),
  constraint contract_signers_status_check
    check (status in ('pending', 'invited', 'viewed', 'signed', 'declined', 'cancelled', 'expired'))
);

create index if not exists contract_signers_document_idx
  on contract_signers(contract_document_id, signature_order, status);

create index if not exists contract_signers_company_status_idx
  on contract_signers(company_id, signer_type, status);

create trigger contract_signers_set_updated_at
before update on contract_signers
for each row
execute function set_updated_at();

alter table contract_signers enable row level security;

drop policy if exists contract_signers_select_policy on contract_signers;
create policy contract_signers_select_policy
on contract_signers
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists contract_signers_insert_policy on contract_signers;
create policy contract_signers_insert_policy
on contract_signers
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists contract_signers_update_policy on contract_signers;
create policy contract_signers_update_policy
on contract_signers
for update
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id')
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

create table if not exists contract_signature_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contract_document_id uuid not null references contract_documents(id) on delete cascade,
  contract_signer_id uuid references contract_signers(id) on delete set null,
  provider text,
  event_type text not null,
  external_event_id text,
  status_before text,
  status_after text,
  ip_address text,
  user_agent text,
  raw_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contract_signature_events_document_idx
  on contract_signature_events(contract_document_id, created_at desc);

create index if not exists contract_signature_events_company_idx
  on contract_signature_events(company_id, event_type, created_at desc);

alter table contract_signature_events enable row level security;

drop policy if exists contract_signature_events_select_policy on contract_signature_events;
create policy contract_signature_events_select_policy
on contract_signature_events
for select
using (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');

drop policy if exists contract_signature_events_insert_policy on contract_signature_events;
create policy contract_signature_events_insert_policy
on contract_signature_events
for insert
with check (company_id::text = current_setting('request.jwt.claims', true)::jsonb->>'company_id');
