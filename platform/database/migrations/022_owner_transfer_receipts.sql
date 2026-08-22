alter table public.owner_transfers
  add column if not exists payment_method text,
  add column if not exists receipt_url text,
  add column if not exists receipt_reference text,
  add column if not exists gateway_transfer_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists owner_transfers_company_paid_idx
on public.owner_transfers (company_id, paid_at desc)
where paid_at is not null;

create unique index if not exists owner_transfers_company_gateway_transfer_uidx
on public.owner_transfers (company_id, gateway_transfer_id)
where gateway_transfer_id is not null;
