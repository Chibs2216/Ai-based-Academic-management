-- Grading scale, results view, notification/audit triggers and API functions (RPCs).

-- ---------------------------------------------------------------------------
-- Grading scale (UGC Bangladesh uniform grading)
-- ---------------------------------------------------------------------------
create or replace function public.letter_grade(p_pct numeric)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when p_pct is null then null
    when p_pct >= 80 then 'A+' when p_pct >= 75 then 'A'  when p_pct >= 70 then 'A-'
    when p_pct >= 65 then 'B+' when p_pct >= 60 then 'B'  when p_pct >= 55 then 'B-'
    when p_pct >= 50 then 'C+' when p_pct >= 45 then 'C'  when p_pct >= 40 then 'D'
    else 'F' end;
$$;

create or replace function public.grade_point(p_pct numeric)
returns numeric
language sql immutable
set search_path = ''
as $$
  select case
    when p_pct is null then null
    when p_pct >= 80 then 4.00 when p_pct >= 75 then 3.75 when p_pct >= 70 then 3.50
    when p_pct >= 65 then 3.25 when p_pct >= 60 then 3.00 when p_pct >= 55 then 2.75
    when p_pct >= 50 then 2.50 when p_pct >= 45 then 2.25 when p_pct >= 40 then 2.00
    else 0.00 end;
$$;

-- Per student, per course result from RELEASED grades only. Respects RLS of the caller.
create view public.course_results
with (security_invoker = true) as
select
  e.student_id,
  e.course_id,
  e.section,
  c.code,
  c.title,
  c.credits,
  c.term_id,
  t.name      as term_name,
  t.starts_on as term_starts_on,
  r.earned,
  r.possible,
  coalesce(r.graded_items, 0) as graded_items,
  round(100 * r.earned / nullif(r.possible, 0), 2)                     as percentage,
  public.letter_grade(round(100 * r.earned / nullif(r.possible, 0), 2)) as letter,
  public.grade_point(round(100 * r.earned / nullif(r.possible, 0), 2))  as grade_point
from public.enrollments e
join public.courses c on c.id = e.course_id
left join public.terms t on t.id = c.term_id
left join lateral (
  select sum(g.score) as earned, sum(a.max_points) as possible, count(*) as graded_items
  from public.assignments a
  join public.submissions s on s.assignment_id = a.id and s.student_id = e.student_id
  join public.grades g on g.submission_id = s.id and g.released_at is not null
  where a.course_id = e.course_id
) r on true;

-- ---------------------------------------------------------------------------
-- Notification helpers
-- ---------------------------------------------------------------------------
create or replace function private.notify(
  p_user uuid, p_type public.notification_type, p_title text, p_body text default '',
  p_link text default null, p_email boolean default false
)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, link, email)
  values (p_user, p_type, p_title, coalesce(p_body, ''), p_link, p_email);
$$;

-- Queue an email copy when the producer asked for one and the user's preferences allow it.
create or replace function private.queue_notification_email()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text;
  v_allowed boolean;
begin
  if not new.email then
    return new;
  end if;

  select p.email,
         case new.type
           when 'grades'        then coalesce(np.email_grades, true)
           when 'announcements' then coalesce(np.email_announcements, true)
           when 'hostel'        then coalesce(np.email_hostel, false)
           else                      coalesce(np.email_system, false)
         end
    into v_email, v_allowed
  from public.profiles p
  left join public.notification_preferences np on np.user_id = p.id
  where p.id = new.user_id and p.status = 'active';

  if v_allowed and coalesce(v_email, '') <> '' then
    insert into public.email_outbox (user_id, notification_id, to_email, subject, body)
    values (new.user_id, new.id, v_email, '[UniBook] ' || new.title, new.body);
  end if;
  return new;
end;
$$;

create trigger notifications_queue_email after insert on public.notifications
  for each row execute function private.queue_notification_email();

