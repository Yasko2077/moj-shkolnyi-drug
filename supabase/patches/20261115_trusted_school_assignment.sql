-- Trusted school assignment workflow. Only a verified platform representative may assign a school.
-- No student-facing self-service assignment is provided.
create table if not exists public.profile_school_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_school_id uuid references public.schools(id) on delete set null,
  new_school_id uuid references public.schools(id) on delete set null,
  verified_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 8 and 500),
  created_at timestamptz not null default now()
);
alter table public.profile_school_audit enable row level security;
revoke all on public.profile_school_audit from anon,authenticated;
create index if not exists profile_school_audit_user_created_idx
  on public.profile_school_audit(user_id,created_at desc);

create or replace function public.assign_profile_school(
  p_user_id uuid,
  p_school_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_previous uuid;
begin
  if auth.uid() is null or not public.is_verification_representative() then
    raise exception 'school_assignment_forbidden';
  end if;
  if p_user_id is null or p_school_id is null
     or char_length(trim(coalesce(p_reason,''))) not between 8 and 500 then
    raise exception 'invalid_school_assignment';
  end if;
  if not exists(select 1 from public.schools s where s.id=p_school_id and s.is_active=true) then
    raise exception 'school_not_active_or_not_found';
  end if;
  select school_id into v_previous
    from public.profiles where id=p_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;
  if v_previous is not distinct from p_school_id then
    raise exception 'school_already_assigned';
  end if;
  update public.profiles set school_id=p_school_id,updated_at=now()
    where id=p_user_id;
  insert into public.profile_school_audit(user_id,previous_school_id,new_school_id,verified_by,reason)
    values(p_user_id,v_previous,p_school_id,auth.uid(),trim(p_reason));
end;
$$;
revoke all on function public.assign_profile_school(uuid,uuid,text) from public,anon;
grant execute on function public.assign_profile_school(uuid,uuid,text) to authenticated;
comment on function public.assign_profile_school(uuid,uuid,text) is
'Assigns a profile to an active school only for a verified representative and writes a private audit record.';
comment on table public.profile_school_audit is
'Private audit trail for trusted profile-to-school assignments; no direct client access.';
