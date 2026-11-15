-- Secure election module foundation. Not enabled in production until governance review.
-- Apply only after the existing role/profile foundation patches.
create table if not exists public.elections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 5 and 160),
  position_label text not null check (char_length(trim(position_label)) between 2 and 100),
  description text not null default '' check (char_length(description)<=3000),
  scope text not null check (scope in ('school','district','city')),
  school_id uuid references public.schools(id) on delete restrict,
  district_key text check (district_key in ('lenin','pervomai','oktyabr','sverdlov')),
  rules_text text not null check (char_length(trim(rules_text)) between 20 and 10000),
  nominations_open_at timestamptz not null,
  nominations_close_at timestamptz not null,
  campaign_close_at timestamptz not null,
  voting_open_at timestamptz not null,
  voting_close_at timestamptz not null,
  stage text not null default 'draft'
    check (stage in ('draft','nominations','review','campaign','voting','counting','objections','certified','cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope='school' and school_id is not null and district_key is null)
    or (scope='district' and school_id is null and district_key is not null)
    or (scope='city' and school_id is null and district_key is null)
  ),
  check (nominations_open_at < nominations_close_at
    and nominations_close_at <= campaign_close_at
    and campaign_close_at <= voting_open_at
    and voting_open_at < voting_close_at)
);
create index if not exists elections_scope_stage_idx on public.elections(scope,district_key,stage);

create table if not exists public.election_candidates (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  program text not null check (char_length(trim(program)) between 30 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note)<=500),
  unique(election_id,user_id),
  unique(id,election_id)
);
create index if not exists election_candidates_public_idx
  on public.election_candidates(election_id,status,submitted_at);

-- Eligibility is deliberately private and is not inferred from client-supplied school/grade text.
create table if not exists public.election_eligibility (
  election_id uuid not null references public.elections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete restrict,
  added_at timestamptz not null default now(),
  primary key(election_id,user_id)
);

-- Receipt proves that an account used its voting entitlement; ballot has no user_id.
create table if not exists public.election_voter_receipts (
  election_id uuid not null references public.elections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ballot_id uuid not null unique,
  cast_at timestamptz not null default now(),
  primary key(election_id,user_id)
);
create table if not exists public.election_ballots (
  ballot_id uuid primary key,
  election_id uuid not null references public.elections(id) on delete cascade,
  candidate_id uuid not null,
  cast_at timestamptz not null default now(),
  foreign key(candidate_id,election_id) references public.election_candidates(id,election_id) on delete restrict
);
create index if not exists election_ballots_tally_idx on public.election_ballots(election_id,candidate_id);

