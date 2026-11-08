-- UniBook core schema: reference data, people, courses, coursework, attendance,
-- communication, hostel finder, security and settings.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role          as enum ('student', 'teacher', 'admin');
create type public.account_status    as enum ('active', 'inactive', 'locked');
create type public.assignment_kind   as enum ('assignment', 'quiz', 'lab', 'exam', 'project');
create type public.submission_status as enum ('submitted', 'graded', 'returned');
create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');
create type public.notification_type as enum ('grades', 'announcements', 'hostel', 'system');
create type public.material_kind     as enum ('pdf', 'document', 'video', 'link', 'text', 'other');
create type public.summary_length    as enum ('short', 'detailed');
create type public.connection_status as enum ('pending', 'accepted', 'declined');
create type public.report_status     as enum ('pending', 'dismissed', 'actioned');
create type public.lifestyle         as enum ('quiet', 'social', 'balanced');
create type public.sleep_schedule    as enum ('early', 'flexible', 'late');
create type public.contact_method    as enum ('email', 'phone', 'in_app');
create type public.gender            as enum ('male', 'female', 'other', 'prefer_not_to_say');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z]{2,10}$'),
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.terms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  starts_on  date not null,
  ends_on    date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on)
);
create unique index terms_single_current on public.terms (is_current) where is_current;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  full_name      text not null default '',
  role           public.app_role not null default 'student',
  status         public.account_status not null default 'active',
  department_id  uuid references public.departments (id) on delete set null,
  institution_id text unique,
  phone          text,
  avatar_path    text,
  locale         text not null default 'en' check (locale in ('en', 'bn')),
  onboarded_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create index profiles_department_idx on public.profiles (department_id);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Courses and materials
-- ---------------------------------------------------------------------------
create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,
  title         text not null,
  description   text not null default '',
  syllabus      text not null default '',
  credits       numeric(3, 1) not null default 3 check (credits > 0 and credits <= 6),
  department_id uuid references public.departments (id) on delete restrict,
  term_id       uuid references public.terms (id) on delete restrict,
  teacher_id    uuid references public.profiles (id) on delete set null,
  is_published  boolean not null default true,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (code, term_id)
);
create index courses_teacher_idx on public.courses (teacher_id);
create index courses_term_idx on public.courses (term_id);
create index courses_department_idx on public.courses (department_id);
create index courses_created_by_idx on public.courses (created_by);
create trigger courses_updated_at before update on public.courses
  for each row execute function private.set_updated_at();

create table public.enrollments (
  course_id   uuid not null references public.courses (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  section     text not null default 'A',
  enrolled_at timestamptz not null default now(),
  primary key (course_id, student_id)
);
create index enrollments_student_idx on public.enrollments (student_id);

create table public.course_modules (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  title      text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index course_modules_course_idx on public.course_modules (course_id, position);

create table public.materials (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses (id) on delete cascade,
  module_id    uuid references public.course_modules (id) on delete set null,
  title        text not null,
  kind         public.material_kind not null default 'pdf',
  storage_path text,
  external_url text,
  body_text    text,
  mime_type    text,
  size_bytes   bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  check (storage_path is not null or external_url is not null or body_text is not null)
);
create index materials_course_idx on public.materials (course_id);
create index materials_module_idx on public.materials (module_id);
create index materials_uploaded_by_idx on public.materials (uploaded_by);

create table public.material_summaries (
  id           uuid primary key default gen_random_uuid(),
  material_id  uuid not null references public.materials (id) on delete cascade,
  length       public.summary_length not null,
  summary      text not null,
  model        text not null,
  generated_by uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (material_id, length)
);
create index material_summaries_generated_by_idx on public.material_summaries (generated_by);

-- ---------------------------------------------------------------------------
-- Coursework: assignments (also quizzes, labs, exams), submissions, grades
-- ---------------------------------------------------------------------------
create table public.assignments (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses (id) on delete cascade,
  title        text not null,
  description  text not null default '',
  kind         public.assignment_kind not null default 'assignment',
  due_at       timestamptz,
  max_points   numeric(6, 2) not null default 100 check (max_points > 0),
  -- [{"criterion": "Code quality", "max_points": 10}, ...]
  rubric       jsonb not null default '[]'::jsonb check (jsonb_typeof(rubric) = 'array'),
  allow_late   boolean not null default true,
  is_published boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index assignments_course_idx on public.assignments (course_id, due_at);
create index assignments_created_by_idx on public.assignments (created_by);
create trigger assignments_updated_at before update on public.assignments
  for each row execute function private.set_updated_at();

create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  body          text not null default '',
  file_paths    text[] not null default '{}',
  status        public.submission_status not null default 'submitted',
  submitted_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assignment_id, student_id)
);
create index submissions_student_idx on public.submissions (student_id);
create trigger submissions_updated_at before update on public.submissions
  for each row execute function private.set_updated_at();

-- Grades live apart from submissions so that students cannot read a score
-- until the teacher releases it (released_at is set).
create table public.grades (
  submission_id uuid primary key references public.submissions (id) on delete cascade,
  score         numeric(6, 2) not null check (score >= 0),
  -- [{"criterion": "Code quality", "points": 8}, ...]
  rubric_scores jsonb not null default '[]'::jsonb check (jsonb_typeof(rubric_scores) = 'array'),
  feedback      text not null default '',
  graded_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  graded_at     timestamptz not null default now(),
  released_at   timestamptz
);
create index grades_graded_by_idx on public.grades (graded_by);

create table public.attendance (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses (id) on delete cascade,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  session_date date not null,
  status       public.attendance_status not null,
  note         text,
  recorded_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (course_id, student_id, session_date)
);
create index attendance_student_idx on public.attendance (student_id);
create index attendance_recorded_by_idx on public.attendance (recorded_by);

-- ---------------------------------------------------------------------------
-- Announcements and notifications
-- ---------------------------------------------------------------------------
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid references public.courses (id) on delete cascade,  -- null = campus-wide (admin only)
  section    text,                                                    -- null = every section
  title      text not null,
  body       text not null,
  send_email boolean not null default false,
  author_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index announcements_course_idx on public.announcements (course_id, created_at desc);
create index announcements_author_idx on public.announcements (author_id);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       public.notification_type not null,
  title      text not null,
  body       text not null default '',
  link       text,
  email      boolean not null default false,  -- producer asks for an email copy (still subject to preferences)
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  email_grades        boolean not null default true,
  email_announcements boolean not null default true,
  email_hostel        boolean not null default false,
  email_system        boolean not null default false,
  updated_at          timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function private.set_updated_at();

-- Server-only queue drained by the dispatch-emails edge function.
create table public.email_outbox (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  notification_id uuid references public.notifications (id) on delete set null,
  to_email        text not null,
  subject         text not null,
  body            text not null,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts        integer not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index email_outbox_pending_idx on public.email_outbox (created_at) where status = 'pending';
create index email_outbox_user_idx on public.email_outbox (user_id);
create index email_outbox_notification_idx on public.email_outbox (notification_id);

-- ---------------------------------------------------------------------------
-- Hostel roommate finder
-- ---------------------------------------------------------------------------
create table public.hostel_profiles (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  display_name     text not null,
  gender           public.gender not null default 'prefer_not_to_say',
  preferred_block  text not null,
  budget_min       integer not null check (budget_min >= 0),
  budget_max       integer not null,
  lifestyle        public.lifestyle not null default 'balanced',
  sleep_schedule   public.sleep_schedule not null default 'flexible',
  cleanliness      smallint not null default 3 check (cleanliness between 1 and 5),
  smoker           boolean not null default false,
  bio              text not null default '' check (char_length(bio) <= 500),
  is_active        boolean not null default true,
  removed_by_admin boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (budget_max >= budget_min)
);
create index hostel_profiles_browse_idx on public.hostel_profiles (preferred_block) where is_active and not removed_by_admin;
create trigger hostel_profiles_updated_at before update on public.hostel_profiles
  for each row execute function private.set_updated_at();

-- Contact details are hidden until both students accept a connection.
create table public.hostel_contacts (
  user_id        uuid primary key references public.hostel_profiles (user_id) on delete cascade,
  contact_method public.contact_method not null default 'email',
  contact_value  text not null
);

create table public.hostel_shortlists (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  target_id  uuid not null references public.hostel_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, target_id),
  check (user_id <> target_id)
);
create index hostel_shortlists_target_idx on public.hostel_shortlists (target_id);

create table public.hostel_connections (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status       public.connection_status not null default 'pending',
  message      text check (message is null or char_length(message) <= 500),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> recipient_id)
);
create unique index hostel_connections_pair_idx
  on public.hostel_connections (least(requester_id, recipient_id), greatest(requester_id, recipient_id));