-- ---------------------------------------------------------------------------
-- Coursework triggers
-- ---------------------------------------------------------------------------
create or replace function private.on_assignment_published()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_course public.courses%rowtype;
begin
  if not new.is_published or (tg_op = 'UPDATE' and old.is_published) then
    return new;
  end if;
  select * into v_course from public.courses where id = new.course_id;
  insert into public.notifications (user_id, type, title, body, link, email)
  select e.student_id, 'announcements',
         'New ' || new.kind::text || ' in ' || v_course.code || ': ' || new.title,
         case when new.due_at is not null
              then 'Due ' || to_char(new.due_at at time zone 'Asia/Dhaka', 'Dy DD Mon YYYY, HH24:MI')
              else '' end,
         '/assignments/' || new.id, false
  from public.enrollments e where e.course_id = new.course_id;
  return new;
end;
$$;

create trigger assignments_notify after insert or update of is_published on public.assignments
  for each row execute function private.on_assignment_published();

create or replace function private.on_material_added()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_code text;
begin
  select code into v_code from public.courses where id = new.course_id;
  insert into public.notifications (user_id, type, title, body, link)
  select e.student_id, 'announcements', 'New material in ' || v_code, new.title,
         '/courses/' || new.course_id || '/materials/' || new.id
  from public.enrollments e where e.course_id = new.course_id;
  return new;
end;
$$;

create trigger materials_notify after insert on public.materials
  for each row execute function private.on_material_added();

create or replace function private.on_submission_created()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_teacher uuid;
  v_title text;
  v_code text;
  v_student text;
begin
  select c.teacher_id, a.title, c.code into v_teacher, v_title, v_code
  from public.assignments a join public.courses c on c.id = a.course_id
  where a.id = new.assignment_id;
  select coalesce(nullif(full_name, ''), email) into v_student from public.profiles where id = new.student_id;

  if v_teacher is not null then
    perform private.notify(v_teacher, 'grades', v_student || ' submitted ' || v_title,
                           v_code, '/grading/' || new.id, false);
  end if;
  return new;
end;
$$;

create trigger submissions_notify after insert on public.submissions
  for each row execute function private.on_submission_created();

-- Keep submission.status in step with its grade, and tell the student on release.
create or replace function private.on_grade_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_sub public.submissions%rowtype;
  v_assignment public.assignments%rowtype;
  v_code text;
begin
  if tg_op = 'DELETE' then
    update public.submissions set status = 'submitted' where id = old.submission_id;
    return old;
  end if;

  select * into v_sub from public.submissions where id = new.submission_id;
  select * into v_assignment from public.assignments where id = v_sub.assignment_id;
  select code into v_code from public.courses where id = v_assignment.course_id;

  if new.score > v_assignment.max_points then
    raise exception 'Score % is higher than the maximum of % points.', new.score, v_assignment.max_points
      using errcode = '22003';
  end if;

  update public.submissions
     set status = case when new.released_at is not null then 'returned' else 'graded' end::public.submission_status
   where id = new.submission_id;

  if new.released_at is not null and (tg_op = 'INSERT' or old.released_at is null) then
    perform private.notify(
      v_sub.student_id, 'grades',
      'Grade released: ' || v_assignment.title,
      v_code || ' - ' || trim(to_char(new.score, 'FM9999990.##')) || ' / ' ||
        trim(to_char(v_assignment.max_points, 'FM9999990.##')),
      '/assignments/' || v_assignment.id, true);
    perform private.audit('grade.released', 'submission', new.submission_id::text,
      jsonb_build_object('assignment_id', v_assignment.id, 'student_id', v_sub.student_id, 'score', new.score));
  end if;
  return new;
end;
$$;

create trigger grades_sync after insert or update or delete on public.grades
  for each row execute function private.on_grade_change();

-- ---------------------------------------------------------------------------
-- Announcements, enrollment
-- ---------------------------------------------------------------------------
create or replace function private.on_announcement_created()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_code text;
begin
  if new.course_id is null then
    insert into public.notifications (user_id, type, title, body, link, email)
    select p.id, 'announcements', new.title, left(new.body, 500), '/announcements/' || new.id, new.send_email
    from public.profiles p where p.status = 'active' and p.id <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000');
  else
    select code into v_code from public.courses where id = new.course_id;
    insert into public.notifications (user_id, type, title, body, link, email)
    select e.student_id, 'announcements', v_code || ': ' || new.title, left(new.body, 500),
           '/announcements/' || new.id, new.send_email
    from public.enrollments e
    where e.course_id = new.course_id and (new.section is null or e.section = new.section);
  end if;
  return new;
