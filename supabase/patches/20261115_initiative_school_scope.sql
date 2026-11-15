-- Bind school-scoped proposals to the submitter's verified profile school.
-- District/city proposals remain possible without asserting school membership.
drop policy if exists initiatives_insert_self on public.initiatives;
create policy initiatives_insert_self
on public.initiatives for insert to authenticated
with check (
  created_by=(select auth.uid())
  and status='review'
  and (
    (scope='school'
      and school_id is not null
      and exists (
        select 1 from public.profiles p
        where p.id=(select auth.uid()) and p.school_id=initiatives.school_id
      ))
    or (scope='district' and district_key in ('lenin','pervomai','oktyabr','sverdlov') and school_id is null)
    or (scope='city' and school_id is null and district_key is null)
  )
);
