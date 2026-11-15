-- Security hardening for event registrations.
-- Apply after 20261115_events_cloud.sql and after reviewing the roster-scope patch.
-- Direct table INSERT is disabled: all registrations must pass register_for_event(),
-- which checks authentication, event state, date, capacity and duplicate registration.

drop policy if exists event_registrations_insert_self on public.event_registrations;
drop policy if exists event_registrations_read_owner_or_organizer on public.event_registrations;

create policy event_registrations_read_self
on public.event_registrations
for select
to authenticated
using (user_id = (select auth.uid()));

-- The SECURITY DEFINER RPC performs the insert after validating the event and capacity.
revoke all privileges on table public.event_registrations from anon, authenticated;
-- REVOKE on the table does not remove separately granted column-level privileges.
revoke insert (
  event_id,user_id,participant_name,school_label,grade_label,
  participation_format,team_name,public_name_consent,status
) on public.event_registrations from anon, authenticated;
revoke update (
  event_id,user_id,participant_name,school_label,grade_label,
  participation_format,team_name,public_name_consent,status
) on public.event_registrations from anon, authenticated;
grant select on public.event_registrations to authenticated;

-- Disable the broad legacy roster function until the event-UUID scoped replacement is installed.
revoke all on function public.get_event_roster(text) from public, anon, authenticated;

-- Explicitly keep public/anonymous callers out of the registration RPC.
revoke all on function public.register_for_event(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.register_for_event(uuid,text,text,text,text,text) to authenticated;

comment on table public.event_registrations is
'Private participant records. Authenticated users may read only their own row; registration is performed through register_for_event RPC. Authorized roster access is provided by the separately scoped get_event_roster RPC.';
