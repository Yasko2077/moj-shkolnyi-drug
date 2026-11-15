-- Apply only after 20261115_events_cloud.sql and institutional approval.
-- Restricts participant rosters by event territory. School-level organizer mapping
-- is intentionally not granted until events have a verified school_id relationship.
create or replace function public.get_event_roster(p_event_key text)
returns table(
  display_name text,
  school_label text,
  grade_label text,
  participation_format text,
  team_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $roster$
declare
  v_event public.events%rowtype;
  v_city_scope boolean;
  v_district_scope boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select e.* into v_event
  from public.events e
  where e.event_key = p_event_key;

  if not found then
    raise exception 'event_not_found';
  end if;

  select exists (
    select 1
    from public.role_assignments a
    where a.user_id = auth.uid()
      and a.role_key in ('city_council_chair','city_council_deputy','city_chair')
      and a.valid_from <= current_date
      and a.valid_until >= current_date
  ) into v_city_scope;

  select exists (
    select 1
    from public.role_assignments a
    where a.user_id = auth.uid()
      and a.role_key = 'district_chair'
      and a.district_key = v_event.district_key
      and a.valid_from <= current_date
      and a.valid_until >= current_date
  ) into v_district_scope;

  if not v_city_scope and not (v_event.scope = 'district' and v_district_scope) then
    raise exception 'roster_access_denied';
  end if;

  return query
    select r.participant_name,
           r.school_label,
           r.grade_label,
           r.participation_format,
           r.team_name,
           r.created_at
    from public.event_registrations r
    where r.event_id = v_event.id
      and r.status = 'registered'
    order by r.created_at asc;
end;
$roster$;

revoke all on function public.get_event_roster(text) from public, anon;
grant execute on function public.get_event_roster(text) to authenticated;

comment on function public.get_event_roster(text) is
'Returns a participant roster only to active city-level representatives or the matching district chair. School-level access remains disabled until event-to-school ownership is modeled and verified.';