end;
$$;

create trigger announcements_notify after insert on public.announcements
  for each row execute function private.on_announcement_created();

create or replace function private.on_enrolled()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_course public.courses%rowtype;
begin
  select * into v_course from public.courses where id = new.course_id;
  perform private.notify(new.student_id, 'system', 'You were enrolled in ' || v_course.code,
                         v_course.title || ' (section ' || new.section || ')', '/courses/' || new.course_id, false);
  return new;
end;
$$;

create trigger enrollments_notify after insert on public.enrollments
  for each row execute function private.on_enrolled();

-- ---------------------------------------------------------------------------
-- Hostel triggers
-- ---------------------------------------------------------------------------
create or replace function private.on_hostel_connection()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_name text;
begin
  if tg_op = 'INSERT' then
    select display_name into v_name from public.hostel_profiles where user_id = new.requester_id;
    perform private.notify(new.recipient_id, 'hostel',
      coalesce(v_name, 'A student') || ' wants to connect as roommates',
      coalesce(new.message, ''), '/roommate/connections', true);
  elsif new.status is distinct from old.status and new.status = 'accepted' then
    select display_name into v_name from public.hostel_profiles where user_id = new.recipient_id;
    perform private.notify(new.requester_id, 'hostel',
      coalesce(v_name, 'A student') || ' accepted your roommate request',
      'You can now see their contact details and message them.', '/roommate/connections', true);
  end if;
  return new;
end;
$$;

create trigger hostel_connections_notify after insert or update of status on public.hostel_connections
  for each row execute function private.on_hostel_connection();

create or replace function private.on_hostel_message()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_other uuid;
  v_name text;
begin
  select case when requester_id = new.sender_id then recipient_id else requester_id end
    into v_other from public.hostel_connections where id = new.connection_id;
  select display_name into v_name from public.hostel_profiles where user_id = new.sender_id;
  perform private.notify(v_other, 'hostel', 'New message from ' || coalesce(v_name, 'your match'),
                         left(new.body, 140), '/roommate/connections/' || new.connection_id, false);
  return new;
end;
$$;

create trigger hostel_messages_notify after insert on public.hostel_messages
  for each row execute function private.on_hostel_message();

create or replace function private.on_hostel_report()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, type, title, body, link)
    select p.id, 'hostel', 'Roommate listing reported', new.reason, '/moderation'
    from public.profiles p where p.role = 'admin' and p.status = 'active';
  elsif new.status is distinct from old.status and new.status <> 'pending' then
    if new.reporter_id is not null then
      perform private.notify(new.reporter_id, 'hostel', 'Your report has been reviewed',
        case new.status when 'actioned' then 'The listing was removed.' else 'No action was needed.' end,
        null, false);
    end if;
    perform private.audit('hostel.report_' || new.status::text, 'hostel_report', new.id::text,
      jsonb_build_object('reported_user_id', new.reported_user_id, 'note', new.resolution_note));
  end if;
  return new;
end;
$$;

create trigger hostel_reports_notify after insert or update of status on public.hostel_reports
  for each row execute function private.on_hostel_report();

-- ---------------------------------------------------------------------------
-- Audit triggers for administrative changes
-- ---------------------------------------------------------------------------
create or replace function private.audit_profile_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    perform private.audit('user.role_changed', 'user', new.id::text,
      jsonb_build_object('from', old.role, 'to', new.role, 'email', new.email));
    perform private.notify(new.id, 'system', 'Your role was changed to ' || new.role::text, '', null, true);
  end if;
  if new.status is distinct from old.status then
    perform private.audit('user.status_changed', 'user', new.id::text,
      jsonb_build_object('from', old.status, 'to', new.status, 'email', new.email));
  end if;
  return new;
