-- Return aggregate registration counts without exposing participant identities.
-- Apply after 20261115_events_cloud.sql and event registration hardening.
create or replace function public.get_event_registration_counts()
returns table(event_id uuid, registered_count bigint)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select e.id,count(r.id)
  from public.events e
  left join public.event_registrations r
    on r.event_id=e.id and r.status='registered'
  where auth.uid() is not null
    and e.is_open=true
  group by e.id
$$;
revoke all on function public.get_event_registration_counts() from public,anon;
grant execute on function public.get_event_registration_counts() to authenticated;
comment on function public.get_event_registration_counts() is
'Returns only aggregate counts for open events; does not expose participant names or registration identities.';