create table if not exists public.election_audit_log (
  id bigint generated always as identity primary key,
  election_id uuid not null references public.elections(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.election_objections (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  category text not null check (category in ('eligibility','candidate_review','procedure','accessibility','other')),
  description text not null check (char_length(trim(description)) between 20 and 3000),
  status text not null default 'submitted' check (status in ('submitted','under_review','resolved','dismissed')),
  resolution text check (resolution is null or char_length(resolution)<=2000),
  reviewed_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.elections enable row level security;
alter table public.election_candidates enable row level security;
alter table public.election_eligibility enable row level security;
alter table public.election_voter_receipts enable row level security;
alter table public.election_ballots enable row level security;
alter table public.election_audit_log enable row level security;
alter table public.election_objections enable row level security;
revoke all on public.elections,public.election_candidates,public.election_eligibility,
 public.election_voter_receipts,public.election_ballots,public.election_audit_log,
 public.election_objections from anon,authenticated;

drop policy if exists elections_public_read on public.elections;
create policy elections_public_read on public.elections for select to authenticated
using (stage in ('nominations','review','campaign','voting','counting','objections','certified'));

drop policy if exists election_candidates_public_read on public.election_candidates;
create policy election_candidates_public_read on public.election_candidates for select to authenticated
using (status='approved' and exists(
 select 1 from public.elections e where e.id=election_id
 and e.stage in ('nominations','review','campaign','voting','counting','objections','certified')
));

create or replace function public.create_election(
 p_title text,p_position_label text,p_description text,p_scope text,
 p_school_id uuid,p_district_key text,p_rules_text text,
 p_nominations_open_at timestamptz,p_nominations_close_at timestamptz,
 p_campaign_close_at timestamptz,p_voting_open_at timestamptz,p_voting_close_at timestamptz
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.is_verification_representative() then raise exception 'election_create_forbidden'; end if;
 if p_scope not in ('school','district','city') then raise exception 'invalid_scope'; end if;
 if p_scope='school' and not exists(select 1 from public.schools where id=p_school_id and is_active) then raise exception 'school_not_active'; end if;
 if p_scope='district' and p_district_key not in ('lenin','pervomai','oktyabr','sverdlov') then raise exception 'invalid_district'; end if;
 if p_scope='city' and (p_school_id is not null or p_district_key is not null) then raise exception 'invalid_city_scope'; end if;
 if p_nominations_open_at < now() or not (
 p_nominations_open_at < p_nominations_close_at and p_nominations_close_at <= p_campaign_close_at
 and p_campaign_close_at <= p_voting_open_at and p_voting_open_at < p_voting_close_at
 ) then raise exception 'invalid_election_timeline'; end if;
 insert into public.elections(title,position_label,description,scope,school_id,district_key,rules_text,
 nominations_open_at,nominations_close_at,campaign_close_at,voting_open_at,voting_close_at,created_by)
 values(trim(p_title),trim(p_position_label),coalesce(p_description,''),p_scope,p_school_id,p_district_key,trim(p_rules_text),
 p_nominations_open_at,p_nominations_close_at,p_campaign_close_at,p_voting_open_at,p_voting_close_at,auth.uid())
 returning id into v_id;
 insert into public.election_audit_log(election_id,actor_id,action) values(v_id,auth.uid(),'created');
 return v_id;
end $$;

create or replace function public.set_election_eligibility(p_election_id uuid,p_user_ids uuid[])
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stage text; v_scope text; v_school uuid; v_district text; v_count integer;
begin
 if auth.uid() is null or not public.is_verification_representative() then raise exception 'eligibility_manage_forbidden'; end if;
 if coalesce(array_length(p_user_ids,1),0)>5000 then raise exception 'eligibility_batch_too_large'; end if;
 select stage,scope,school_id,district_key into v_stage,v_scope,v_school,v_district
 from public.elections where id=p_election_id for update;
 if not found or v_stage not in ('draft','nominations') then raise exception 'eligibility_locked'; end if;
 if exists(select 1 from unnest(p_user_ids) x where x is null) then raise exception 'invalid_user_list'; end if;
 if v_scope='school' and exists(
  select 1 from unnest(p_user_ids) x
  left join public.profiles p on p.id=x
  where p.id is null or p.school_id is distinct from v_school
 ) then raise exception 'school_eligibility_mismatch'; end if;
 if v_scope='district' and exists(
  select 1 from unnest(p_user_ids) x
  left join public.profiles p on p.id=x
  left join public.schools s on s.id=p.school_id
  where p.id is null or s.district_key is distinct from v_district
 ) then raise exception 'district_eligibility_mismatch'; end if;
 delete from public.election_eligibility where election_id=p_election_id;
 insert into public.election_eligibility(election_id,user_id,added_by)
 select p_election_id,x,auth.uid() from (select distinct unnest(p_user_ids) x) q;
 get diagnostics v_count=row_count;
 insert into public.election_audit_log(election_id,actor_id,action,details)
 values(p_election_id,auth.uid(),'eligibility_replaced',jsonb_build_object('count',v_count));
 return v_count;
end $$;

create or replace function public.submit_election_candidate(p_election_id uuid,p_display_name text,p_program text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_e public.elections%rowtype; v_school uuid;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into v_e from public.elections where id=p_election_id for update;
 if not found or v_e.stage<>'nominations' or now()<v_e.nominations_open_at or now()>=v_e.nominations_close_at then raise exception 'nominations_closed'; end if;
 select school_id into v_school from public.profiles where id=auth.uid();
 if v_e.scope='school' and v_school is distinct from v_e.school_id then raise exception 'candidate_school_mismatch'; end if;
 if v_e.scope='district' and not exists(select 1 from public.schools s where s.id=v_school and s.district_key=v_e.district_key) then raise exception 'candidate_district_mismatch'; end if;
 if not exists(select 1 from public.election_eligibility where election_id=p_election_id and user_id=auth.uid()) then raise exception 'candidate_not_eligible'; end if;
 insert into public.election_candidates(election_id,user_id,display_name,program)
 values(p_election_id,auth.uid(),trim(p_display_name),trim(p_program)) returning id into v_id;
 insert into public.election_audit_log(election_id,actor_id,action) values(p_election_id,auth.uid(),'candidate_submitted');
 return v_id;
end $$;

create or replace function public.review_election_candidate(p_candidate_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_election uuid;
begin
 if auth.uid() is null or not public.is_verification_representative() then raise exception 'candidate_review_forbidden'; end if;
 if p_decision not in ('approved','rejected') then raise exception 'invalid_decision'; end if;
 select election_id into v_election from public.election_candidates where id=p_candidate_id and status='pending' for update;
 if not found then raise exception 'candidate_not_pending'; end if;
 update public.election_candidates set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),reviewer_note=left(coalesce(p_note,''),500) where id=p_candidate_id;
 insert into public.election_audit_log(election_id,actor_id,action,details)
 values(v_election,auth.uid(),'candidate_reviewed',jsonb_build_object('candidate_id',p_candidate_id,'decision',p_decision));
end $$;

create or replace function public.advance_election_stage(p_election_id uuid,p_next_stage text,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_old text;
begin
 if auth.uid() is null or not public.is_verification_representative() then raise exception 'stage_change_forbidden'; end if;
 if char_length(trim(coalesce(p_reason,'')))<10 then raise exception 'reason_required'; end if;
 select stage into v_old from public.elections where id=p_election_id for update;
 if not found then raise exception 'election_not_found'; end if;
 if not ((v_old='draft' and p_next_stage='nominations')
 or (v_old='nominations' and p_next_stage='review')
 or (v_old='review' and p_next_stage='campaign')
 or (v_old='campaign' and p_next_stage='voting')
 or (v_old='voting' and p_next_stage='counting')
 or (v_old='counting' and p_next_stage='objections')
 or (v_old='objections' and p_next_stage='certified')
 or (v_old in ('draft','nominations','review','campaign','voting') and p_next_stage='cancelled')) then
 raise exception 'invalid_stage_transition';
 end if;
 if p_next_stage='voting' and now()< (select voting_open_at from public.elections where id=p_election_id) then raise exception 'voting_not_started'; end if;
 if p_next_stage='counting' and now()< (select voting_close_at from public.elections where id=p_election_id) then raise exception 'voting_not_closed'; end if;
 update public.elections set stage=p_next_stage,updated_at=now() where id=p_election_id;
 insert into public.election_audit_log(election_id,actor_id,action,details)
 values(p_election_id,auth.uid(),'stage_changed',jsonb_build_object('from',v_old,'to',p_next_stage,'reason',trim(p_reason)));
end $$;

create or replace function public.cast_election_vote(p_election_id uuid,p_candidate_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ballot uuid:=gen_random_uuid(); v_e public.elections%rowtype;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into v_e from public.elections where id=p_election_id for update;
 if not found or v_e.stage<>'voting' or now()<v_e.voting_open_at or now()>=v_e.voting_close_at then raise exception 'voting_closed'; end if;
 if not exists(select 1 from public.election_eligibility where election_id=p_election_id and user_id=auth.uid()) then raise exception 'not_eligible_to_vote'; end if;
 if not exists(select 1 from public.election_candidates where id=p_candidate_id and election_id=p_election_id and status='approved') then raise exception 'candidate_not_approved'; end if;
 insert into public.election_voter_receipts(election_id,user_id,ballot_id) values(p_election_id,auth.uid(),v_ballot);
 insert into public.election_ballots(ballot_id,election_id,candidate_id) values(v_ballot,p_election_id,p_candidate_id);
end $$;

create or replace function public.get_election_results(p_election_id uuid)
returns table(candidate_id uuid,display_name text,vote_count bigint)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.elections where id=p_election_id and stage in ('counting','objections','certified')) then raise exception 'results_not_available'; end if;
 return query select c.id,c.display_name,count(b.ballot_id)
 from public.election_candidates c
 left join public.election_ballots b on b.candidate_id=c.id and b.election_id=p_election_id
 where c.election_id=p_election_id and c.status='approved'
 group by c.id,c.display_name order by count(b.ballot_id) desc,c.display_name;
end $$;

create or replace function public.submit_election_objection(p_election_id uuid,p_category text,p_description text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_stage text;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select stage into v_stage from public.elections where id=p_election_id;
 if v_stage not in ('objections','certified') then raise exception 'objection_window_closed'; end if;
 if not exists(select 1 from public.election_eligibility where election_id=p_election_id and user_id=auth.uid()) then raise exception 'not_eligible'; end if;
 insert into public.election_objections(election_id,submitted_by,category,description)
 values(p_election_id,p_category,trim(p_description)) returning id into v_id;
 insert into public.election_audit_log(election_id,actor_id,action) values(p_election_id,auth.uid(),'objection_submitted');
 return v_id;
end $$;

create or replace function public.get_my_election_receipt(p_election_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.election_voter_receipts where election_id=p_election_id and user_id=auth.uid())
$$;

create or replace function public.get_election_public_candidates(p_election_id uuid)
returns table(id uuid,display_name text,program text,status text)
language sql stable security definer set search_path=public,pg_temp as $$
 select c.id,c.display_name,c.program,c.status from public.election_candidates c
 join public.elections e on e.id=c.election_id
 where c.election_id=p_election_id and c.status='approved'
 and e.stage in ('nominations','review','campaign','voting','counting','objections','certified')
 order by c.submitted_at
$$;

revoke all on function public.create_election(text,text,text,text,uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz) from public,anon;
revoke all on function public.set_election_eligibility(uuid,uuid[]) from public,anon;
revoke all on function public.submit_election_candidate(uuid,text,text) from public,anon;
revoke all on function public.review_election_candidate(uuid,text,text) from public,anon;
revoke all on function public.advance_election_stage(uuid,text,text) from public,anon;
revoke all on function public.cast_election_vote(uuid,uuid) from public,anon;
revoke all on function public.get_election_results(uuid) from public,anon;
revoke all on function public.submit_election_objection(uuid,text,text) from public,anon;
revoke all on function public.get_my_election_receipt(uuid) from public,anon;
revoke all on function public.get_election_public_candidates(uuid) from public,anon;
grant execute on function public.create_election(text,text,text,text,uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz) to authenticated;
grant execute on function public.set_election_eligibility(uuid,uuid[]) to authenticated;
grant execute on function public.submit_election_candidate(uuid,text,text) to authenticated;
grant execute on function public.review_election_candidate(uuid,text,text) to authenticated;
grant execute on function public.advance_election_stage(uuid,text,text) to authenticated;
grant execute on function public.cast_election_vote(uuid,uuid) to authenticated;
grant execute on function public.get_election_results(uuid) to authenticated;
grant execute on function public.submit_election_objection(uuid,text,text) to authenticated;
grant execute on function public.get_my_election_receipt(uuid) to authenticated;
grant execute on function public.get_election_public_candidates(uuid) to authenticated;

comment on table public.election_voter_receipts is 'Private one-account-one-vote receipts. Never expose to clients.';
comment on table public.election_ballots is 'Ballots contain no voter user_id. Access only through aggregate results RPC.';
comment on table public.election_eligibility is 'Private eligibility register; populated only by verified representative.';
