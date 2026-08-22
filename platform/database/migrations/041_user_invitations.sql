create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  role_id uuid references public.roles(id) on delete set null,
  invited_by uuid references public.users(id) on delete set null,
  email text not null,
  name text,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_invitations_company_status_idx
  on public.user_invitations (company_id, status, created_at desc);

create index if not exists user_invitations_email_idx
  on public.user_invitations (lower(email));

alter table public.user_invitations enable row level security;

grant select on public.user_invitations to authenticated;

create policy "user_invitations_select_own_company"
on public.user_invitations for select
to authenticated
using (company_id = private.current_company_id());
