-- Optional quota storage for the hosted AI Edge Function.
-- Additive replacement for the legacy schema_mvp09 quota section.
-- Review and test with synthetic accounts before applying.
create table if not exists public.yntymak_ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null default (timezone('utc', now())::date),
  request_count integer not null default 0 check (request_count between 0 and 10),
  primary key (user_id, usage_day)
);
alter table public.yntymak_ai_daily_usage enable row level security;
revoke all on public.yntymak_ai_daily_usage from public, anon, authenticated;

create or replace function public.consume_yntymak_ai_quota()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_allowed boolean := false;
  v_day date := timezone('utc', now())::date;
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

comment on table public.yntymak_ai_daily_usage is
'Private per-account UTC daily usage counter for the optional hosted AI function; maximum 10 requests per day.';
