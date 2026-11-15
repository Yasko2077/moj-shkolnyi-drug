-- Restrict self-service profile edits so a student cannot assign their own school.
-- School membership remains unassigned until a trusted verification workflow is added.
revoke update on public.profiles from anon, authenticated;
grant update(display_name, preferred_language, grade_label) on public.profiles to authenticated;

comment on column public.profiles.school_id is
'Assigned only through a trusted verification workflow; students cannot self-assign a school.';
