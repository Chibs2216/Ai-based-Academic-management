-- Access-control helpers (private schema, not exposed over the API), account
-- provisioning from auth.users, and guards on fields users must not change.

-- ---------------------------------------------------------------------------
-- Helpers used by RLS policies. SECURITY DEFINER so they can read the tables
-- they check without recursing into those tables' own policies.
-- ---------------------------------------------------------------------------
create or replace function private.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and status = 'active';
$$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function private.is_teacher_of(p_course uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.courses where id = p_course and teacher_id = auth.uid());
$$;

create or replace function private.is_enrolled(p_course uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.enrollments where course_id = p_course and student_id = auth.uid());
$$;

create or replace function private.can_view_course(p_course uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_admin() or private.is_teacher_of(p_course) or private.is_enrolled(p_course);
$$;

create or replace function private.can_manage_course(p_course uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_admin() or private.is_teacher_of(p_course);
$$;

-- Courses the caller teaches / is enrolled in, as arrays, for fast "= any(...)" policies.
create or replace function private.my_taught_courses()
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(id), '{}') from public.courses where teacher_id = auth.uid();
$$;

create or replace function private.my_enrolled_courses()
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(course_id), '{}') from public.enrollments where student_id = auth.uid();
$$;

create or replace function private.assignment_course(p_assignment uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select course_id from public.assignments where id = p_assignment;
$$;

create or replace function private.submission_course(p_submission uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select a.course_id
  from public.submissions s join public.assignments a on a.id = s.assignment_id
  where s.id = p_submission;
$$;

create or replace function private.material_course(p_material uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select course_id from public.materials where id = p_material;
$$;

-- Students taught by the caller (for teachers reading profiles).
create or replace function private.teaches_student(p_student uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.student_id = p_student and c.teacher_id = auth.uid()
  );
$$;

-- Teachers of the caller's courses (for students reading profiles).
create or replace function private.is_my_teacher(p_teacher uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.student_id = auth.uid() and c.teacher_id = p_teacher
  );
$$;

create or replace function private.has_accepted_connection(p_other uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hostel_connections
    where status = 'accepted'
      and ((requester_id = auth.uid() and recipient_id = p_other)
        or (recipient_id = auth.uid() and requester_id = p_other))
  );
$$;

create or replace function private.is_connection_party(p_connection uuid, p_require_accepted boolean)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hostel_connections
    where id = p_connection
      and (requester_id = auth.uid() or recipient_id = auth.uid())
      and (not p_require_accepted or status = 'accepted')
  );
$$;

create or replace function private.setting_bool(p_key text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_settings where key = p_key), false);
$$;

-- True when the session is allowed to touch data at all:
--   * the account is active, and
--   * MFA is satisfied: aal2, or (no verified factor and MFA not required site-wide).
-- Used by one RESTRICTIVE policy per table, so it applies on top of every other rule.
create or replace function private.access_ok()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
    and (
      coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or (
        not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified')
        and not private.setting_bool('require_mfa')
      )
    );
$$;

create or replace function private.try_uuid(p text)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

create or replace function private.try_inet(p text)
returns inet
language plpgsql immutable
set search_path = ''
as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return btrim(p)::inet;
exception when others then
  return null;
end;
$$;

-- Writes one audit row. Actor defaults to the calling user.
create or replace function private.audit(
  p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb
)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, details, ip)
  values (
    auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb),
    private.try_inet(split_part(coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for', ''), ',', 1))
  );
$$;

-- True for callers that are not an end user: service-role API calls, and direct
-- SQL (migrations, dashboard) where no request JWT exists. Reads the JWT rather
-- than current_user, because inside SECURITY DEFINER code current_user is the owner.
create or replace function private.is_privileged_caller()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role', 'service_role') not in ('authenticated', 'anon');
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Provision a profile for every new auth user.
-- Role, department and institution ID come from app_metadata (only settable
-- server-side), never from user_metadata, so nobody can sign up as an admin.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_dept uuid;
begin
  begin
    v_role := coalesce(nullif(new.raw_app_meta_data ->> 'role', ''), 'student')::public.app_role;
  exception when invalid_text_representation then
    v_role := 'student';
  end;

  select id into v_dept from public.departments
  where code = upper(new.raw_app_meta_data ->> 'department_code');

  insert into public.profiles (id, email, full_name, role, department_id, institution_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_app_meta_data ->> 'full_name', ''),
    v_role,
    v_dept,
    nullif(new.raw_app_meta_data ->> 'institution_id', '')
  );

  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.sync_user_email()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.sync_user_email();