end;
$$;

create trigger profiles_audit after update of role, status on public.profiles
  for each row execute function private.audit_profile_change();

create or replace function private.audit_course_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.audit('course.deleted', 'course', old.id::text,
      jsonb_build_object('code', old.code, 'title', old.title));
    return old;
  end if;
  perform private.audit(case tg_op when 'INSERT' then 'course.created' else 'course.updated' end,
    'course', new.id::text,
    jsonb_build_object('code', new.code, 'title', new.title, 'teacher_id', new.teacher_id));
  return new;
end;
$$;

create trigger courses_audit after insert or update or delete on public.courses
  for each row execute function private.audit_course_change();

create or replace function private.audit_setting_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.audit('settings.updated', 'app_setting', new.key,
    jsonb_build_object('from', old.value, 'to', new.value));
  return new;
end;
$$;

create trigger app_settings_audit after update on public.app_settings
  for each row execute function private.audit_setting_change();

-- ---------------------------------------------------------------------------
-- API: account and onboarding
-- ---------------------------------------------------------------------------
-- Works before MFA and for locked accounts, so the frontend can route the user
-- to the right screen (MFA challenge, enrollment, "account locked", onboarding).
create or replace function private.get_my_account()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_factors integer;
begin
  if v_uid is null then
    return null;
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  select count(*) into v_factors from auth.mfa_factors where user_id = v_uid and status = 'verified';

  return jsonb_build_object(
    'id', v_uid,
    'email', v_profile.email,
    'full_name', v_profile.full_name,
    'role', v_profile.role,
    'status', v_profile.status,
    'locale', v_profile.locale,
    'onboarded', v_profile.onboarded_at is not null,
    'mfa', jsonb_build_object(
      'required', private.setting_bool('require_mfa'),
      'enrolled', v_factors > 0,
      'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
      'satisfied', private.access_ok()
    ),
    'maintenance_mode', private.setting_bool('maintenance_mode')
  );
end;
$$;

create or replace function public.get_my_account()
returns jsonb
language sql stable
set search_path = ''
as $$ select private.get_my_account(); $$;

