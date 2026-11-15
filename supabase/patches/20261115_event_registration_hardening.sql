-- Security hardening for event registrations.
-- Apply after 20261115_events_cloud.sql and after reviewing the roster-scope patch.
-- Direct table INSERT is disabled: all registrations must pass register_for_event(),
-- which checks authentication, event state, date, capacity and duplicate registration.

drop policy if exists event_registrations_insert_self on public.event_registrations;
drop policy if exists event_registrations_read_owner_or_organizer on public.event_registrations;
drop policy if exists event_registrations_read_self on public.event_registrations;

create policy event_registrations_read_self
on public.event_registrations
for select
to authenticated
using (user_id = (select auth.uid()));

-- Keep the old client-supplied registration RPC disabled. The consent-based profile-backed
-- overload is installed and granted by 20261115_event_registration_consent.sql.
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

-- The legacy client-supplied registration RPC must remain unavailable.
revoke all on function public.register_for_event(uuid,text,text,text,text,text)
  from public, anon, authenticated;

comment on table public.event_registrations is
'Private participant records. Authenticated users may read only their own row; registration is performed through the consent-based register_for_event RPC. Authorized roster access is provided by the separately scoped get_event_roster RPC.';
