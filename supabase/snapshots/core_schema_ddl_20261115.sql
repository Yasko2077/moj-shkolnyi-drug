-- READ-ONLY STRUCTURE SNAPSHOT of the current core public schema.
-- Captured 2026-11-15 from Supabase catalog metadata.
-- This file contains no profile, role-assignment, school, event, or registration rows.
-- It seeds only the 9 non-personal role_catalog dictionary entries.
--
-- NOT a production migration. Do not run against an existing project.
-- Use only to bootstrap an isolated staging Supabase project, then apply the ordered
-- hardening/module patches from docs/SECURITY_TEST_MATRIX.md.
-- Supabase Auth must already provide auth.users and auth.uid().

create extension if not exists pgcrypto;

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district_key text not null check (district_key in ('lenin','pervomai','oktyabr','sverdlov')),
  is_pilot boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(name,district_key)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  preferred_language text not null default 'ru' check (preferred_language in ('ru','ky')),
  school_id uuid references public.schools(id) on delete set null,
  grade_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_catalog (
  role_key text primary key,
  label_ru text not null,
  label_ky text not null,
  scope text not null check (scope in ('school','district','city','internal')),
  is_requestable boolean not null default true
);

create table public.role_requests (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  requested_role_key text not null references public.role_catalog(role_key)
    check (requested_role_key <> 'verification_representative'),
  school_id uuid references public.schools(id) on delete set null,
  organization_name text not null check (char_length(organization_name) between 2 and 140),
  district_key text check (district_key in ('lenin','pervomai','oktyabr','sverdlov')),
  term_label text not null check (char_length(term_label) between 2 and 80),
  valid_until date not null,
  basis_type text not null check (basis_type in (
    'election_protocol','school_confirmation','city_council_resolution','other_official_basis'
  )),
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint city_and_district_requests_not_school_bound check (
    ((requested_role_key in ('media_editor','city_council_chair','city_council_deputy','district_chair'))
      and school_id is null)
    or requested_role_key not in ('media_editor','city_council_chair','city_council_deputy','district_chair')
  ),
  constraint district_required_for_district_role check (
    (requested_role_key='district_chair' and district_key is not null)
    or requested_role_key<>'district_chair'
  ),
  constraint school_required_for_school_roles check (
    (requested_role_key in ('school_president','school_vice_president','project_coordinator','event_organizer')
      and school_id is not null)
    or requested_role_key not in ('school_president','school_vice_president','project_coordinator','event_organizer')
  )
);

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null references public.role_catalog(role_key),
  school_id uuid references public.schools(id) on delete set null,
  district_key text check (district_key in ('lenin','pervomai','oktyabr','sverdlov')),
  organization_name text not null,
  term_label text not null,
  valid_from date not null default current_date,
  valid_until date not null,
  verified_by uuid references auth.users(id) on delete set null,
  request_id uuid unique references public.role_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint assignment_date_order check (valid_until >= valid_from),
  constraint city_and_district_assignments_not_school_bound check (
    ((role_key in ('media_editor','city_council_chair','city_council_deputy','district_chair'))
      and school_id is null)
    or role_key not in ('media_editor','city_council_chair','city_council_deputy','district_chair')
  ),
  constraint district_assignment_needs_district check (
    (role_key='district_chair' and district_key is not null)
    or role_key<>'district_chair'
  )
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (event_key in ('forum','media','debate','eco')),
  title text not null,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_name text not null check (char_length(trim(participant_name)) between 1 and 60),
  school_label text not null check (char_length(trim(school_label)) between 1 and 100),
  grade_label text not null check (char_length(trim(grade_label)) between 1 and 30),
  participation_format text not null check (participation_format in ('individual','team')),
  team_name text check (team_name is null or char_length(team_name) <= 80),
  public_name_consent boolean not null default false,
  status text not null default 'registered' check (status in ('registered','cancelled')),
  created_at timestamptz not null default now(),
  constraint one_registration_per_user_event unique(event_id,user_id),
  constraint team_name_required check (
    participation_format <> 'team' or nullif(trim(team_name),'') is not null
  )
);

create index role_assignments_user_idx
  on public.role_assignments(user_id,valid_until desc);
create index role_assignments_active_reviewer_idx
  on public.role_assignments(role_key,valid_until)
  where role_key='verification_representative';
create index role_requests_pending_idx
  on public.role_requests(status,created_at desc);
create index role_requests_owner_idx
  on public.role_requests(submitted_by,created_at desc);
