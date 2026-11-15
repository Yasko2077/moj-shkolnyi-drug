-- Secure project join-request state transitions.
-- Apply after 20261115_project_lab.sql. Decisions are restricted to the project owner.
create or replace function public.review_project_join_request(
  p_request_id uuid,
  p_decision text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $review$
declare
  v_project_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_decision not in ('accepted','declined') then raise exception 'invalid_decision'; end if;

  select r.project_id into v_project_id
  from public.project_join_requests r
  where r.id = p_request_id and r.status = 'pending'
  for update;

  if not found then raise exception 'request_not_pending'; end if;
  if not exists (
    select 1 from public.student_projects p
    where p.id = v_project_id and p.created_by = auth.uid()
  ) then raise exception 'project_owner_only'; end if;

  update public.project_join_requests
  set status = p_decision, updated_at = now()
  where id = p_request_id and status = 'pending';
end;
$review$;

create or replace function public.withdraw_project_join_request(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $withdraw$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.project_join_requests
  set status = 'withdrawn', updated_at = now()
  where id = p_request_id
    and user_id = auth.uid()
    and status = 'pending';
  if not found then raise exception 'request_not_withdrawable'; end if;
end;
$withdraw$;

-- Prevent direct status edits that could bypass the two transition checks.
revoke insert, update, delete on public.project_join_requests from anon, authenticated;
grant select on public.project_join_requests to authenticated;
grant insert(project_id,user_id,message,status) on public.project_join_requests to authenticated;
revoke all on function public.review_project_join_request(uuid,text) from public, anon;
grant execute on function public.review_project_join_request(uuid,text) to authenticated;
revoke all on function public.withdraw_project_join_request(uuid) from public, anon;
grant execute on function public.withdraw_project_join_request(uuid) to authenticated;

comment on function public.review_project_join_request(uuid,text) is
'Only the owner of the target project may accept or decline a pending join request.';
comment on function public.withdraw_project_join_request(uuid) is
'A student may withdraw only their own pending project join request.';
