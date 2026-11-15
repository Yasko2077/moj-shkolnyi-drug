-- Ынтымак: additive cloud initiatives module for the CURRENT 7-table Supabase schema.
-- This patch intentionally does not create replacement events/registrations/elections tables.
-- Review against the live schema before applying. Test with synthetic accounts only.
-- Requires the existing public.is_verification_representative() helper.
-- No student contact details or incident reports belong in this table.

create table if not exists public.initiatives (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 5 and 120),
  description text not null check (char_length(trim(description)) between 20 and 1200),
  category text not null default 'other' check (char_length(trim(category)) between 1 and 60),
  scope text not null check (scope in ('school','district','city')),
  school_id uuid references public.schools(id) on delete set null,
  district_key text check (district_key is null or district_key in ('lenin','pervomai','oktyabr','sverdlov')),
  target_label text check (target_label is null or char_length(trim(target_label)) <= 120),
  status text not null default 'review' check (status in ('review','published','rejected','completed')),
  moderator_note text check (moderator_note is null or char_length(moderator_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint initiatives_scope_location_check check (
    (scope = 'school' and (school_id is not null or target_label is not null))
    or (scope = 'district' and district_key is not null)
    or (scope = 'city')
  )
);

create index if not exists initiatives_status_created_idx
  on public.initiatives(status, created_at desc);
create index if not exists initiatives_owner_created_idx
  on public.initiatives(created_by, created_at desc);

alter table public.initiatives enable row level security;

drop policy if exists initiatives_read_visible on public.initiatives;
create policy initiatives_read_visible
  on public.initiatives for select to authenticated
  using (
    status in ('published','completed')
    or created_by = (select auth.uid())
    or public.is_verification_representative()
  );

drop policy if exists initiatives_insert_self on public.initiatives;
create policy initiatives_insert_self
  on public.initiatives for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'review'
  );

drop policy if exists initiatives_review_by_verifier on public.initiatives;
create policy initiatives_review_by_verifier
  on public.initiatives for update to authenticated
  using (public.is_verification_representative())
  with check (public.is_verification_representative());

revoke all on public.initiatives from anon, authenticated;
grant select on public.initiatives to authenticated;
grant insert(created_by,title,description,category,scope,school_id,district_key,target_label,status)
  on public.initiatives to authenticated;
grant update(status,moderator_note,updated_at)
  on public.initiatives to authenticated;

comment on table public.initiatives is
  'Internal student proposals for discussion; not legal petitions or incident reports.';
