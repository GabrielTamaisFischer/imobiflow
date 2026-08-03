alter table public.inspection_signatures
  add column if not exists signer_email text,
  add column if not exists signer_phone text,
  add column if not exists status text not null default 'pending',
  add column if not exists signature_token text unique,
  add column if not exists signature_text text,
  add column if not exists signed_user_agent text,
  add column if not exists signed_payload jsonb not null default '{}'::jsonb,
  add column if not exists expires_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inspection_signatures_status_check'
      and conrelid = 'public.inspection_signatures'::regclass
  ) then
    alter table public.inspection_signatures
      add constraint inspection_signatures_status_check
      check (status in ('pending', 'signed', 'cancelled', 'expired'));
  end if;
end $$;

create index if not exists inspection_signatures_company_status_idx
on public.inspection_signatures (company_id, status, created_at desc);

create index if not exists inspection_signatures_token_idx
on public.inspection_signatures (signature_token)
where signature_token is not null;

drop trigger if exists inspection_signatures_set_updated_at on public.inspection_signatures;
create trigger inspection_signatures_set_updated_at
before update on public.inspection_signatures
for each row execute function private.set_updated_at();