create unique index one_pending_request_per_user_role_idx
  on public.role_requests(submitted_by,requested_role_key)
  where status='pending';
create index event_registrations_event_created_idx
  on public.event_registrations(event_id,created_at desc)
  where status='registered';

insert into public.role_catalog(role_key,label_ru,label_ky,scope,is_requestable) values
('city_council_chair','Председатель Совета президентов школ города Бишкек','Бишкек шаарынын мектеп президенттер кеңешинин төрагасы','city',true),
('city_council_deputy','Заместитель председателя Совета президентов школ города Бишкек','Бишкек шаарынын мектеп президенттер кеңешинин төрагасынын орун басары','city',true),
('district_chair','Председатель районного совета президентов школ','Райондук мектеп президенттер кеңешинин төрагасы','district',true),
('event_organizer','Организатор мероприятий','Иш-чаралардын уюштуруучусу','school',true),
('media_editor','Руководитель СМИ / редактор новостей','Медиа жетекчиси / жаңылыктардын редактору','city',true),
('project_coordinator','Координатор проектов','Долбоорлордун координатору','school',true),
('school_president','Президент школы','Мектеп президенти','school',true),
('school_vice_president','Вице-президент школы','Мектептин вице-президенти','school',true),
('verification_representative','Уполномоченный представитель городского совета · проверяющий','Шаардык кеңештин ыйгарым укуктуу өкүлү · текшерүүчү','internal',false);

create or replace function public.is_verification_representative()
returns boolean language sql stable security definer
set search_path=public,pg_temp
as $fn$
  select exists (
    select 1 from public.role_assignments a
    where a.user_id=auth.uid()
      and a.role_key='verification_representative'
      and a.valid_from<=current_date
      and a.valid_until>=current_date
  );
$fn$;

create or replace function public.can_manage_events()
returns boolean language sql stable security definer
set search_path=public,pg_temp
as $fn$
  select exists (
    select 1 from public.role_assignments a
    where a.user_id=auth.uid()
      and a.role_key in ('event_organizer','school_president','city_council_chair',
        'city_council_deputy','district_chair','city_chair')
      and a.valid_from<=current_date
      and a.valid_until>=current_date
  );
$fn$;

create or replace function public.create_my_profile(
  p_display_name text,
  p_preferred_language text default 'ru',
  p_grade_label text default null
) returns void language plpgsql security definer
set search_path=public,pg_temp
as $fn$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(coalesce(p_display_name,''))) not between 1 and 80 then
    raise exception 'invalid_display_name';
  end if;
  if coalesce(p_preferred_language,'ru') not in ('ru','ky') then
    raise exception 'invalid_language';
  end if;
  insert into public.profiles(id,display_name,preferred_language,grade_label)
  values(auth.uid(),trim(p_display_name),coalesce(p_preferred_language,'ru'),
    nullif(trim(coalesce(p_grade_label,'')),''))
  on conflict(id) do update set
    display_name=excluded.display_name,
    preferred_language=excluded.preferred_language,
    grade_label=excluded.grade_label,
    updated_at=now();
end;
$fn$;

-- Legacy broad roster function from the live schema. The following hardening patch
-- must revoke it before anyone uses the staged copy; the later scoped patch replaces it.
create or replace function public.get_event_roster(p_event_key text)
returns table(
  display_name text,school_label text,grade_label text,
  participation_format text,team_name text,created_at timestamptz
)
language plpgsql stable security definer
set search_path=public,pg_temp
as $fn$
declare
  target_event uuid;
  organizer boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select e.id into target_event from public.events e where e.event_key=p_event_key;
  if target_event is null then raise exception 'event_not_found'; end if;
  organizer:=public.can_manage_events();
  return query
    select
      case when organizer or r.public_name_consent then r.participant_name else 'Участник' end,
      case when organizer then r.school_label else null end,
      case when organizer then r.grade_label else null end,
      case when organizer then r.participation_format else null end,
      case when organizer then r.team_name else null end,
      r.created_at
    from public.event_registrations r
    where r.event_id=target_event and r.status='registered'
    order by r.created_at asc;
end;
$fn$;

create or replace function public.review_role_request(
  p_request_id uuid,
  p_decision text,
  p_reviewer_note text default null
) returns void language plpgsql security definer
set search_path=public,pg_temp
as $fn$
declare
  req public.role_requests%rowtype;
