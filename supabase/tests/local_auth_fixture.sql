-- Minimal Supabase Auth surface for isolated PostgreSQL migration tests only.
-- No real accounts or personal information are inserted.
do $roles$
begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end;
$roles$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);
create or replace function auth.uid()
returns uuid
language sql
stable
as $uid$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$uid$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