-- ---------------------------------------------------------------------------
-- Field guards
-- ---------------------------------------------------------------------------
-- Users may edit their own name, phone, avatar, locale. Only admins change
-- role, status, department, institution ID or email; nobody demotes the last admin.
create or replace function private.guard_profile_update()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if private.is_privileged_caller() then
    return new;
  end if;

  if not private.is_admin() then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.department_id is distinct from old.department_id
       or new.institution_id is distinct from old.institution_id
       or new.email is distinct from old.email
       or new.id is distinct from old.id then
      raise exception 'Only an administrator can change role, status, department, institution ID or email.'
        using errcode = '42501';
    end if;
  end if;

  if old.role = 'admin' and (new.role <> 'admin' or new.status <> 'active')
     and (select count(*) from public.profiles where role = 'admin' and status = 'active' and id <> old.id) = 0 then
    raise exception 'Cannot remove the last active administrator.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile_update();

-- Teachers may not hand a course to someone else; only admins assign teachers.
create or replace function private.guard_course_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if private.is_privileged_caller() or private.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.teacher_id := auth.uid();
  elsif new.teacher_id is distinct from old.teacher_id then
    raise exception 'Only an administrator can reassign a course.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger courses_guard before insert or update on public.courses
  for each row execute function private.guard_course_write();

-- Students can edit their own submission only until it is graded, and only body/files.
create or replace function private.guard_submission_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_assignment public.assignments%rowtype;
begin
  if private.is_privileged_caller() then
    return new;
  end if;

  select * into v_assignment from public.assignments where id = new.assignment_id;

  if new.student_id = auth.uid() then
    if tg_op = 'INSERT' then
      new.status := 'submitted';
      new.submitted_at := now();
    else
      if old.status <> 'submitted' then
        raise exception 'This submission has already been graded and can no longer be changed.' using errcode = '42501';
      end if;
      if new.status is distinct from old.status
         or new.assignment_id is distinct from old.assignment_id
         or new.student_id is distinct from old.student_id then
        raise exception 'Only the body and files of a submission can be changed.' using errcode = '42501';
      end if;
      new.submitted_at := now();
    end if;

    if not v_assignment.allow_late and v_assignment.due_at is not null and now() > v_assignment.due_at then
      raise exception 'The deadline for this assignment has passed.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger submissions_guard before insert or update on public.submissions
  for each row execute function private.guard_submission_write();

-- Students manage their own hostel listing but cannot undo an admin removal.
create or replace function private.guard_hostel_profile()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if private.is_privileged_caller() or private.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.removed_by_admin := false;
  elsif new.removed_by_admin is distinct from old.removed_by_admin then
    raise exception 'Only an administrator can change a listing''s moderation state.' using errcode = '42501';
  elsif old.removed_by_admin and new.is_active then
    raise exception 'This listing was removed by an administrator.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger hostel_profiles_guard before insert or update on public.hostel_profiles
  for each row execute function private.guard_hostel_profile();

-- Connection lifecycle: requester creates "pending"; only the recipient accepts or declines.
create or replace function private.guard_hostel_connection()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if private.is_privileged_caller() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.requester_id := auth.uid();
    new.status := 'pending';
    new.responded_at := null;
    if not exists (select 1 from public.hostel_profiles
                   where user_id = new.recipient_id and is_active and not removed_by_admin) then
      raise exception 'That student does not have an active roommate listing.' using errcode = 'P0002';
    end if;
  else
    if new.requester_id is distinct from old.requester_id or new.recipient_id is distinct from old.recipient_id then
      raise exception 'Connection participants cannot be changed.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      if auth.uid() <> old.recipient_id or old.status <> 'pending' or new.status = 'pending' then
        raise exception 'Only the recipient can accept or decline a pending request.' using errcode = '42501';
      end if;
      new.responded_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger hostel_connections_guard before insert or update on public.hostel_connections
  for each row execute function private.guard_hostel_connection();
