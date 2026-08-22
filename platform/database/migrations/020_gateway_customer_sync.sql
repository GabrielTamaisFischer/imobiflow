alter table public.contract_parties
  add column if not exists gateway_provider text,
  add column if not exists gateway_customer_id text,
  add column if not exists gateway_customer_status text not null default 'not_synced'
    check (gateway_customer_status in ('not_synced', 'prepared', 'synced', 'blocked', 'failed')),
  add column if not exists gateway_synced_at timestamptz,
  add column if not exists gateway_metadata jsonb not null default '{}'::jsonb;

create index if not exists contract_parties_company_gateway_status_idx
on public.contract_parties (company_id, gateway_provider, gateway_customer_status, updated_at desc);

create unique index if not exists contract_parties_company_gateway_customer_unique_idx
on public.contract_parties (company_id, gateway_provider, gateway_customer_id)
where gateway_customer_id is not null;
