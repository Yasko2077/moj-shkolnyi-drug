-- Run only on an isolated staging database after applying the reviewed migrations.
-- This script reads ACL metadata only. It does not inspect student rows or change schema/data.
do $verify$
begin
  if to_regclass('public.event_registrations') is null then
    raise exception 'missing_table:event_registrations';
  end if;
  if has_column_privilege('authenticated','public.event_registrations','user_id','INSERT')
     or has_column_privilege('authenticated','public.event_registrations','event_id','INSERT')
     or has_column_privilege('authenticated','public.event_registrations','user_id','UPDATE') then
    raise exception 'event_registration_direct_write_still_allowed';
  end if;

  if to_regprocedure('public.get_event_roster(text)') is not null
     and has_function_privilege('authenticated',to_regprocedure('public.get_event_roster(text)'),'EXECUTE') then
    raise exception 'legacy_unscoped_event_roster_still_executable';
  end if;
  if to_regprocedure('public.get_event_roster(uuid)') is null
     or not has_function_privilege('authenticated',to_regprocedure('public.get_event_roster(uuid)'),'EXECUTE') then
    raise exception 'scoped_event_roster_rpc_missing_or_not_granted';
  end if;

  if to_regprocedure('public.register_for_event(uuid,boolean)') is null
     or not has_function_privilege('authenticated',to_regprocedure('public.register_for_event(uuid,boolean)'),'EXECUTE') then
    raise exception 'consent_registration_rpc_missing_or_not_granted';
  end if;
  if to_regprocedure('public.register_for_event(uuid,text,text,text,text,text)') is not null
     and has_function_privilege('authenticated',to_regprocedure('public.register_for_event(uuid,text,text,text,text,text)'),'EXECUTE') then
    raise exception 'legacy_unconsented_registration_rpc_still_executable';
  end if;

  if to_regclass('public.news_posts') is null
     or has_column_privilege('authenticated','public.news_posts','title','INSERT')
     or has_column_privilege('authenticated','public.news_posts','is_published','UPDATE') then
    raise exception 'news_direct_write_still_allowed_or_table_missing';
  end if;
  if to_regprocedure('public.publish_news_post(text,text,text)') is null
     or not has_function_privilege('authenticated',to_regprocedure('public.publish_news_post(text,text,text)'),'EXECUTE') then
    raise exception 'atomic_news_publish_rpc_missing_or_not_granted';
  end if;

  if to_regclass('public.poll_options') is null
     or has_column_privilege('authenticated','public.poll_options','label','INSERT')
     or has_column_privilege('authenticated','public.poll_options','label','UPDATE') then
    raise exception 'poll_option_direct_write_still_allowed_or_table_missing';
  end if;


  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles'
      and policyname='profiles_select_self_or_verifier'
      and lower(coalesce(qual,'')) like '%auth.uid%' and lower(coalesce(qual,'')) like '%select%'
      and lower(coalesce(qual,'')) like '%is_verification_representative%' and lower(coalesce(qual,'')) like '%select%'
  ) then raise exception 'profiles_select_policy_initplan_missing'; end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles'
      and policyname='profiles_update_self'
      and lower(coalesce(qual,'')) like '%auth.uid%' and lower(coalesce(qual,'')) like '%select%'
      and lower(coalesce(with_check,'')) like '%auth.uid%' and lower(coalesce(with_check,'')) like '%select%'
  ) then raise exception 'profiles_update_policy_initplan_missing'; end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='role_requests'
      and policyname='role_requests_insert_self'
      and lower(coalesce(with_check,'')) like '%auth.uid%' and lower(coalesce(with_check,'')) like '%select%'
  ) then raise exception 'role_requests_insert_policy_initplan_missing'; end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='role_requests'
      and policyname='role_requests_select_owner_or_verifier'
      and lower(coalesce(qual,'')) like '%auth.uid%' and lower(coalesce(qual,'')) like '%select%'
      and lower(coalesce(qual,'')) like '%is_verification_representative%' and lower(coalesce(qual,'')) like '%select%'
  ) then raise exception 'role_requests_select_policy_initplan_missing'; end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='role_assignments'
      and policyname='role_assignments_select_owner_or_verifier'
      and lower(coalesce(qual,'')) like '%auth.uid%' and lower(coalesce(qual,'')) like '%select%'
      and lower(coalesce(qual,'')) like '%is_verification_representative%' and lower(coalesce(qual,'')) like '%select%'
  ) then raise exception 'role_assignments_select_policy_initplan_missing'; end if;

  if to_regclass('public.project_join_requests') is null
     or has_column_privilege('authenticated','public.project_join_requests','status','UPDATE')
     or has_column_privilege('authenticated','public.project_join_requests','updated_at','UPDATE') then
    raise exception 'project_join_request_direct_status_update_still_allowed_or_table_missing';
  end if;

  if not has_column_privilege('authenticated','public.profiles','display_name','UPDATE')
     or not has_column_privilege('authenticated','public.profiles','preferred_language','UPDATE')
     or not has_column_privilege('authenticated','public.profiles','grade_label','UPDATE')
     or has_column_privilege('authenticated','public.profiles','school_id','UPDATE')
     or has_column_privilege('authenticated','public.profiles','id','UPDATE') then
    raise exception 'profile_update_allowlist_invalid';
  end if;
end;
$verify$;

select
  'event_registration_direct_write' as check_name,
  not has_column_privilege('authenticated','public.event_registrations','user_id','INSERT') as passed
union all
select
  'legacy_roster_not_executable',
  to_regprocedure('public.get_event_roster(text)') is null
    or not has_function_privilege('authenticated',to_regprocedure('public.get_event_roster(text)'),'EXECUTE')
union all
select
  'scoped_roster_rpc_available',
  to_regprocedure('public.get_event_roster(uuid)') is not null
    and has_function_privilege('authenticated',to_regprocedure('public.get_event_roster(uuid)'),'EXECUTE')
union all
select
  'news_write_rpc_only',
  not has_column_privilege('authenticated','public.news_posts','title','INSERT')
union all
select
  'poll_options_rpc_only',
  not has_column_privilege('authenticated','public.poll_options','label','INSERT')
union all
select
  'profile_school_locked',
  not has_column_privilege('authenticated','public.profiles','school_id','UPDATE')
union all
select
  'project_join_request_rpc_only',
  not has_column_privilege('authenticated','public.project_join_requests','status','UPDATE')
    and not has_column_privilege('authenticated','public.project_join_requests','updated_at','UPDATE');
