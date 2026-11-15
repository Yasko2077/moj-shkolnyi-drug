-- Role assignments are never directly mutable through the public Data API.
-- RLS remains enabled and the existing SELECT policy limits reads to the row owner
-- or a verified platform representative. Privileged changes use reviewed owner workflows.
revoke all privileges on table public.role_assignments from anon, authenticated;
grant select on table public.role_assignments to authenticated;

comment on table public.role_assignments is
'Privileged role assignments. Direct client INSERT, UPDATE and DELETE are revoked; changes are made only by reviewed privileged workflows.';
