-- YNTYMAK 0.7 compatibility schema: single platform administrator + elections, initiatives, events. No petition module is created in this product version.
-- Apply only after reviewing the existing base schema.sql and schema_mvp06.sql.
-- Test with synthetic accounts only. A responsible adult project owner should run this migration.
-- Never expose a service_role / sb_secret key in the browser.

create extension if not exists pgcrypto;

-- ONE administrator account only. Provision the row manually in SQL Editor as project owner.
create table if not exists public.platform_admins (
  singleton boolean primary key default true check (singleton = true),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select exists(select 1 from public.platform_admins a where a.singleton=true and a.user_id=auth.uid()); $$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- Internal proposals are handled through the initiatives workflow; no legal petition or signature tables are created.

-- Initiatives: creator submits for moderation; admin decides what becomes public.
create table if not exists public.initiatives (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 5 and 120),
  description text not null check(char_length(trim(description)) between 20 and 1200),
  category text not null default 'other',
  school_id uuid references public.schools(id) on delete set null,
  status text not null default 'review' check(status in ('review','published','rejected','completed')),
  created_at timestamptz not null default now()
);
alter table public.initiatives enable row level security;
drop policy if exists initiatives_read_public_owner_admin on public.initiatives;
create policy initiatives_read_public_owner_admin on public.initiatives for select to authenticated
using(status in ('published','completed') or created_by=auth.uid() or public.is_platform_admin());
drop policy if exists initiatives_insert_self on public.initiatives;
create policy initiatives_insert_self on public.initiatives for insert to authenticated
with check(created_by=auth.uid() and status='review');
drop policy if exists initiatives_admin_all on public.initiatives;
create policy initiatives_admin_all on public.initiatives for all to authenticated
using(public.is_platform_admin()) with check(public.is_platform_admin());
revoke all on public.initiatives from anon,authenticated;
grant select on public.initiatives to authenticated;
grant insert(created_by,title,description,category,school_id,status) on public.initiatives to authenticated;
grant update(status) on public.initiatives to authenticated;

-- Elections: candidate list is public only after approval; voter identity and ballot are separated.
create table if not exists public.elections (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check(char_length(trim(title)) between 5 and 120),
  position_title text not null check(char_length(trim(position_title)) between 3 and 120),
  scope text not null check(scope in ('school','district','city')),
  school_id uuid references public.schools(id) on delete set null,
  district_key text check(district_key in ('lenin','pervomai','oktyabr','sverdlov')),
  description text not null check(char_length(trim(description)) between 10 and 1200),
  nomination_start timestamptz,
  nomination_end timestamptz,
  voting_start timestamptz not null,
  voting_end timestamptz not null,
  stage text not null default 'draft' check(stage in ('draft','nominations','campaign','voting','closed','cancelled')),
  created_at timestamptz not null default now(),
  check(voting_end>voting_start),
  check((scope='school' and school_id is not null) or (scope<>'school' and school_id is null)),
  check((scope='district' and district_key is not null) or (scope<>'district' and district_key is null))
);
create table if not exists public.election_candidates (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check(char_length(trim(display_name)) between 1 and 70),
  program text not null check(char_length(trim(program)) between 20 and 1000),
  status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  unique(election_id,user_id), unique(election_id,id)
);
create table if not exists public.election_voter_receipts (
  election_id uuid not null references public.elections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cast_at timestamptz not null default now(),
  primary key(election_id,user_id)
);
create table if not exists public.election_ballots (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  candidate_id uuid not null,
  cast_at timestamptz not null default now(),
  foreign key(election_id,candidate_id) references public.election_candidates(election_id,id) on delete cascade
);
alter table public.elections enable row level security;
alter table public.election_candidates enable row level security;
alter table public.election_voter_receipts enable row level security;
alter table public.election_ballots enable row level security;
drop policy if exists elections_read_published on public.elections;
create policy elections_read_published on public.elections for select to authenticated
using(stage<>'draft' and stage<>'cancelled' or public.is_platform_admin());
drop policy if exists elections_admin_all on public.elections;
create policy elections_admin_all on public.elections for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
drop policy if exists candidates_read_approved on public.election_candidates;
create policy candidates_read_approved on public.election_candidates for select to authenticated
using(status='approved' or user_id=auth.uid() or public.is_platform_admin());
drop policy if exists candidates_insert_self on public.election_candidates;
create policy candidates_insert_self on public.election_candidates for insert to authenticated
with check(user_id=auth.uid() and status='pending');
drop policy if exists candidates_admin_all on public.election_candidates;
create policy candidates_admin_all on public.election_candidates for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
-- No direct client access to receipts or ballots. Votes are submitted/read only through controlled RPCs.
revoke all on public.elections,public.election_candidates,public.election_voter_receipts,public.election_ballots from anon,authenticated;
grant select on public.elections,public.election_candidates to authenticated;
grant insert(created_by,title,position_title,scope,school_id,district_key,description,nomination_start,nomination_end,voting_start,voting_end,stage) on public.elections to authenticated;
grant update(title,position_title,description,nomination_start,nomination_end,voting_start,voting_end,stage) on public.elections to authenticated;
grant insert(election_id,user_id,display_name,program,status) on public.election_candidates to authenticated;
grant update(status) on public.election_candidates to authenticated;

