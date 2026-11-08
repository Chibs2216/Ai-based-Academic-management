-- Performance tuning from the Supabase advisor: one permissive policy per role/action.
-- "for all" write policies are split into insert/update/delete so reads are checked once,
-- and overlapping update policies are merged.

do $$
declare
  r record;
begin
  -- table, old "for all" policy name, write condition
  for r in select * from (values
    ('departments',     'admins manage departments',              '(select private.is_admin())'),
    ('terms',           'admins manage terms',                    '(select private.is_admin())'),
    ('app_settings',    'admins manage settings',                 '(select private.is_admin())'),
    ('enrollments',     'teachers and admins manage enrollments', '(course_id = any ((select private.my_taught_courses())::uuid[]) or (select private.is_admin()))'),
    ('course_modules',  'manage modules of own courses',          'private.can_manage_course(course_id)'),
    ('materials',       'manage materials of own courses',        'private.can_manage_course(course_id)'),
    ('assignments',     'manage assignments of own courses',      'private.can_manage_course(course_id)'),
    ('attendance',      'teachers record attendance',             'private.can_manage_course(course_id)'),
    ('grades',          'teachers manage grades',                 'private.can_manage_course(private.submission_course(submission_id))'),
    ('hostel_contacts', 'manage own contact',                     '(user_id = (select auth.uid()))')
  ) as t (tbl, pol, cond) loop
    execute format('drop policy %I on public.%I', r.pol, r.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                   r.pol || ' (insert)', r.tbl, r.cond);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                   r.pol || ' (update)', r.tbl, r.cond, r.cond);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                   r.pol || ' (delete)', r.tbl, r.cond);
  end loop;
end;
$$;

-- Grades: teachers see everything in their courses; students only their released grades.
drop policy "students read released grades" on public.grades;
create policy "read grades" on public.grades for select to authenticated
  using (
    private.can_manage_course(private.submission_course(submission_id))
    or (released_at is not null
        and exists (select 1 from public.submissions s
                    where s.id = submission_id and s.student_id = (select auth.uid())))
  );

-- Merge overlapping update policies.
drop policy "update own profile" on public.profiles;
drop policy "admins update any profile" on public.profiles;
create policy "update own profile or any as admin" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

drop policy "students update own listing" on public.hostel_profiles;
drop policy "admins moderate listings" on public.hostel_profiles;
create policy "update own listing or moderate as admin" on public.hostel_profiles for update to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()))
  with check (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy "students edit own ungraded submission" on public.submissions;
drop policy "teachers update submissions" on public.submissions;
create policy "update own ungraded or managed submissions" on public.submissions for update to authenticated
  using ((student_id = (select auth.uid()) and status = 'submitted')
         or private.can_manage_course(private.assignment_course(assignment_id)))
  with check (student_id = (select auth.uid())
              or private.can_manage_course(private.assignment_course(assignment_id)));
