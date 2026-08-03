alter table public.gateway_events
  add column if not exists external_event_id text,
  add column if not exists gateway_order_id text,
  add column if not exists gateway_subscription_id text,
  add column if not exists payload_hash text,
  add column if not exists processing_error text;

alter table public.payments
  add column if not exists gateway_event_id uuid references public.gateway_events(id) on delete set null;

create unique index if not exists gateway_events_gateway_external_event_uidx
on public.gateway_events (gateway, external_event_id)
where external_event_id is not null;

create unique index if not exists gateway_events_gateway_payload_hash_uidx
on public.gateway_events (gateway, payload_hash)
where payload_hash is not null;

create index if not exists gateway_events_gateway_order_idx
on public.gateway_events (gateway, gateway_order_id, created_at desc)
where gateway_order_id is not null;

create index if not exists gateway_events_gateway_subscription_idx
on public.gateway_events (gateway, gateway_subscription_id, created_at desc)
where gateway_subscription_id is not null;

create unique index if not exists payments_gateway_payment_uidx
on public.payments (gateway, gateway_payment_id)
where gateway_payment_id is not null;

create index if not exists payments_gateway_event_id_idx
on public.payments (gateway_event_id)
where gateway_event_id is not null;
