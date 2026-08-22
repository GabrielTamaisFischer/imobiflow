alter table public.financial_webhook_events
  add column if not exists payload_hash text,
  add column if not exists received_at timestamptz not null default now(),
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists financial_webhook_events_provider_payload_hash_uidx
on public.financial_webhook_events (provider, payload_hash)
where payload_hash is not null;

create index if not exists financial_webhook_events_provider_charge_idx
on public.financial_webhook_events (provider, gateway_charge_id, created_at desc)
where gateway_charge_id is not null;

alter table public.financial_payments
  add column if not exists source text not null default 'manual',
  add column if not exists gateway_event_id text,
  add column if not exists gateway_charge_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists financial_payments_company_gateway_event_uidx
on public.financial_payments (company_id, gateway_event_id)
where gateway_event_id is not null;

create index if not exists financial_payments_company_gateway_charge_idx
on public.financial_payments (company_id, gateway_charge_id, paid_at desc)
where gateway_charge_id is not null;

alter table public.commissions
  add column if not exists charge_id uuid references public.financial_charges(id) on delete set null;

create index if not exists commissions_company_charge_idx
on public.commissions (company_id, charge_id)
where charge_id is not null;

alter table public.owner_transfers
  add column if not exists charge_id uuid references public.financial_charges(id) on delete set null;

create index if not exists owner_transfers_company_charge_idx
on public.owner_transfers (company_id, charge_id)
where charge_id is not null;