create or replace function public.complete_onboarding(
  p_full_name text, p_phone text default null, p_locale text default 'en'
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'Please enter your full name.' using errcode = '22023';
  end if;
  update public.profiles
     set full_name = btrim(p_full_name), phone = nullif(btrim(p_phone), ''),
         locale = coalesce(p_locale, 'en'), onboarded_at = coalesce(onboarded_at, now())
   where id = auth.uid();
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language sql
set search_path = ''
as $$
  with updated as (
    update public.notifications set read_at = now()
    where user_id = auth.uid() and read_at is null
    returning 1
  )
  select count(*)::integer from updated;
$$;

-- ---------------------------------------------------------------------------
-- API: dashboards and analytics (SECURITY INVOKER, so RLS still applies)
-- ---------------------------------------------------------------------------
create or replace function public.student_dashboard()
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  with results as (
    select * from public.course_results where student_id = v_uid
  ),
  term_gpa as (
    select term_id, term_name, term_starts_on,
           round(sum(grade_point * credits) / nullif(sum(credits), 0), 2) as gpa,
           sum(credits) as credits
    from results where grade_point is not null
    group by term_id, term_name, term_starts_on
  ),
  open_work as (
    select a.id, a.title, a.kind, a.due_at, a.max_points, c.id as course_id, c.code, c.title as course_title
    from public.assignments a
    join public.courses c on c.id = a.course_id
    join public.enrollments e on e.course_id = a.course_id and e.student_id = v_uid
    where a.is_published
      and not exists (select 1 from public.submissions s where s.assignment_id = a.id and s.student_id = v_uid)
  )
  select jsonb_build_object(
    'gpa', (select round(sum(grade_point * credits) / nullif(sum(credits), 0), 2)
            from results where grade_point is not null),
    'current_term_gpa', (select tg.gpa from term_gpa tg join public.terms t on t.id = tg.term_id where t.is_current),
    'credits_completed', (select coalesce(sum(credits), 0) from results where grade_point is not null),
    'gpa_trend', coalesce((select jsonb_agg(jsonb_build_object('term', term_name, 'gpa', gpa, 'credits', credits)
                                            order by term_starts_on) from term_gpa), '[]'::jsonb),
    'attendance_pct', (select round(100.0 * count(*) filter (where status in ('present', 'late')) / nullif(count(*), 0), 1)
                       from public.attendance where student_id = v_uid),
    'courses_count', (select count(*) from public.enrollments where student_id = v_uid),
    'pending_assignments', (select count(*) from open_work),
    'overdue_assignments', (select count(*) from open_work where due_at < now()),
    'unread_notifications', (select count(*) from public.notifications where user_id = v_uid and read_at is null),
    'due_soon', coalesce((
      select jsonb_agg(to_jsonb(w) || jsonb_build_object('overdue', w.due_at < now()) order by w.due_at)
      from (select * from open_work where due_at is not null and due_at > now() - interval '7 days'
            order by due_at limit 8) w), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'course_id', r.course_id, 'code', r.code, 'title', r.title, 'credits', r.credits,
               'term', r.term_name, 'section', r.section, 'percentage', r.percentage,
               'letter', r.letter, 'grade_point', r.grade_point,
               'attendance_pct', (select round(100.0 * count(*) filter (where at.status in ('present', 'late')) / nullif(count(*), 0), 1)
                                  from public.attendance at where at.student_id = v_uid and at.course_id = r.course_id))
             order by r.code)
      from results r), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.teacher_dashboard()
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  with my_courses as (
    select * from public.courses where teacher_id = v_uid
  ),
  pending as (
    select s.id, s.submitted_at, s.student_id, a.id as assignment_id, a.title as assignment, c.id as course_id, c.code
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    join my_courses c on c.id = a.course_id
    where s.status = 'submitted'
  )
  select jsonb_build_object(
    'classes_count', (select count(*) from my_courses),
    'students_count', (select count(distinct e.student_id) from public.enrollments e join my_courses c on c.id = e.course_id),
    'pending_grading', (select count(*) from pending),
    'unreleased_grades', (select count(*) from public.grades g
                          join public.submissions s on s.id = g.submission_id
                          join public.assignments a on a.id = s.assignment_id
                          join my_courses c on c.id = a.course_id
                          where g.released_at is null),
    'announcements_30d', (select count(*) from public.announcements where author_id = v_uid
                          and created_at > now() - interval '30 days'),
    'recent_submissions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'submission_id', p.id, 'student', coalesce(nullif(pr.full_name, ''), pr.email),
               'assignment', p.assignment, 'course_code', p.code, 'submitted_at', p.submitted_at)
             order by p.submitted_at desc)
      from (select * from pending order by submitted_at desc limit 10) p
      join public.profiles pr on pr.id = p.student_id), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'course_id', c.id, 'code', c.code, 'title', c.title,
               'students', (select count(*) from public.enrollments e where e.course_id = c.id),
               'pending_grading', (select count(*) from pending p where p.course_id = c.id))
             order by c.code)
      from my_courses c), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Class-level and per-student analytics for one course (teacher of the course or admin).
