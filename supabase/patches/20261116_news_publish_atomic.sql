-- Production hardening follow-up. Apply only after the reviewed news/polls and event patches.
-- This migration is additive/idempotent and must first be tested on a separate staging project.

-- Remove the legacy registration overload. The active client uses the consent-based UUID/boolean RPC.
drop function if exists public.register_for_event(uuid,text,text,text,text,text);

-- News publication must be one server-side transaction, not a draft insert followed by a client UPDATE.
create or replace function public.publish_news_post(
  p_title text,
  p_body text,
  p_category text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $news$
declare
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_category text := trim(coalesce(p_category, ''));
begin
  if auth.uid() is null or not public.is_verification_representative() then
    raise exception 'news_publish_forbidden';
  end if;
  if char_length(v_title) not between 5 and 110
     or char_length(v_body) not between 15 and 900
     or char_length(v_category) not between 2 and 40 then
    raise exception 'news_content_invalid';
  end if;

  insert into public.news_posts(created_by, title, body, category, is_published)
  values(auth.uid(), v_title, v_body, v_category, true)
  returning id into v_id;

  return v_id;
end;
$news$;

revoke all on function public.publish_news_post(text,text,text) from public, anon;
grant execute on function public.publish_news_post(text,text,text) to authenticated;

-- Prevent direct client-side draft publishing or editing of published news.
revoke all privileges on table public.news_posts from anon, authenticated;
-- Remove historical column-level grants as well as table-level grants.
revoke insert (created_by,title,body,category,is_published)
  on public.news_posts from anon, authenticated;
revoke update (title,body,category,is_published)
  on public.news_posts from anon, authenticated;
grant select on public.news_posts to authenticated;

comment on function public.publish_news_post(text,text,text) is
'Atomically publishes a validated news post for a verified platform representative.';
