# UniBook Backend (Supabase)

Project: `ubrkrppiscxtoivytujy` · API URL: `https://ubrkrppiscxtoivytujy.supabase.co`

The backend is Supabase: Postgres with row level security (RLS) as the permission layer,
Supabase Auth for sign-in and MFA, Storage for files, Realtime for live updates, and four
Edge Functions for work that needs secrets or the Auth admin API.

```
supabase/
  migrations/   schema, permissions, triggers and API functions (applied in order)
  functions/    edge functions (Deno / TypeScript)
  seed.sql      demo data and demo accounts (not applied yet, see Setup)
```

## Setup checklist

| Step | Where | Status |
|---|---|---|
| Migrations 1-5 and 7 | applied to the project | done |
| Migration 6 (`policy_tuning`, performance only) | needs approval when applied | **pending** |
| Edge functions (4) | deployed | done |
| `ANTHROPIC_API_KEY` secret for the AI summarizer | Dashboard > Edge Functions > Secrets | **to do** |
| Turn off public sign-ups (admins create accounts) | Dashboard > Authentication > Sign In / Providers | **to do** |
| Enable TOTP MFA (on by default) | Dashboard > Authentication > Multi-Factor | check |
| Demo data (`supabase/seed.sql`) | SQL editor, once | **optional** |
| Email: `RESEND_API_KEY`, `EMAIL_FROM` secrets, then schedule `dispatch-emails` | Dashboard | optional |
| First real admin account | see "Creating the first admin" | when going live |

### Creating the first admin

Create a user in Dashboard > Authentication > Users, then in the SQL editor:

```sql
update public.profiles set role = 'admin', full_name = 'Your Name' where email = 'you@university.edu';
```

After that, admins create every other account through the `admin-users` function.

### Demo accounts (after running `seed.sql`)

All use the password `UniBook#2026`. Delete or change them before real use.

| Email | Role |
|---|---|
| admin@unibook.test | Admin |
| arif.rahman@unibook.test, shirin.akter@unibook.test, kamal.hasan@unibook.test | Teacher |
| fahim@, nusrat@, mehrab@, sadia@unibook.test | Student |

## Connecting from the frontend

```js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";

const supabase = createClient(
  "https://ubrkrppiscxtoivytujy.supabase.co",
  "sb_publishable_oB7jZzyW2NMYxFLrq8nBbQ_Nq4Nq46v", // publishable key: safe in the browser
);
```

TypeScript types: `npx supabase gen types typescript --project-id ubrkrppiscxtoivytujy > src/database.types.ts`

Errors from the API carry a Postgres code; our own checks raise `42501` (not allowed),
`22023` (bad input) and `P0002` (not found) with a human-readable message you can show as-is.

## Sign-in flow (PRD 6.1)

```
signInWithPassword ─▶ rpc('get_my_account')
                         │
     status locked/inactive ─▶ "account locked" screen (Auth also refuses sign-in)
     mfa.enrolled && aal1   ─▶ MFA challenge screen  (auth.mfa.challenge + verify)
     mfa.required && !enrolled ─▶ MFA enrollment     (auth.mfa.enroll → verify →
                                                      mfa-recovery {action:"generate"} → show codes once)
     !onboarded              ─▶ onboarding           (rpc('complete_onboarding'))
     else                    ─▶ dashboard for role (student / teacher / admin)
```

* `get_my_account()` works before MFA and for locked accounts, so the app can always route the user.
  It returns `{ id, email, full_name, role, status, locale, onboarded, mfa: { required, enrolled, aal, satisfied }, maintenance_mode }`.
* Until MFA is satisfied, every table returns no rows (one restrictive policy per table).
* Forgot password: `supabase.auth.resetPasswordForEmail(email, { redirectTo })`, then `auth.updateUser({ password })`.
* Remember this device: the session persists in the browser by default; for "don't remember", use a client with `auth: { storage: sessionStorage }`.
* Lost authenticator: at the challenge screen, `functions.invoke('mfa-recovery', { body: { action: 'redeem', code } })`, then sign in again and re-enroll.
* Session expired: `supabase.auth.onAuthStateChange` fires `SIGNED_OUT` / token refresh failure.

## Data access by feature

Every query runs as the signed-in user; RLS returns only what that user may see.
Where two foreign keys point at `profiles`, name the one you mean, e.g. `teacher:profiles!courses_teacher_id_fkey(full_name)`.

### Student

| Need | Call |
|---|---|
| Dashboard: GPA, current-term GPA, GPA trend, attendance %, pending/overdue work, unread count, due soon, per-course results | `rpc('student_dashboard')` |
| Enrolled courses | `from('enrollments').select('section, course:courses(*, term:terms(name), teacher:profiles!courses_teacher_id_fkey(full_name))')` |
| Course detail | `from('courses').select('*, course_modules(*), materials(*), announcements(*)').eq('id', id)` |
| AI summary | `functions.invoke('summarize-material', { body: { material_id, length: 'short' \| 'detailed', regenerate } })` |
| Open a material file | `storage.from('course-materials').createSignedUrl(path, 3600)` |
| Assignments | `from('assignments').select('*, submissions(status, submitted_at, grades(score, feedback, released_at))')` |
| Submit | upload to `submissions/{assignment_id}/{user_id}/{file}`, then `from('submissions').upsert({ assignment_id, student_id, body, file_paths }, { onConflict: 'assignment_id,student_id' })` (editable until graded) |
| Grades (released only) | `from('course_results').select('*')` |
| Notification settings | `from('notification_preferences')` |

### Teacher