-- Teachers see all graded work, released or not.
create or replace function public.course_analytics(p_course uuid)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not private.can_manage_course(p_course) then
    raise exception 'You do not manage this course.' using errcode = '42501';
  end if;

  with roster as (
    select e.student_id, e.section, p.full_name, p.email, p.institution_id
    from public.enrollments e join public.profiles p on p.id = e.student_id
    where e.course_id = p_course
  ),
  work as (
    select a.id as assignment_id, a.title, a.kind, a.due_at, a.max_points,
           s.id as submission_id, s.student_id, s.status, g.score, g.released_at
    from public.assignments a
    left join public.submissions s on s.assignment_id = a.id
    left join public.grades g on g.submission_id = s.id
    where a.course_id = p_course
  ),
  per_student as (
    select r.student_id, r.full_name, r.email, r.institution_id, r.section,
      round(100 * sum(w.score) / nullif(sum(w.max_points) filter (where w.score is not null), 0), 2) as percentage,
      count(w.submission_id) as submitted,
      (select count(*) from public.assignments a
        where a.course_id = p_course and a.is_published and a.due_at < now()
          and not exists (select 1 from public.submissions s where s.assignment_id = a.id and s.student_id = r.student_id)) as missing,
      (select round(100.0 * count(*) filter (where at.status in ('present', 'late')) / nullif(count(*), 0), 1)
         from public.attendance at where at.course_id = p_course and at.student_id = r.student_id) as attendance_pct
    from roster r
    left join work w on w.student_id = r.student_id
    group by r.student_id, r.full_name, r.email, r.institution_id, r.section
  )
  select jsonb_build_object(
    'course_id', p_course,
    'enrolled', (select count(*) from roster),
    'average_pct', (select round(avg(percentage), 2) from per_student),
    'attendance_rate', (select round(100.0 * count(*) filter (where status in ('present', 'late')) / nullif(count(*), 0), 1)
                        from public.attendance where course_id = p_course),
    'submission_rate', (select round(100.0 * count(w.submission_id) /
                          nullif((select count(*) from roster) * (select count(*) from public.assignments
                                  where course_id = p_course and is_published), 0), 1)
                        from work w),
    'grade_distribution', coalesce((
      select jsonb_object_agg(letter, n) from (
        select public.letter_grade(percentage) as letter, count(*) as n
        from per_student where percentage is not null group by 1) d), '{}'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'assignment_id', x.assignment_id, 'title', x.title, 'kind', x.kind, 'due_at', x.due_at,
               'max_points', x.max_points, 'submitted', x.submitted, 'graded', x.graded,
               'released', x.released, 'average_pct', x.average_pct)
             order by x.due_at nulls last)
      from (
        select assignment_id, title, kind, due_at, max_points,
               count(submission_id) as submitted,
               count(score) as graded,
               count(released_at) as released,
               round(100 * avg(score) / max_points, 2) as average_pct
        from work group by assignment_id, title, kind, due_at, max_points
      ) x), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(to_jsonb(ps) || jsonb_build_object('letter', public.letter_grade(ps.percentage))
             order by ps.full_name)
      from per_student ps), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- One student's work in one course (teacher/admin view, or the student themselves).
create or replace function public.student_performance(p_course uuid, p_student uuid)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
begin
  if not (private.can_manage_course(p_course) or p_student = auth.uid()) then
    raise exception 'You cannot view this student''s performance.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'student', (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email,
                                          'institution_id', p.institution_id)
                from public.profiles p where p.id = p_student),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('date', session_date, 'status', status) order by session_date)
                            from public.attendance where course_id = p_course and student_id = p_student), '[]'::jsonb),
    'work', coalesce((
      select jsonb_agg(jsonb_build_object(
               'assignment_id', a.id, 'title', a.title, 'kind', a.kind, 'due_at', a.due_at,
               'max_points', a.max_points, 'submission_id', s.id, 'status', s.status,
               'submitted_at', s.submitted_at, 'score', g.score, 'feedback', g.feedback,
               'released_at', g.released_at)
             order by a.due_at nulls last)
      from public.assignments a
      left join public.submissions s on s.assignment_id = a.id and s.student_id = p_student
      left join public.grades g on g.submission_id = s.id
      where a.course_id = p_course), '[]'::jsonb)
  );
end;
$$;

-- Bulk "return grades": release the given graded submissions to students.
create or replace function public.release_grades(p_submission_ids uuid[])
returns integer
language sql
set search_path = ''
as $$
  with released as (
    update public.grades set released_at = now()
    where submission_id = any (p_submission_ids) and released_at is null
    returning 1
  )
  select count(*)::integer from released;
$$;

create or replace function public.release_assignment_grades(p_assignment uuid)
returns integer
language sql
set search_path = ''
as $$
  with released as (
    update public.grades g set released_at = now()
    from public.submissions s
    where s.id = g.submission_id and s.assignment_id = p_assignment and g.released_at is null
    returning 1
  )
  select count(*)::integer from released;