create index hostel_connections_requester_idx on public.hostel_connections (requester_id);
create index hostel_connections_recipient_idx on public.hostel_connections (recipient_id);

create table public.hostel_messages (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.hostel_connections (id) on delete cascade,
  sender_id     uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body          text not null check (char_length(body) between 1 and 2000),
  created_at    timestamptz not null default now()
);
create index hostel_messages_connection_idx on public.hostel_messages (connection_id, created_at);
create index hostel_messages_sender_idx on public.hostel_messages (sender_id);

create table public.hostel_reports (
  id               uuid primary key default gen_random_uuid(),
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  reporter_id      uuid references public.profiles (id) on delete set null default auth.uid(),
  reason           text not null check (char_length(reason) between 3 and 200),
  details          text not null default '' check (char_length(details) <= 2000),
  status           public.report_status not null default 'pending',
  resolution_note  text,
  resolved_by      uuid references public.profiles (id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  check (reporter_id is null or reporter_id <> reported_user_id)
);
create index hostel_reports_status_idx on public.hostel_reports (status, created_at);
create index hostel_reports_reported_idx on public.hostel_reports (reported_user_id);
create index hostel_reports_reporter_idx on public.hostel_reports (reporter_id);
create index hostel_reports_resolved_by_idx on public.hostel_reports (resolved_by);

-- ---------------------------------------------------------------------------
-- Security and settings
-- ---------------------------------------------------------------------------
-- MFA backup codes (SHA-256 hashes). Server-only: read and written by the mfa-recovery edge function.
create table public.mfa_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb not null default '{}'::jsonb,
  ip          inet,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
create index audit_logs_action_idx on public.audit_logs (action);

create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text not null default '',
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);
create index app_settings_updated_by_idx on public.app_settings (updated_by);
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function private.set_updated_at();

insert into public.app_settings (key, value, description) values
  ('require_mfa',            'false'::jsonb, 'When true, every user must complete MFA (aal2) before reading or writing any data.'),
  ('allow_self_signup',      'false'::jsonb, 'Informational: accounts are created by admins. Also disable sign-ups in the Supabase Auth settings.'),
  ('ai_summaries_enabled',   'true'::jsonb,  'Turn the AI material summarizer on or off.'),
  ('hostel_finder_enabled',  'true'::jsonb,  'Turn the hostel roommate finder on or off.'),
  ('maintenance_mode',       'false'::jsonb, 'Show a maintenance banner in every portal.');

-- Every table in public has RLS on; policies come in a later migration.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- Server-only tables: no client access at all.
revoke all on public.email_outbox, public.mfa_recovery_codes from anon, authenticated;
