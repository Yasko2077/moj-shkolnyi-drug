-- Ынтымак: project lab module, additive and disabled until reviewed.
-- Projects are moderated before publication. Join requests are private to requester and project owner.
-- Apply only in a test project with synthetic accounts after adult project-owner approval.

create table if not exists public.student_projects (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 5 and 100),
  description text not null check (char_length(trim(description)) between 20 and 900),
  category text not null check (char_length(trim(category)) between 1 and 60),
  scope text not null check (scope in ('school','district','city')),
  target_label text not null check (char_length(trim(target_label)) between 2 and 120),
  district_key text check (district_key is null or district_key in ('lenin','pervomai','oktyabr','sverdlov')),
  first_task text not null check (char_length(trim(first_task)) between 3 and 140),
  status text not null default 'review' check (status in ('review','published','rejected','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.student_projects(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 160),
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.project_join_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.student_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text check (message is null or char_length(message) <= 300),
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,user_id)
);

create index if not exists student_projects_status_created_idx on public.student_projects(status,created_at desc);
create index if not exists project_tasks_project_order_idx on public.project_tasks(project_id,sort_order);
create index if not exists project_join_requests_project_idx on public.project_join_requests(project_id,status);

alter table public.student_projects enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_join_requests enable row level security;

drop policy if exists student_projects_read on public.student_projects;
create policy student_projects_read on public.student_projects for select to authenticated
using (status in ('published','completed') or created_by=(select auth.uid()) or public.is_verification_representative());

drop policy if exists student_projects_insert_self on public.student_projects;
create policy student_projects_insert_self on public.student_projects for insert to authenticated
with check (created_by=(select auth.uid()) and status='review');

drop policy if exists student_projects_review on public.student_projects;
create policy student_projects_review on public.student_projects for update to authenticated
using (public.is_verification_representative()) with check (public.is_verification_representative());

drop policy if exists project_tasks_read on public.project_tasks;
create policy project_tasks_read on public.project_tasks for select to authenticated
using (
  exists(select 1 from public.student_projects p where p.id=project_id
    and (p.status in ('published','completed') or p.created_by=(select auth.uid()) or public.is_verification_representative()))
);

drop policy if exists project_tasks_insert_owner on public.project_tasks;
create policy project_tasks_insert_owner on public.project_tasks for insert to authenticated
with check (exists(select 1 from public.student_projects p where p.id=project_id and p.created_by=(select auth.uid())));

drop policy if exists project_tasks_update_owner on public.project_tasks;
create policy project_tasks_update_owner on public.project_tasks for update to authenticated
using (exists(select 1 from public.student_projects p where p.id=project_id and p.created_by=(select auth.uid())))
with check (exists(select 1 from public.student_projects p where p.id=project_id and p.created_by=(select auth.uid())));

drop policy if exists project_join_requests_read_private on public.project_join_requests;
create policy project_join_requests_read_private on public.project_join_requests for select to authenticated
using (
  user_id=(select auth.uid())
  or exists(select 1 from public.student_projects p where p.id=project_id and p.created_by=(select auth.uid()))
  or public.is_verification_representative()
);

drop policy if exists project_join_requests_insert_self on public.project_join_requests;
create policy project_join_requests_insert_self on public.project_join_requests for insert to authenticated
with check (
  user_id=(select auth.uid()) and status='pending'
  and exists(select 1 from public.student_projects p where p.id=project_id and p.status='published')
);

drop policy if exists project_join_requests_update_owner_or_self on public.project_join_requests;
drop policy if exists project_join_requests_withdraw_self on public.project_join_requests;
create policy project_join_requests_withdraw_self on public.project_join_requests for update to authenticated
using (user_id=(select auth.uid()) and status='pending')
with check (user_id=(select auth.uid()) and status='withdrawn');

drop policy if exists project_join_requests_review_owner on public.project_join_requests;
create policy project_join_requests_review_owner on public.project_join_requests for update to authenticated
using (exists(select 1 from public.student_projects p where p.id=project_id and p.created_by=(select auth.uid())))
with check (exists(select 1 from public.student_projects p where p.id=project_id and p.created_by=(select auth.uid())));

revoke all on public.student_projects, public.project_tasks, public.project_join_requests from anon, authenticated;
grant select on public.student_projects, public.project_tasks, public.project_join_requests to authenticated;
grant insert(created_by,title,description,category,scope,target_label,district_key,first_task,status)
  on public.student_projects to authenticated;
grant update(status,updated_at) on public.student_projects to authenticated;
grant insert(project_id,title,sort_order,is_done) on public.project_tasks to authenticated;
grant update(title,sort_order,is_done) on public.project_tasks to authenticated;
grant insert(project_id,user_id,message,status) on public.project_join_requests to authenticated;
grant update(status,updated_at) on public.project_join_requests to authenticated;

comment on table public.student_projects is 'Student project proposals; moderated before publication.';
comment on table public.project_tasks is 'Simple task list managed by project owner.';
comment on table public.project_join_requests is 'Private requests to join a published student project.';
