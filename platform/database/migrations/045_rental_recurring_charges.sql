alter table public.financial_entries
  add column if not exists rental_id uuid references public.rental_agreements(id) on delete set null;

alter table public.financial_charges
  add column if not exists rental_id uuid references public.rental_agreements(id) on delete set null;

create index if not exists financial_entries_company_rental_idx
on public.financial_entries (company_id, rental_id, due_date desc)
where rental_id is not null;

create index if not exists financial_charges_company_rental_due_idx
on public.financial_charges (company_id, rental_id, due_date desc)
where rental_id is not null;

create unique index if not exists financial_charges_company_rental_due_active_uidx
on public.financial_charges (company_id, rental_id, due_date)
where rental_id is not null and status not in ('cancelled', 'refunded');
