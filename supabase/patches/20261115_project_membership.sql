-- Complete the approved join flow by creating a real project membership.
-- Apply after 20261115_project_lab.sql and 20261115_project_join_review.sql.
create table if not exists public.student_project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.student_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique(project_id,user_id)
);
create index if not exists student_project_members_project_idx
  on public.student_project_members(project_id);

alter table public.student_project_members enable row level security;
drop policy if exists student_project_members_read_private on public.student_project_members;
create policy student_project_members_read_private
on public.student_project_members for select to authenticated
using (
  user_id=(select auth.uid())
  or exists(select 1 from public.student_projects p
    where p.id=project_id and p.created_by=(select auth.uid()))
);

revoke all on public.student_project_members from public, anon, authenticated;
grant select on public.student_project_members to authenticated;

-- Existing project owners become the first member; new owners are added automatically.
insert into public.student_project_members(project_id,user_id)
select p.id,p.created_by from public.student_projects p
on conflict(project_id,user_id) do nothing;

create or replace function public.add_project_owner_as_member()
returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
begin
  insert into public.student_project_members(project_id,user_id)
  values(new.id,new.created_by)
  on conflict(project_id,user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists student_project_owner_membership on public.student_projects;
create trigger student_project_owner_membership
after insert on public.student_projects
for each row execute function public.add_project_owner_as_member();

create or replace function public.review_project_join_request(
  p_request_id uuid,
  p_decision text
) returns void
language plpgsql security definer
set search_path=public,pg_temp as $$
declare
  v_project_id uuid;
  v_user_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_decision not in ('accepted','declined') then raise exception 'invalid_decision'; end if;

  select r.project_id,r.user_id into v_project_id,v_user_id
  from public.project_join_requests r
  where r.id=p_request_id and r.status='pending'
  for update;

  if not found then raise exception 'request_not_pending'; end if;
  if not exists(select 1 from public.student_projects p
    where p.id=v_project_id and p.created_by=auth.uid()) then
    raise exception 'project_owner_only';
  end if;

  update public.project_join_requests
  set status=p_decision,updated_at=now()
  where id=p_request_id and status='pending';

  if p_decision='accepted' then
    insert into public.student_project_members(project_id,user_id)
    values(v_project_id,v_user_id)
    on conflict(project_id,user_id) do nothing;
  end if;
end;
$$;
revoke all on function public.review_project_join_request(uuid,text) from public,anon;
grant execute on function public.review_project_join_request(uuid,text) to authenticated;

create or replace function public.get_project_member_counts()
returns table(project_id uuid,member_count bigint)
language sql stable security definer
set search_path=public,pg_temp as $$
  select p.id,count(m.user_id)
  from public.student_projects p
  left join public.student_project_members m on m.project_id=p.id
  where auth.uid() is not null
    and (p.status in ('published','completed') or p.created_by=auth.uid())
  group by p.id
$$;
revoke all on function public.get_project_member_counts() from public,anon;
grant execute on function public.get_project_member_counts() to authenticated;

comment on table public.student_project_members is
'Private project membership identities; clients receive only aggregate member counts except project owners may read membership rows.';