$$;

-- ---------------------------------------------------------------------------
-- API: hostel finder
-- ---------------------------------------------------------------------------
-- Browse listings with a 0-100 compatibility score against the caller's own listing.
create or replace function public.hostel_matches(
  p_block       text default null,
  p_budget_min  integer default null,
  p_budget_max  integer default null,
  p_lifestyle   public.lifestyle default null,
  p_gender      public.gender default null,
  p_limit       integer default 50
)
returns table (
  user_id uuid, display_name text, gender public.gender, preferred_block text,
  budget_min integer, budget_max integer, lifestyle public.lifestyle,
  sleep_schedule public.sleep_schedule, cleanliness smallint, smoker boolean, bio text,
  compatibility integer, is_shortlisted boolean, connection_status public.connection_status
)
language sql stable
set search_path = ''
as $$
  with me as (
    select hp.* from public.hostel_profiles hp where hp.user_id = auth.uid()
  )
  select
    h.user_id, h.display_name, h.gender, h.preferred_block, h.budget_min, h.budget_max,
    h.lifestyle, h.sleep_schedule, h.cleanliness, h.smoker, h.bio,
    case when m.user_id is null then null else (
        -- budget overlap: 30
        (case when greatest(h.budget_min, m.budget_min) <= least(h.budget_max, m.budget_max) then 30
              else greatest(0, 30 - (greatest(h.budget_min, m.budget_min) - least(h.budget_max, m.budget_max)) / 100) end)
        -- same block: 20
      + (case when h.preferred_block = m.preferred_block then 20 else 0 end)
        -- lifestyle: 20 (balanced is half-compatible with anything)
      + (case when h.lifestyle = m.lifestyle then 20
              when 'balanced' in (h.lifestyle, m.lifestyle) then 10 else 0 end)
        -- sleep schedule: 15
      + (case when h.sleep_schedule = m.sleep_schedule then 15
              when 'flexible' in (h.sleep_schedule, m.sleep_schedule) then 8 else 0 end)
        -- cleanliness: 10
      + (10 - abs(h.cleanliness - m.cleanliness) * 2.5)::integer
        -- smoking: 5
      + (case when h.smoker = m.smoker then 5 else 0 end)
    )::integer end as compatibility,
    exists (select 1 from public.hostel_shortlists s where s.user_id = auth.uid() and s.target_id = h.user_id),
    (select c.status from public.hostel_connections c
      where (c.requester_id = auth.uid() and c.recipient_id = h.user_id)
         or (c.recipient_id = auth.uid() and c.requester_id = h.user_id))
  from public.hostel_profiles h
  left join me m on true
  where h.user_id <> auth.uid()
    and h.is_active and not h.removed_by_admin
    and (p_block is null or h.preferred_block = p_block)
    and (p_budget_min is null or h.budget_max >= p_budget_min)
    and (p_budget_max is null or h.budget_min <= p_budget_max)
    and (p_lifestyle is null or h.lifestyle = p_lifestyle)
    and (p_gender is null or h.gender = p_gender)
  order by compatibility desc nulls last, h.updated_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Admin moderation: dismiss a report, or remove the reported listing.
