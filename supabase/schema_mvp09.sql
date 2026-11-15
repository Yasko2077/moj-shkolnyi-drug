-- Ынтымак 0.9 additive migration.
-- Apply only after the existing 0.6 base schema and the single-admin migration are installed.
-- Test with synthetic accounts. Run under an adult project owner's supervision.

create table if not exists public.yntymak_ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null default (timezone('utc', now())::date),
  request_count integer not null default 0 check (request_count between 0 and 10),
  primary key (user_id, usage_day)
);
alter table public.yntymak_ai_daily_usage enable row level security;
revoke all on public.yntymak_ai_daily_usage from anon, authenticated;

-- Atomically allow at most 10 hosted AI requests per signed-in user per UTC day.
create or replace function public.consume_yntymak_ai_quota()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid(); v_allowed boolean := false; v_day date := timezone('utc', now())::date;
begin
  if v_user is null then return false; end if;
  insert into public.yntymak_ai_daily_usage(user_id, usage_day, request_count)
  values(v_user, v_day, 1)
  on conflict(user_id, usage_day) do update
    set request_count = public.yntymak_ai_daily_usage.request_count + 1
    where public.yntymak_ai_daily_usage.request_count < 10
  returning true into v_allowed;
  return coalesce(v_allowed, false);
end;
$$;
revoke all on function public.consume_yntymak_ai_quota() from public, anon;
grant execute on function public.consume_yntymak_ai_quota() to authenticated;

-- Optional audit table for administrative actions. Do not place secrets or student-sensitive narratives here.
create table if not exists public.yntymak_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action_key text not null check (char_length(action_key) between 2 and 80),
  object_type text not null check (char_length(object_type) between 2 and 60),
  object_id text,
  created_at timestamptz not null default now()
);
alter table public.yntymak_admin_audit enable row level security;
revoke all on public.yntymak_admin_audit from anon, authenticated;
create index if not exists yntymak_admin_audit_created_idx on public.yntymak_admin_audit(created_at desc);

-- Retire legacy petition features from earlier experimental schemas without deleting any existing records.
-- If these objects exist, they become inaccessible to normal browser roles. The project owner can archive/drop them later after review.
do $$
begin
  if to_regclass('public.petitions') is not null then
    execute 'revoke all on table public.petitions from anon, authenticated';
  end if;
  if to_regclass('public.petition_signatures') is not null then
    execute 'revoke all on table public.petition_signatures from anon, authenticated';
  end if;
  if to_regprocedure('public.sign_petition(uuid)') is not null then
    execute 'revoke all on function public.sign_petition(uuid) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.get_petition_stats(uuid)') is not null then
    execute 'revoke all on function public.get_petition_stats(uuid) from public, anon, authenticated';
  end if;
end;
$$;
