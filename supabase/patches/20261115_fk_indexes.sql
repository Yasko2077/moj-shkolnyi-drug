-- Supporting indexes for existing foreign keys in the verified baseline schema.
-- Apply only after comparing the target database schema with the audit.
create index if not exists event_registrations_user_id_idx
  on public.event_registrations(user_id);

create index if not exists profiles_school_id_idx
  on public.profiles(school_id);

create index if not exists role_assignments_school_id_idx
  on public.role_assignments(school_id);

create index if not exists role_assignments_verified_by_idx
  on public.role_assignments(verified_by);

create index if not exists role_requests_requested_role_key_idx
  on public.role_requests(requested_role_key);

create index if not exists role_requests_reviewed_by_idx
  on public.role_requests(reviewed_by);

create index if not exists role_requests_school_id_idx
  on public.role_requests(school_id);