create or replace function public.cast_election_vote(p_election_id uuid,p_candidate_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.elections%rowtype; v_school uuid; v_district text;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into e from public.elections where id=p_election_id for update;
 if not found or e.stage<>'voting' or now()<e.voting_start or now()>e.voting_end then raise exception 'voting_not_open'; end if;
 select school_id into v_school from public.profiles where id=auth.uid();
 if v_school is null then raise exception 'verified_school_required'; end if;
 if e.scope='school' and v_school<>e.school_id then raise exception 'not_eligible_for_school_election'; end if;
 if e.scope='district' then select district_key into v_district from public.schools where id=v_school; if v_district is distinct from e.district_key then raise exception 'not_eligible_for_district_election'; end if; end if;
 if not exists(select 1 from public.election_candidates c where c.id=p_candidate_id and c.election_id=e.id and c.status='approved') then raise exception 'candidate_not_available'; end if;
 insert into public.election_voter_receipts(election_id,user_id) values(e.id,auth.uid());
 insert into public.election_ballots(election_id,candidate_id) values(e.id,p_candidate_id);
exception when unique_violation then raise exception 'already_voted';
end; $$;

create or replace function public.get_election_results(p_election_id uuid)
returns table(candidate_id uuid,display_name text,vote_count bigint)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from public.elections e where e.id=p_election_id and (e.stage='closed' or public.is_platform_admin())) then raise exception 'results_not_available'; end if;
 return query select c.id,c.display_name,count(b.id) from public.election_candidates c
 left join public.election_ballots b on b.election_id=c.election_id and b.candidate_id=c.id
 where c.election_id=p_election_id and c.status='approved' group by c.id,c.display_name order by count(b.id) desc;
end; $$;
revoke all on function public.cast_election_vote(uuid,uuid) from public,anon;
revoke all on function public.get_election_results(uuid) from public,anon;
grant execute on function public.cast_election_vote(uuid,uuid) to authenticated;
grant execute on function public.get_election_results(uuid) to authenticated;

-- Events: participants can read their own application; only administrator sees full roster.
create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check(char_length(trim(title)) between 5 and 120),
  description text not null check(char_length(trim(description)) between 10 and 1200),
  event_date timestamptz not null,
  venue_label text not null,
  capacity integer not null default 40 check(capacity between 1 and 5000),
  status text not null default 'draft' check(status in ('draft','open','closed','cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.platform_event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.platform_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check(char_length(trim(display_name)) between 1 and 70),
  school_id uuid references public.schools(id) on delete set null,
  grade_label text,
  status text not null default 'registered' check(status in ('registered','cancelled')),
  created_at timestamptz not null default now(),
  unique(event_id,user_id)
);
alter table public.platform_events enable row level security;
alter table public.platform_event_registrations enable row level security;
drop policy if exists platform_events_read on public.platform_events;
create policy platform_events_read on public.platform_events for select to authenticated using(status='open' or public.is_platform_admin());
drop policy if exists platform_events_admin_all on public.platform_events;
create policy platform_events_admin_all on public.platform_events for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
drop policy if exists event_registrations_read_owner_admin on public.platform_event_registrations;
create policy event_registrations_read_owner_admin on public.platform_event_registrations for select to authenticated using(user_id=auth.uid() or public.is_platform_admin());
drop policy if exists event_registrations_insert_self on public.platform_event_registrations;
create policy event_registrations_insert_self on public.platform_event_registrations for insert to authenticated with check(user_id=auth.uid() and status='registered');
drop policy if exists event_registrations_admin_update on public.platform_event_registrations;
create policy event_registrations_admin_update on public.platform_event_registrations for update to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
revoke all on public.platform_events,public.platform_event_registrations from anon,authenticated;
grant select on public.platform_events to authenticated;
grant insert(title,description,event_date,venue_label,capacity,status,created_by) on public.platform_events to authenticated;
grant update(title,description,event_date,venue_label,capacity,status) on public.platform_events to authenticated;
grant select on public.platform_event_registrations to authenticated;
grant insert(event_id,user_id,display_name,school_id,grade_label,status) on public.platform_event_registrations to authenticated;
grant update(status) on public.platform_event_registrations to authenticated;

-- Convenience helper to count registrations without exposing participant names.
create or replace function public.get_event_public_count(p_event_id uuid)
returns bigint language sql stable security definer set search_path=public,pg_temp as $$
 select count(*) from public.platform_event_registrations r where r.event_id=p_event_id and r.status='registered';
$$;
revoke all on function public.get_event_public_count(uuid) from public,anon;
grant execute on function public.get_event_public_count(uuid) to authenticated;

-- Provision the one administrator only after the intended Auth user has been created and verified.
-- Run this manually in Supabase SQL Editor as project owner, replacing the email:
-- insert into public.platform_admins(singleton,user_id)
-- select true,id from auth.users where lower(email)=lower('ADMIN_EMAIL_HERE') and email_confirmed_at is not null;
-- The singleton primary key makes a second administrator impossible without a deliberate owner-level replacement.