begin
  if auth.uid() is null or not public.is_verification_representative() then
    raise exception 'not_authorized';
  end if;
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'invalid_decision';
  end if;

  select * into req from public.role_requests where id=p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if req.status<>'pending' then raise exception 'request_already_reviewed'; end if;
  if p_decision='approved' and req.valid_until<current_date then
    raise exception 'term_already_expired';
  end if;
  if req.submitted_by=auth.uid() then
    raise exception 'self_review_not_allowed';
  end if;

  update public.role_requests
    set status=p_decision,
        reviewer_note=left(coalesce(p_reviewer_note,''),500),
        reviewed_by=auth.uid(),
        reviewed_at=now()
    where id=p_request_id;

  if p_decision='approved' then
    perform pg_advisory_xact_lock(hashtextextended('msd_role_assignment_approval',0));
    if req.requested_role_key in (
      'school_president','school_vice_president',
      'city_council_chair','city_council_deputy','media_editor','district_chair'
    ) and exists (
      select 1 from public.role_assignments a
      where a.role_key=req.requested_role_key
        and a.valid_until>=current_date
        and (
          (req.requested_role_key='district_chair' and a.district_key=req.district_key)
          or (req.requested_role_key in ('school_president','school_vice_president') and a.school_id=req.school_id)
          or (req.requested_role_key in ('city_council_chair','city_council_deputy','media_editor') and a.school_id is null)
        )
    ) then
      raise exception 'active_assignment_already_exists';
    end if;

    insert into public.role_assignments(
      user_id,role_key,school_id,district_key,organization_name,
      term_label,valid_from,valid_until,verified_by,request_id
    ) values (
      req.submitted_by,req.requested_role_key,req.school_id,req.district_key,
      req.organization_name,req.term_label,current_date,req.valid_until,auth.uid(),req.id
    );
  end if;
end;
$fn$;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.role_catalog enable row level security;
alter table public.role_requests enable row level security;
alter table public.role_assignments enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;

create policy schools_read_authenticated on public.schools
for select to authenticated using(is_active=true);
create policy profiles_select_self_or_verifier on public.profiles
for select to authenticated using(id=auth.uid() or public.is_verification_representative());
create policy profiles_update_self on public.profiles
for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy role_catalog_read_requestable on public.role_catalog
for select to authenticated using(is_requestable=true);
create policy role_requests_insert_self on public.role_requests
for insert to authenticated with check(
  submitted_by=auth.uid() and status='pending' and reviewed_by is null and reviewed_at is null
);
create policy role_requests_select_owner_or_verifier on public.role_requests
for select to authenticated using(submitted_by=auth.uid() or public.is_verification_representative());
create policy role_assignments_select_owner_or_verifier on public.role_assignments
for select to authenticated using(user_id=auth.uid() or public.is_verification_representative());
create policy events_read_authenticated on public.events
for select to authenticated using(true);
create policy event_registrations_insert_self on public.event_registrations
for insert to authenticated with check(user_id=auth.uid() and status='registered');
create policy event_registrations_read_owner_or_organizer on public.event_registrations
for select to authenticated using(user_id=auth.uid() or public.can_manage_events());

revoke all on function public.is_verification_representative() from public,anon;
revoke all on function public.can_manage_events() from public,anon;
revoke all on function public.create_my_profile(text,text,text) from public,anon;
revoke all on function public.get_event_roster(text) from public,anon;
revoke all on function public.review_role_request(uuid,text,text) from public,anon;
grant execute on function public.is_verification_representative() to authenticated;
grant execute on function public.can_manage_events() to authenticated;
grant execute on function public.create_my_profile(text,text,text) to authenticated;
grant execute on function public.get_event_roster(text) to authenticated;
grant execute on function public.review_role_request(uuid,text,text) to authenticated;

grant select on public.schools,public.profiles,public.role_catalog,public.role_requests,
  public.role_assignments,public.events,public.event_registrations to authenticated;
grant update(display_name,preferred_language,grade_label) on public.profiles to authenticated;
grant insert(submitted_by,requested_role_key,school_id,organization_name,district_key,
  term_label,valid_until,basis_type) on public.role_requests to authenticated;
grant insert(event_id,user_id,participant_name,school_label,grade_label,
  participation_format,team_name,public_name_consent,status)
  on public.event_registrations to authenticated;

comment on function public.get_event_roster(text) is
'Legacy roster API captured from the live schema; must be revoked by event registration hardening before staged use.';
