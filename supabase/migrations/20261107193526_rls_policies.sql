-- Row level security. Every table gets:
--   1. one RESTRICTIVE policy: active account + MFA satisfied (private.access_ok)
--   2. permissive policies describing who may do what.
-- Helper calls are wrapped in (select ...) so Postgres evaluates them once per statement.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
           and tablename not in ('email_outbox', 'mfa_recovery_codes') loop
    execute format(
      'create policy "require active account and mfa" on public.%I as restrictive to authenticated
         using ((select private.access_ok())) with check ((select private.access_ok()))',
      t.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reference data: everyone signed in reads; admins write.
-- ---------------------------------------------------------------------------
create policy "read departments" on public.departments for select to authenticated using (true);
create policy "admins manage departments" on public.departments for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "read terms" on public.terms for select to authenticated using (true);
create policy "admins manage terms" on public.terms for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "read settings" on public.app_settings for select to authenticated using (true);
create policy "admins manage settings" on public.app_settings for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy "read own, related or staff profiles" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or role in ('teacher', 'admin')
    or (select private.is_admin())
    or private.teaches_student(id)
  );
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "admins update any profile" on public.profiles for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Courses, enrollments, modules, materials
-- ---------------------------------------------------------------------------
create policy "read published or related courses" on public.courses for select to authenticated
  using (
    is_published
    or teacher_id = (select auth.uid())
    or id = any ((select private.my_enrolled_courses())::uuid[])
    or (select private.is_admin())
  );
create policy "admins and teachers create courses" on public.courses for insert to authenticated
  with check (
    (select private.is_admin())
    or ((select private.current_app_role()) = 'teacher' and teacher_id = (select auth.uid()))
  );
create policy "manage own or any course" on public.courses for update to authenticated
  using (teacher_id = (select auth.uid()) or (select private.is_admin()))
  with check (teacher_id = (select auth.uid()) or (select private.is_admin()));
create policy "admins delete courses" on public.courses for delete to authenticated
  using ((select private.is_admin()));

create policy "read own or managed enrollments" on public.enrollments for select to authenticated
  using (
    student_id = (select auth.uid())
    or course_id = any ((select private.my_taught_courses())::uuid[])
    or (select private.is_admin())
  );
create policy "teachers and admins manage enrollments" on public.enrollments for all to authenticated
  using (course_id = any ((select private.my_taught_courses())::uuid[]) or (select private.is_admin()))
  with check (course_id = any ((select private.my_taught_courses())::uuid[]) or (select private.is_admin()));

create policy "read modules of visible courses" on public.course_modules for select to authenticated
  using (private.can_view_course(course_id));
create policy "manage modules of own courses" on public.course_modules for all to authenticated
  using (private.can_manage_course(course_id)) with check (private.can_manage_course(course_id));

create policy "read materials of visible courses" on public.materials for select to authenticated
  using (private.can_view_course(course_id));
create policy "manage materials of own courses" on public.materials for all to authenticated
  using (private.can_manage_course(course_id)) with check (private.can_manage_course(course_id));

-- Summaries are written only by the summarize-material edge function (service role).
create policy "read summaries of visible materials" on public.material_summaries for select to authenticated
  using (private.can_view_course(private.material_course(material_id)));

-- ---------------------------------------------------------------------------
-- Assignments, submissions, grades, attendance
-- ---------------------------------------------------------------------------
create policy "read assignments" on public.assignments for select to authenticated
  using (
    private.can_manage_course(course_id)
    or (is_published and course_id = any ((select private.my_enrolled_courses())::uuid[]))
  );
create policy "manage assignments of own courses" on public.assignments for all to authenticated
  using (private.can_manage_course(course_id)) with check (private.can_manage_course(course_id));

create policy "read own or managed submissions" on public.submissions for select to authenticated
  using (
    student_id = (select auth.uid())
    or private.can_manage_course(private.assignment_course(assignment_id))
  );
