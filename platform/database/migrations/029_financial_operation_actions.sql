create table if not exists public.financial_operation_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  charge_id uuid references public.financial_charges(id) on delete cascade,
  webhook_event_id uuid references public.financial_webhook_events(id) on delete cascade,
  owner_transfer_id uuid references public.owner_transfers(id) on delete set null,
  action_type text not null check (
    action_type in (
      'gateway_issue_review',
      'webhook_review',
      'webhook_reprocess_requested',
      'missing_transfer_created',
      'collection_task'
    )
  ),
  title text not null,
  description text,
  status text not null default 'open'
    check (status in ('open', 'done', 'cancelled')),
  due_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    charge_id is not null
    or webhook_event_id is not null
    or owner_transfer_id is not null
  )
);

create index if not exists financial_operation_actions_company_status_idx
on public.financial_operation_actions (company_id, status, due_at nulls last, created_at desc);

create index if not exists financial_operation_actions_charge_idx
on public.financial_operation_actions (company_id, charge_id, created_at desc)
where charge_id is not null;

create index if not exists financial_operation_actions_webhook_idx
on public.financial_operation_actions (company_id, webhook_event_id, created_at desc)
where webhook_event_id is not null;

alter table public.financial_operation_actions enable row level security;

grant select, insert, update on public.financial_operation_actions to authenticated;

create policy "financial_operation_actions_select_own_company"
on public.financial_operation_actions for select to authenticated
using (company_id = private.current_company_id());

create policy "financial_operation_actions_insert_own_company"
on public.financial_operation_actions for insert to authenticated
with check (company_id = private.current_company_id());

create policy "financial_operation_actions_update_own_company"
on public.financial_operation_actions for update to authenticated
using (company_id = private.current_company_id())
with check (company_id = private.current_company_id());

drop trigger if exists financial_operation_actions_set_updated_at on public.financial_operation_actions;
create trigger financial_operation_actions_set_updated_at
before update on public.financial_operation_actions
for each row execute function private.set_updated_at();
