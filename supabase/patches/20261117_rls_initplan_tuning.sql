-- Reduce repeated per-row evaluation in policies on the current core schema.
-- Apply after the base schema is reconciled; safe for the known policies in this project.
-- This migration changes policy expressions only; it does not change table data or grants.

drop policy if exists profiles_select_self_or_verifier on public.profiles;
create policy profiles_select_self_or_verifier
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select public.is_verification_representative())
);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists role_requests_insert_self on public.role_requests;
create policy role_requests_insert_self
on public.role_requests
for insert
to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists role_requests_select_owner_or_verifier on public.role_requests;
create policy role_requests_select_owner_or_verifier
on public.role_requests
for select
to authenticated
using (
  submitted_by = (select auth.uid())
  or (select public.is_verification_representative())
);

drop policy if exists role_assignments_select_owner_or_verifier on public.role_assignments;
create policy role_assignments_select_owner_or_verifier
on public.role_assignments
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_verification_representative())
);

-- Event registration self-read was already converted to (select auth.uid())
-- by 20261115_events_cloud.sql / 20261115_event_registration_hardening.sql.
