-- Event registration privacy and trusted profile data.
-- Apply after event registration hardening and before the scoped roster function.
-- The roster is private to the creator/authorized territorial representative.
alter table public.event_registrations
  add column if not exists organizer_access_consent boolean not null default false,
  add column if not exists organizer_access_consent_at timestamptz;

drop function if exists public.register_for_event(uuid,text,text,text,text,text);

create or replace function public.register_for_event(
  p_event_id uuid,
  p_organizer_access_consent boolean
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $registration$
declare
  v_id uuid;
  v_event public.events%rowtype;
  v_display_name text;
  v_school_id uuid;
  v_school_label text;
  v_grade_label text;
  v_existing_id uuid;
  v_existing_status text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_organizer_access_consent is distinct from true then
    raise exception 'organizer_access_consent_required';
  end if;

  select * into v_event
  from public.events
  where id=p_event_id
  for update;

  if not found or not v_event.is_open then raise exception 'event_not_open'; end if;
  if v_event.event_date is not null and v_event.event_date<current_date then raise exception 'event_expired'; end if;

  select p.display_name,p.school_id,p.grade_label
  into v_display_name,v_school_id,v_grade_label
  from public.profiles p
  where p.id=auth.uid();

  if not found or char_length(trim(coalesce(v_display_name,''))) not between 2 and 70 then
    raise exception 'profile_required_for_event_registration';
  end if;

  v_school_label:='Не указана';
  if v_school_id is not null then
    select s.name into v_school_label
    from public.schools s
    where s.id=v_school_id and s.is_active;
    if not found then raise exception 'profile_school_not_active'; end if;
  end if;
  v_grade_label:=coalesce(nullif(trim(v_grade_label),''),'Не указан');

  if v_event.scope='school' then
    raise exception 'school_event_requires_verified_school_scope';
  elsif v_event.scope='district' then
    if v_school_id is null or not exists(
      select 1 from public.schools s
      where s.id=v_school_id and s.is_active and s.district_key=v_event.district_key
    ) then
      raise exception 'event_requires_verified_school_in_district';
    end if;
  elsif v_event.scope<>'city' then
    raise exception 'invalid_event_scope';
  end if;

  select r.id,r.status into v_existing_id,v_existing_status
  from public.event_registrations r
  where r.event_id=p_event_id and r.user_id=auth.uid()
  for update;

  if found and v_existing_status='registered' then raise exception 'already_registered'; end if;

  if (select count(*) from public.event_registrations r
      where r.event_id=p_event_id and r.status='registered')>=v_event.capacity then
    raise exception 'event_capacity_reached';
  end if;

  if v_existing_id is not null then
    update public.event_registrations
    set participant_name=v_display_name,
        school_label=v_school_label,
        grade_label=v_grade_label,
        participation_format='individual',
        team_name=null,
        organizer_access_consent=true,
        organizer_access_consent_at=now(),
        status='registered'
    where id=v_existing_id
    returning id into v_id;
  else
    insert into public.event_registrations(
      event_id,user_id,participant_name,school_label,grade_label,
      participation_format,team_name,public_name_consent,
      organizer_access_consent,organizer_access_consent_at,status
    ) values(
      p_event_id,auth.uid(),v_display_name,v_school_label,v_grade_label,
      'individual',null,false,true,now(),'registered'
    ) returning id into v_id;
  end if;

  return v_id;
end;
$registration$;

revoke all on function public.register_for_event(uuid,boolean) from public,anon;
grant execute on function public.register_for_event(uuid,boolean) to authenticated;

comment on column public.event_registrations.organizer_access_consent is
'Explicit consent to share profile display name, school label and grade with the authorized organizer for this event only.';
comment on column public.event_registrations.organizer_access_consent_at is
'Timestamp when the participant consented to organizer-only access for this event.';
comment on function public.register_for_event(uuid,boolean) is
'Registers an authenticated participant using trusted profile display name, active school directory, and profile grade; requires explicit event-organizer access consent and validates district membership for district events.';