create or replace function public.resolve_hostel_report(p_report uuid, p_action text, p_note text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare v_report public.hostel_reports%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Only administrators can moderate listings.' using errcode = '42501';
  end if;
  if p_action not in ('dismiss', 'remove_listing') then
    raise exception 'Action must be dismiss or remove_listing.' using errcode = '22023';
  end if;

  select * into v_report from public.hostel_reports where id = p_report;
  if not found then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;

  if p_action = 'remove_listing' then
    update public.hostel_profiles set removed_by_admin = true, is_active = false
     where user_id = v_report.reported_user_id;
    -- Close every other open report on the same listing too.
    update public.hostel_reports
       set status = 'actioned', resolution_note = p_note, resolved_by = auth.uid(), resolved_at = now()
     where reported_user_id = v_report.reported_user_id and status = 'pending';
    perform private.notify(v_report.reported_user_id, 'hostel', 'Your roommate listing was removed',
      coalesce(p_note, 'It was found to break the hostel finder rules.'), '/roommate', true);
  else
    update public.hostel_reports
       set status = 'dismissed', resolution_note = p_note, resolved_by = auth.uid(), resolved_at = now()
     where id = p_report;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- API: admin summary and logs (need auth.* and storage.*, so definer + admin check)
-- ---------------------------------------------------------------------------
create or replace function private.admin_system_summary()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrators only.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'users_by_role', (select coalesce(jsonb_object_agg(role, n), '{}'::jsonb)
                      from (select role, count(*) as n from public.profiles group by role) r),
    'users_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                        from (select status, count(*) as n from public.profiles group by status) s),
    'active_users_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'active_users_24h', (select count(*) from auth.users where last_sign_in_at > now() - interval '24 hours'),
    'mfa_enrolled_users', (select count(distinct user_id) from auth.mfa_factors where status = 'verified'),
    'courses', (select count(*) from public.courses),
    'current_term_courses', (select count(*) from public.courses c join public.terms t on t.id = c.term_id where t.is_current),
    'pending_reports', (select count(*) from public.hostel_reports where status = 'pending'),
    'storage_bytes', (select coalesce(jsonb_object_agg(bucket_id, bytes), '{}'::jsonb) from (
                        select bucket_id, sum(coalesce((metadata ->> 'size')::bigint, 0)) as bytes
                        from storage.objects group by bucket_id) b),
    'email_queue', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                    from (select status, count(*) as n from public.email_outbox group by status) e),
    'recent_errors_24h', (select count(*) from public.email_outbox
                          where status = 'failed' and created_at > now() - interval '24 hours')
                       + (select count(*) from public.audit_logs
                          where action like '%.failed' and created_at > now() - interval '24 hours')
  );
end;
$$;

create or replace function public.admin_system_summary()
returns jsonb
language sql stable
set search_path = ''
as $$ select private.admin_system_summary(); $$;

-- Security & access log: UniBook's own audit trail merged with Supabase Auth events
-- (sign-ins, sign-outs, password resets, MFA changes).
create or replace function private.admin_access_logs(
  p_limit integer, p_before timestamptz, p_action text, p_actor uuid
)
returns table (
  source text, occurred_at timestamptz, actor_id uuid, actor_email text,
  action text, target_type text, target_id text, ip text, details jsonb
)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.is_admin() then
    raise exception 'Administrators only.' using errcode = '42501';
  end if;

  return query
  select * from (
    select 'app'::text, l.created_at, l.actor_id, p.email, l.action, l.target_type, l.target_id,
           host(l.ip)::text, l.details
    from public.audit_logs l
    left join public.profiles p on p.id = l.actor_id
    union all
    select 'auth'::text, a.created_at,
           private.try_uuid(a.payload ->> 'actor_id'),
           a.payload ->> 'actor_username',
           'auth.' || coalesce(a.payload ->> 'action', 'event'),
           'user', a.payload ->> 'actor_id',
           nullif(a.ip_address, '')::text, a.payload::jsonb
    from auth.audit_log_entries a
  ) x (source, occurred_at, actor_id, actor_email, action, target_type, target_id, ip, details)
  where (p_before is null or x.occurred_at < p_before)
    and (p_action is null or x.action ilike '%' || p_action || '%')
    and (p_actor is null or x.actor_id = p_actor)
  order by x.occurred_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create or replace function public.admin_access_logs(
  p_limit integer default 100, p_before timestamptz default null,
  p_action text default null, p_actor uuid default null
)
returns table (
  source text, occurred_at timestamptz, actor_id uuid, actor_email text,
  action text, target_type text, target_id text, ip text, details jsonb
)
language sql stable
set search_path = ''
as $$ select * from private.admin_access_logs(p_limit, p_before, p_action, p_actor); $$;

grant execute on all functions in schema private to authenticated, service_role;

-- Nothing in public is for anonymous visitors: functions are callable only when signed in.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon;