| Need | Call |
|---|---|
| Dashboard | `rpc('teacher_dashboard')` |
| Create / edit course | `from('courses').insert/update` (teacher is set to the caller; only admins reassign) |
| Modules, materials | `from('course_modules')`, `from('materials')`; files go to `course-materials/{course_id}/...` |
| Roster | `from('enrollments').select('section, student:profiles(*)').eq('course_id', id)` |
| Grading queue | `from('submissions').select('*, student:profiles(full_name), assignment:assignments!inner(title, course_id, rubric, max_points), grades(*)').eq('assignment.course_id', id).eq('status', filter)` |
| Grade one | `from('grades').upsert({ submission_id, score, rubric_scores, feedback })` (hidden from the student) |
| Return grades | `rpc('release_grades', { p_submission_ids })` or `rpc('release_assignment_grades', { p_assignment })`, or set `released_at` when grading |
| Attendance | `from('attendance').upsert([...], { onConflict: 'course_id,student_id,session_date' })` |
| Announcement | `from('announcements').insert({ course_id, section, title, body, send_email })` |
| Class analytics | `rpc('course_analytics', { p_course })` |
| One student | `rpc('student_performance', { p_course, p_student })` |

### Admin

| Need | Call |
|---|---|
| System summary | `rpc('admin_system_summary')` |
| Users table | `from('profiles').select('*, department:departments(code)')` with filters on role, status, department |
| Create user | `functions.invoke('admin-users', { body: { action: 'create', email, full_name, role, department_code, institution_id, password? } })` |
| Change role / activate / deactivate / lock | `admin-users` with `set_role` / `set_status` and `user_ids: [...]` (bulk) |
| Reset MFA (bulk) | `admin-users` with `reset_mfa` |
| Send password reset | `admin-users` with `send_password_reset` |
| Course catalog, departments, terms | `from('courses' / 'departments' / 'terms')` |
| Hostel moderation | `from('hostel_reports').select('*').eq('status','pending')`, then `rpc('resolve_hostel_report', { p_report, p_action: 'dismiss' \| 'remove_listing', p_note })` |
| Security & access logs | `rpc('admin_access_logs', { p_limit, p_before, p_action, p_actor })` (app audit trail plus Auth sign-in events) |
| System settings | `from('app_settings')` (`require_mfa`, `ai_summaries_enabled`, `hostel_finder_enabled`, `maintenance_mode`) |

### Hostel roommate finder

| Need | Call |
|---|---|
| My listing | `from('hostel_profiles').upsert({...})`, contact in `from('hostel_contacts').upsert({...})` |
| Browse with compatibility (0-100) | `rpc('hostel_matches', { p_block, p_budget_min, p_budget_max, p_lifestyle, p_gender })` |
| Shortlist | `from('hostel_shortlists').insert/delete` |
| Connect | `from('hostel_connections').insert({ recipient_id, message })`; recipient updates `status` to `accepted` / `declined` |
| Contact details | `from('hostel_contacts').select().eq('user_id', other)`: returns a row only after the connection is accepted |
| Chat | `from('hostel_messages')` (accepted connections only) |
| Report a listing | `from('hostel_reports').insert({ reported_user_id, reason, details })` |

### Notifications

* List: `from('notifications').select('*').order('created_at', { ascending: false })`; group by `type` (grades, announcements, hostel, system).
* Mark read: update `read_at`, or `rpc('mark_all_notifications_read')`.
* Live bell and toasts: `supabase.channel('me').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, cb).subscribe()`.
  `hostel_messages` and `hostel_connections` are also on Realtime.
* Created automatically by the database for: new assignment, new material, announcement, enrollment,
  new submission (to the teacher), grade released, roommate request/acceptance/message, report outcome, role change.
* Email copies go to `email_outbox` when the event asks for email and the user's preferences allow it;
  `dispatch-emails` sends them.

## Decisions on the PRD's open questions

| Question (PRD §11) | Decision | Easy to change? |
|---|---|---|
| MFA methods at launch | Authenticator app (TOTP), plus 10 one-time backup codes. SMS needs a paid SMS provider. | Add phone MFA in the dashboard later |
| Is MFA mandatory? | Users who enroll must always use it. Site-wide requirement is the `require_mfa` setting, **off** by default. | Admin setting |
| Grade visibility | Hidden until the teacher releases it: per submission, per assignment, or in bulk. | - |
| Hostel contact privacy | Contact details and chat unlock only after the other student accepts a connection request. | - |
| Admin analytics | Summary level (counts, sign-ins, storage, queue, errors). | - |
| Grading scale | UGC Bangladesh: 80+ A+ (4.00) … 40-44 D (2.00), below 40 F. GPA is credit-weighted over released grades. | `letter_grade` / `grade_point` functions |
| Who creates accounts | Admins only; public sign-up should be disabled in the dashboard. | - |

## Security model

* RLS on every table. One **restrictive** policy per table requires an active account and satisfied MFA;
  permissive policies then describe who may do what.
* Field guards (triggers) stop users changing their own role/status, teachers reassigning courses,
  students editing graded submissions, and anyone removing the last admin.
* Roles come from `app_metadata` (server-only), never from user-editable metadata.
* Helper functions with elevated rights live in the `private` schema, which is not exposed over the API.
* Anonymous visitors can't read any table or call any function.
* Audit trail (`audit_logs`): role/status changes, course changes, grade releases, settings changes,
  report outcomes, MFA resets and backup-code use, account creation, password resets.

## Not covered (needs a decision or a paid service)

* SMS MFA and SMS notifications (needs an SMS provider).
* Failed-login lockout counting: Supabase rate-limits sign-ins; automatic lockout needs the
  Auth "password verification" hook (paid plans). Admins can lock accounts manually.
* Text extraction from Word/PowerPoint for AI summaries (PDF and text work today).
* Scheduling `dispatch-emails` (pg_cron + pg_net, or an external cron).
