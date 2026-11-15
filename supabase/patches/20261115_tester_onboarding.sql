-- Every self-service signup starts as an unprivileged tester.
-- Elevated roles remain separate in role_assignments and are never accepted from client metadata.
alter table public.profiles
  add column if not exists account_type text not null default 'tester';

alter table public.profiles
  drop constraint if exists profiles_account_type_check;

alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type = 'tester');

-- The Data API may read the current user's profile, but cannot change account_type.
revoke update (account_type) on public.profiles from anon, authenticated;

comment on column public.profiles.account_type is
'Self-service accounts are unprivileged testers. This field is server-managed; elevated roles are stored separately in role_assignments and granted only through the private owner provisioning process.';
