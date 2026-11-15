-- Additive event calendar and safe registration RPCs. Apply only after adult-owner approval.
alter table public.events
  add column if not exists description text not null default '',
  add column if not exists event_date date,
  add column if not exists place_label text not null default '',
  add column if not exists capacity integer not null default 40 check (capacity between 1 and 1000),
  add column if not exists scope text not null default 'city' check (scope in ('school','district','city')),
  add column if not exists target_label text not null default 'Бишкек',
  add column if not exists district_key text check (district_key is null or district_key in ('lenin','pervomai','oktyabr','sverdlov')),
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.create_platform_event(
  p_event_key text, p_title text, p_description text, p_event_date date,
  p_place_label text, p_capacity integer, p_scope text, p_target_label text, p_district_key text default null
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if not public.can_manage_events() then raise exception 'Недостаточно прав для создания мероприятия'; end if;
  if p_event_key not in ('forum','media','debate','eco') then raise exception 'Недопустимая категория'; end if;
  if char_length(trim(p_title)) not between 5 and 100 or char_length(trim(p_description)) not between 15 and 900 then raise exception 'Проверь название и описание'; end if;
  if p_event_date < current_date or p_capacity not between 1 and 1000 then raise exception 'Проверь дату и количество мест'; end if;
  if p_scope not in ('school','district','city') or char_length(trim(p_place_label)) not between 2 and 140 or char_length(trim(p_target_label)) not between 2 and 120 then raise exception 'Проверь параметры мероприятия'; end if;
  if p_scope='district' and p_district_key not in ('lenin','pervomai','oktyabr','sverdlov') then raise exception 'Для районного мероприятия выбери район'; end if;
  insert into public.events(event_key,title,is_open,description,event_date,place_label,capacity,scope,target_label,district_key)
  values(p_event_key,trim(p_title),true,trim(p_description),p_event_date,trim(p_place_label),p_capacity,p_scope,trim(p_target_label),p_district_key)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.register_for_event(
  p_event_id uuid, p_participant_name text, p_school_label text, p_grade_label text,
  p_participation_format text default 'individual', p_team_name text default null
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_event public.events%rowtype;
begin
  if auth.uid() is null then raise exception 'Войди в аккаунт'; end if;
  select * into v_event from public.events where id=p_event_id for update;
  if not found or not v_event.is_open then raise exception 'Регистрация на это мероприятие закрыта'; end if;
  if v_event.event_date is not null and v_event.event_date < current_date then raise exception 'Дата регистрации завершена'; end if;
  if (select count(*) from public.event_registrations where event_id=p_event_id and status='registered') >= v_event.capacity then raise exception 'Свободных мест больше нет'; end if;
  if exists(select 1 from public.event_registrations where event_id=p_event_id and user_id=auth.uid() and status='registered') then raise exception 'Ты уже зарегистрирован(а)'; end if;
  if char_length(trim(p_participant_name)) not between 1 and 60 or char_length(trim(p_school_label)) not between 1 and 100 or char_length(trim(p_grade_label)) not between 1 and 30 then raise exception 'Проверь данные участника'; end if;
  if p_participation_format not in ('individual','team') then raise exception 'Недопустимый формат участия'; end if;
  if p_team_name is not null and char_length(trim(p_team_name))>80 then raise exception 'Слишком длинное название команды'; end if;
  insert into public.event_registrations(event_id,user_id,participant_name,school_label,grade_label,participation_format,team_name,public_name_consent,status)
  values(p_event_id,auth.uid(),trim(p_participant_name),trim(p_school_label),trim(p_grade_label),p_participation_format,nullif(trim(p_team_name),''),false,'registered')
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.create_platform_event(text,text,text,date,text,integer,text,text,text) from public,anon;
grant execute on function public.create_platform_event(text,text,text,date,text,integer,text,text,text) to authenticated;
revoke all on function public.register_for_event(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.register_for_event(uuid,text,text,text,text,text) to authenticated;

comment on function public.register_for_event(uuid,text,text,text,text,text) is 'Authenticated self-registration; enforces event capacity and one active registration per user.';
