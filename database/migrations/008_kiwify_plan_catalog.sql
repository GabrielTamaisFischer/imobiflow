alter table public.plans
  add column if not exists gateway text,
  add column if not exists checkout_url text,
  add column if not exists sales_page_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'plans_gateway_check'
      and conrelid = 'public.plans'::regclass
  ) then
    alter table public.plans
      add constraint plans_gateway_check
      check (gateway is null or gateway in ('kiwify', 'cakto'));
  end if;
end $$;

update public.plans
set
  status = 'inactive',
  updated_at = now()
where billing_interval = 'quarterly';

insert into public.plans (
  slug,
  name,
  billing_interval,
  price_cents,
  features_json,
  gateway,
  checkout_url,
  sales_page_url,
  status
)
values
  (
    'start-monthly',
    'Start',
    'monthly',
    7900,
    '{
      "crm": "basic",
      "properties_limit": 80,
      "users_limit": 3,
      "ai_level": "none",
      "gateway": "kiwify",
      "checkout_url": "https://pay.kiwify.com.br/YmVd46n"
    }'::jsonb,
    'kiwify',
    'https://pay.kiwify.com.br/YmVd46n',
    'https://kiwify.app/FejQ33s',
    'active'
  ),
  (
    'pro-monthly',
    'Pro',
    'monthly',
    19700,
    '{
      "crm": "complete",
      "properties_limit": 500,
      "users_limit": 15,
      "ai_level": "limited",
      "gateway": "kiwify",
      "checkout_url": "https://pay.kiwify.com.br/zlmmvgv"
    }'::jsonb,
    'kiwify',
    'https://pay.kiwify.com.br/zlmmvgv',
    'https://kiwify.app/FejQ33s',
    'active'
  ),
  (
    'enterprise-monthly',
    'Enterprise AI',
    'monthly',
    49700,
    '{
      "crm": "complete",
      "properties_limit": null,
      "users_limit": null,
      "ai_level": "advanced",
      "gateway": "kiwify",
      "checkout_url": "https://pay.kiwify.com.br/rbeAEEn"
    }'::jsonb,
    'kiwify',
    'https://pay.kiwify.com.br/rbeAEEn',
    'https://kiwify.app/FejQ33s',
    'active'
  )
on conflict (slug) do update
set
  name = excluded.name,
  billing_interval = excluded.billing_interval,
  price_cents = excluded.price_cents,
  features_json = excluded.features_json,
  gateway = excluded.gateway,
  checkout_url = excluded.checkout_url,
  sales_page_url = excluded.sales_page_url,
  status = 'active',
  updated_at = now();
