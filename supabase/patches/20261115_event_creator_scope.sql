-- Ынтымак: bind event creation to the creator's verified organizational scope.
-- Apply after 20261115_events_cloud.sql. School-scoped events stay unavailable until
-- events.school_id and verified school-role matching are implemented.
alter table public.events
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists events_created_by_created_idx
  on public.events(created_by, created_at desc);

create or replace function public.create_platform_event(
  p_event_key text, p_title text, p_description text, p_event_date date,
  p_place_label text, p_capacity integer, p_scope text, p_target_label text,
  p_district_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $event$
declare
  v_id uuid;
  v_city_scope boolean := false;
  v_district_scope boolean := false;
  v_platform_verifier boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select exists (
    select 1 from public.role_assignments a
    where a.user_id = auth.uid()
      and a.role_key in ('city_council_chair','city_council_deputy','city_chair')
      and a.valid_from <= current_date and a.valid_until >= current_date
  ) into v_city_scope;

  v_platform_verifier := public.is_verification_representative();

  if p_scope = 'district' and p_district_key in ('lenin','pervomai','oktyabr','sverdlov') then
    select exists (
      select 1 from public.role_assignments a
      where a.user_id = auth.uid()
        and a.role_key = 'district_chair'
        and a.district_key = p_district_key
        and a.valid_from <= current_date and a.valid_until >= current_date
    ) into v_district_scope;
  end if;

  if not v_city_scope and not v_district_scope and not (p_scope='city' and v_platform_verifier) then
    raise exception 'event_creation_scope_denied';
  end if;

  if p_scope not in ('district','city') then
    raise exception 'school_event_requires_verified_school_scope';
  end if;
  if p_scope = 'city' and not v_city_scope and not v_platform_verifier then
    raise exception 'city_event_requires_city_role_or_verified_platform_owner';
  end if;
  if p_scope = 'district' and not (v_city_scope or v_district_scope) then
    raise exception 'district_event_requires_matching_district_role';
  end if;
  if p_event_key not in ('forum','media','debate','eco') then
    raise exception 'invalid_event_category';
  end if;
  if char_length(trim(coalesce(p_title,''))) not between 5 and 100
     or char_length(trim(coalesce(p_description,''))) not between 15 and 900 then
    raise exception 'invalid_event_text';
  end if;
  if p_event_date is null or p_event_date < current_date
     or p_capacity not between 1 and 1000 then
    raise exception 'invalid_event_date_or_capacity';
  end if;
  if char_length(trim(coalesce(p_place_label,''))) not between 2 and 140
     or char_length(trim(coalesce(p_target_label,''))) not between 2 and 120 then
    raise exception 'invalid_event_location';
  end if;
  if p_scope = 'district' and p_district_key not in ('lenin','pervomai','oktyabr','sverdlov') then
    raise exception 'invalid_district';
  end if;

  insert into public.events(
    event_key,title,is_open,description,event_date,place_label,capacity,
    scope,target_label,district_key,created_by
  )
  values(
    p_event_key,trim(p_title),true,trim(p_description),p_event_date,
    trim(p_place_label),p_capacity,p_scope,trim(p_target_label),
    case when p_scope='district' then p_district_key else null end,auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$event$;

revoke all on function public.create_platform_event(text,text,text,date,text,integer,text,text,text)
  from public, anon;
grant execute on function public.create_platform_event(text,text,text,date,text,integer,text,text,text)
  to authenticated;

comment on function public.create_platform_event(text,text,text,date,text,integer,text,text,text) is
'Creates city or matching-district events for active city/district role holders; the trusted platform verifier may create city events only. School events and unassigned event-organizer accounts are blocked until explicit ownership mapping exists.';