create policy "students submit to their courses" on public.submissions for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_id and a.is_published
        and a.course_id = any ((select private.my_enrolled_courses())::uuid[])
    )
  );
create policy "students edit own ungraded submission" on public.submissions for update to authenticated
  using (student_id = (select auth.uid()) and status = 'submitted')
  with check (student_id = (select auth.uid()));
create policy "teachers update submissions" on public.submissions for update to authenticated
  using (private.can_manage_course(private.assignment_course(assignment_id)))
  with check (private.can_manage_course(private.assignment_course(assignment_id)));
create policy "teachers delete submissions" on public.submissions for delete to authenticated
  using (private.can_manage_course(private.assignment_course(assignment_id)));

-- A student sees a grade only after the teacher releases it.
create policy "students read released grades" on public.grades for select to authenticated
  using (
    released_at is not null
    and exists (select 1 from public.submissions s where s.id = submission_id and s.student_id = (select auth.uid()))
  );
create policy "teachers manage grades" on public.grades for all to authenticated
  using (private.can_manage_course(private.submission_course(submission_id)))
  with check (private.can_manage_course(private.submission_course(submission_id)));

create policy "read own or managed attendance" on public.attendance for select to authenticated
  using (student_id = (select auth.uid()) or private.can_manage_course(course_id));
create policy "teachers record attendance" on public.attendance for all to authenticated
  using (private.can_manage_course(course_id)) with check (private.can_manage_course(course_id));

-- ---------------------------------------------------------------------------
-- Announcements and notifications
-- ---------------------------------------------------------------------------
create policy "read relevant announcements" on public.announcements for select to authenticated
  using (
    course_id is null
    or private.can_manage_course(course_id)
    or exists (
      select 1 from public.enrollments e
      where e.course_id = announcements.course_id and e.student_id = (select auth.uid())
        and (announcements.section is null or e.section = announcements.section)
    )
  );
create policy "post announcements" on public.announcements for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (course_id is null and (select private.is_admin()))
      or (course_id is not null and private.can_manage_course(course_id))
    )
  );
create policy "delete own announcements" on public.announcements for delete to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin()));

create policy "read own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "mark own notifications" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own notifications" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "read own preferences" on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "insert own preferences" on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "update own preferences" on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Hostel finder (students only, plus admin moderation)
-- ---------------------------------------------------------------------------
create policy "read listings" on public.hostel_profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_admin())
    or (is_active and not removed_by_admin and (select private.current_app_role()) = 'student')
  );
create policy "students create own listing" on public.hostel_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.current_app_role()) = 'student');
create policy "students update own listing" on public.hostel_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "admins moderate listings" on public.hostel_profiles for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "students delete own listing" on public.hostel_profiles for delete to authenticated
  using (user_id = (select auth.uid()));

-- Contact details: owner, an accepted connection, or an admin.
create policy "read contact after connecting" on public.hostel_contacts for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_accepted_connection(user_id)
    or (select private.is_admin())
  );
create policy "manage own contact" on public.hostel_contacts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "manage own shortlist" on public.hostel_shortlists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read own connections" on public.hostel_connections for select to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy "students request connections" on public.hostel_connections for insert to authenticated
  with check (requester_id = (select auth.uid()) and (select private.current_app_role()) = 'student');
create policy "recipient responds" on public.hostel_connections for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy "withdraw own request" on public.hostel_connections for delete to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

create policy "read messages of own connections" on public.hostel_messages for select to authenticated
  using (private.is_connection_party(connection_id, false));
create policy "send messages on accepted connections" on public.hostel_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.is_connection_party(connection_id, true));

create policy "students report listings" on public.hostel_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'pending');
create policy "read own reports or all as admin" on public.hostel_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));
create policy "admins resolve reports" on public.hostel_reports for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Audit log: admins read; rows are written by triggers and edge functions.
-- ---------------------------------------------------------------------------
create policy "admins read audit log" on public.audit_logs for select to authenticated
  using ((select private.is_admin()));
