-- UniBook demo data. Safe to run once on an empty project.
-- Every demo account uses the password  UniBook#2026  (change or delete before real use).
--
--   admin@unibook.test            Admin
--   arif.rahman@unibook.test      Teacher  (Web Engineering, Data Structures)
--   shirin.akter@unibook.test     Teacher  (Database Management, Discrete Mathematics)
--   kamal.hasan@unibook.test      Teacher  (Computer Networks)
--   fahim@unibook.test            Student
--   nusrat@unibook.test           Student
--   mehrab@unibook.test           Student
--   sadia@unibook.test            Student

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
insert into public.departments (id, code, name) values
  ('d0000000-0000-4000-a000-000000000001', 'CSE', 'Computer Science and Engineering'),
  ('d0000000-0000-4000-a000-000000000002', 'EEE', 'Electrical and Electronic Engineering'),
  ('d0000000-0000-4000-a000-000000000003', 'BBA', 'Business Administration');

insert into public.terms (id, name, starts_on, ends_on, is_current) values
  ('e0000000-0000-4000-a000-000000000001', 'Spring 2026', '2026-01-10', '2026-06-20', false),
  ('e0000000-0000-4000-a000-000000000002', 'Fall 2026',   '2026-07-15', '2026-12-20', true);

-- ---------------------------------------------------------------------------
-- Accounts (auth.users -> profiles via the on_auth_user_created trigger)
-- ---------------------------------------------------------------------------
with people (id, email, full_name, role, dept, inst) as (values
  ('a0000000-0000-4000-a000-000000000001'::uuid, 'admin@unibook.test',        'System Administrator', 'admin',   'CSE', 'ADM-001'),
  ('a0000000-0000-4000-a000-000000000011'::uuid, 'arif.rahman@unibook.test',  'Arif Rahman',          'teacher', 'CSE', 'T-1011'),
  ('a0000000-0000-4000-a000-000000000012'::uuid, 'shirin.akter@unibook.test', 'Shirin Akter',         'teacher', 'CSE', 'T-1012'),
  ('a0000000-0000-4000-a000-000000000013'::uuid, 'kamal.hasan@unibook.test',  'Kamal Hasan',          'teacher', 'CSE', 'T-1013'),
  ('a0000000-0000-4000-a000-000000000101'::uuid, 'fahim@unibook.test',        'Fahim Rahman',         'student', 'CSE', '2022-1-60-101'),
  ('a0000000-0000-4000-a000-000000000102'::uuid, 'nusrat@unibook.test',       'Nusrat Jahan',         'student', 'CSE', '2022-1-60-102'),
  ('a0000000-0000-4000-a000-000000000103'::uuid, 'mehrab@unibook.test',       'Mehrab Ahmed',         'student', 'CSE', '2022-1-60-103'),
  ('a0000000-0000-4000-a000-000000000104'::uuid, 'sadia@unibook.test',        'Sadia Islam',          'student', 'CSE', '2022-1-60-104')
),
new_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  )
  select
    '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated', p.email,
    extensions.crypt('UniBook#2026', extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                       'role', p.role, 'department_code', p.dept, 'institution_id', p.inst),
    jsonb_build_object('full_name', p.full_name),
    now(), now(), '', '', '', '', '', '', '', ''
  from people p
  returning id, email
)
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select nu.id::text, nu.id,
       jsonb_build_object('sub', nu.id::text, 'email', nu.email, 'email_verified', true),
       'email', now(), now(), now()
from new_users nu;

update public.profiles set onboarded_at = now();

-- ---------------------------------------------------------------------------
-- Courses
-- ---------------------------------------------------------------------------
insert into public.courses (id, code, title, description, syllabus, credits, department_id, term_id, teacher_id, created_by) values
  ('c0000000-0000-4000-a000-000000000001', 'CSE-3101', 'Web Engineering',
   'Modern front-end and back-end web development.',
   'HTML/CSS fundamentals, JavaScript, responsive design, REST APIs and deployment. Weekly labs, a midterm and a final group project.',
   3, 'd0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000011', 'a0000000-0000-4000-a000-000000000001'),
  ('c0000000-0000-4000-a000-000000000002', 'CSE-3103', 'Database Management',
   'Relational database design, SQL and query optimization.',
   'Normalization, indexing, transactions and query optimization, with a semester-long lab project.',
   3, 'd0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000012', 'a0000000-0000-4000-a000-000000000001'),
  ('c0000000-0000-4000-a000-000000000003', 'CSE-3105', 'Computer Networks',
   'OSI and TCP/IP models, routing, switching and network security.',
   'Covers the OSI and TCP/IP models, routing, switching and security fundamentals, with packet-capture labs.',
   3, 'd0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000013', 'a0000000-0000-4000-a000-000000000001'),
  ('c0000000-0000-4000-a000-000000000004', 'CSE-2201', 'Data Structures',
   'Arrays, lists, trees, graphs and their algorithms.',
   'Linear and non-linear data structures, complexity analysis, sorting and searching.',
   3, 'd0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000011', 'a0000000-0000-4000-a000-000000000001'),
  ('c0000000-0000-4000-a000-000000000005', 'CSE-2203', 'Discrete Mathematics',
   'Logic, sets, combinatorics and graph theory for computing.',
   'Propositional logic, proofs, counting, recurrence relations and graphs.',
   3, 'd0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000012', 'a0000000-0000-4000-a000-000000000001');

-- All four students take the three Fall courses; three of them took the Spring courses.
insert into public.enrollments (course_id, student_id, section)
select c.id, s.id, case when s.id in ('a0000000-0000-4000-a000-000000000101', 'a0000000-0000-4000-a000-000000000102') then 'A' else 'B' end
from public.courses c
cross join (select id from public.profiles where role = 'student') s
where c.term_id = 'e0000000-0000-4000-a000-000000000002'
   or (c.term_id = 'e0000000-0000-4000-a000-000000000001' and s.id <> 'a0000000-0000-4000-a000-000000000104');

insert into public.course_modules (id, course_id, title, position) values
  ('b1000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001', 'Week 5: Layout', 1),
  ('b1000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000001', 'Week 6: JavaScript', 2),
  ('b1000000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000002', 'Design', 1),
  ('b1000000-0000-4000-a000-000000000004', 'c0000000-0000-4000-a000-000000000003', 'Foundations', 1);

insert into public.materials (course_id, module_id, title, kind, body_text, uploaded_by) values
  ('c0000000-0000-4000-a000-000000000001', 'b1000000-0000-4000-a000-000000000001', 'Lecture 05 - Responsive Layouts', 'text',
   'Responsive layouts adapt to different screen sizes using flexible grids, relative units, and media queries. Flexbox and CSS Grid are the two main layout tools for building responsive interfaces. Media queries let you apply different styles below or above a given viewport width. Mobile-first design starts with the smallest screen and adds complexity as the viewport grows. Testing across real devices catches issues that a resized browser window can miss.',
   'a0000000-0000-4000-a000-000000000011'),
  ('c0000000-0000-4000-a000-000000000001', 'b1000000-0000-4000-a000-000000000002', 'Lecture 06 - JavaScript DOM Basics', 'text',
   'The DOM represents an HTML document as a tree of nodes that JavaScript can read and modify. Methods like querySelector and addEventListener are the most common way to select elements and respond to user interaction. Changing an element''s classList is usually safer than rewriting its style attribute directly. Event delegation lets a single listener handle events for many child elements, which is useful for dynamically created content. Keeping DOM updates batched avoids unnecessary layout recalculation.',
   'a0000000-0000-4000-a000-000000000011'),
  ('c0000000-0000-4000-a000-000000000002', 'b1000000-0000-4000-a000-000000000003', 'Lecture 03 - Normalization', 'text',
   'Normalization reduces data redundancy by organizing tables around a single, well-defined purpose. First normal form removes repeating groups so every column holds a single value. Second normal form removes partial dependencies on part of a composite key. Third normal form removes columns that depend on other non-key columns rather than the key itself. Over-normalizing can hurt read performance, so real schemas often balance normalization with practical query needs.',
   'a0000000-0000-4000-a000-000000000012'),
  ('c0000000-0000-4000-a000-000000000003', 'b1000000-0000-4000-a000-000000000004', 'Lecture 02 - TCP/IP Fundamentals', 'text',
   'The TCP/IP model organizes network communication into four layers: link, internet, transport, and application. TCP provides reliable, ordered delivery through acknowledgments and retransmission, while UDP trades reliability for lower overhead. IP addresses identify hosts on a network, and subnetting divides a network into smaller routable segments. Ports let a single IP address host many independent services at once. Understanding this layering is essential for diagnosing where a network problem is actually occurring.',
   'a0000000-0000-4000-a000-000000000013');

-- ---------------------------------------------------------------------------
-- Coursework
-- ---------------------------------------------------------------------------
insert into public.assignments (id, course_id, title, description, kind, due_at, max_points, rubric, created_by) values
  -- Spring 2026 (finished term)
  ('f0000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000004', 'Linked List Lab', 'Implement a doubly linked list.', 'lab', '2026-03-01 23:59+06', 50, '[]', 'a0000000-0000-4000-a000-000000000011'),
  ('f0000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000004', 'Final Exam', 'Written final exam.', 'exam', '2026-06-10 10:00+06', 100, '[]', 'a0000000-0000-4000-a000-000000000011'),
  ('f0000000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000005', 'Proofs Problem Set', 'Induction and contradiction proofs.', 'assignment', '2026-03-15 23:59+06', 50, '[]', 'a0000000-0000-4000-a000-000000000012'),
  ('f0000000-0000-4000-a000-000000000004', 'c0000000-0000-4000-a000-000000000005', 'Final Exam', 'Written final exam.', 'exam', '2026-06-12 10:00+06', 100, '[]', 'a0000000-0000-4000-a000-000000000012'),
  -- Fall 2026 (current term)
  ('f0000000-0000-4000-a000-000000000011', 'c0000000-0000-4000-a000-000000000001', 'Assignment 1: Landing Page', 'Build a static landing page using semantic HTML.', 'assignment', now() - interval '30 days', 20,
   '[{"criterion":"Semantic HTML","max_points":8},{"criterion":"Styling","max_points":8},{"criterion":"Presentation","max_points":4}]', 'a0000000-0000-4000-a000-000000000011'),
  ('f0000000-0000-4000-a000-000000000012', 'c0000000-0000-4000-a000-000000000001', 'Assignment 2: Responsive Navbar', 'Build a responsive navigation bar with Flexbox that collapses into a menu on small screens.', 'assignment', now() + interval '2 days', 20,
   '[{"criterion":"Content & Accuracy","max_points":10},{"criterion":"Code Quality","max_points":10}]', 'a0000000-0000-4000-a000-000000000011'),
  ('f0000000-0000-4000-a000-000000000013', 'c0000000-0000-4000-a000-000000000001', 'Quiz 1', 'HTML and CSS basics.', 'quiz', now() - interval '20 days', 10, '[]', 'a0000000-0000-4000-a000-000000000011'),
  ('f0000000-0000-4000-a000-000000000021', 'c0000000-0000-4000-a000-000000000002', 'Lab 3 Report', 'Normalized schema and three sample queries.', 'lab', now() - interval '3 days', 15, '[]', 'a0000000-0000-4000-a000-000000000012'),
  ('f0000000-0000-4000-a000-000000000022', 'c0000000-0000-4000-a000-000000000002', 'Lab 4: Joins', 'Write five join queries against the lab database.', 'lab', now() + interval '5 days', 15, '[]', 'a0000000-0000-4000-a000-000000000012'),
  ('f0000000-0000-4000-a000-000000000031', 'c0000000-0000-4000-a000-000000000003', 'Quiz 1: TCP/IP', 'Layers and protocols.', 'quiz', now() - interval '25 days', 10, '[]', 'a0000000-0000-4000-a000-000000000013'),
  ('f0000000-0000-4000-a000-000000000032', 'c0000000-0000-4000-a000-000000000003', 'Packet Capture Report', 'Capture and explain a TCP handshake.', 'project', now() + interval '7 days', 30, '[]', 'a0000000-0000-4000-a000-000000000013');

-- Submissions for everything already due (and some early ones), with a deterministic score.
insert into public.submissions (id, assignment_id, student_id, body, submitted_at)
select gen_random_uuid(), a.id, e.student_id, 'Submitted work for ' || a.title,
       least(coalesce(a.due_at, now()), now()) - interval '1 hour'
from public.assignments a
join public.enrollments e on e.course_id = a.course_id
where a.due_at < now()
   or (a.id = 'f0000000-0000-4000-a000-000000000012' and e.student_id = 'a0000000-0000-4000-a000-000000000102');

-- Grade everything due; release all of Spring and the older Fall work,
-- leave the Lab 3 Report graded-but-unreleased for one student and ungraded for the rest.
insert into public.grades (submission_id, score, feedback, graded_by, graded_at, released_at)
select s.id,
       round(a.max_points * (0.62 + ((('x' || substr(md5(s.student_id::text || a.id::text), 1, 6))::bit(24)::int % 34) / 100.0)), 1),
       'Good work. See comments in the rubric.',
       c.teacher_id, now() - interval '2 days',
       case when a.id = 'f0000000-0000-4000-a000-000000000021' then null else now() - interval '1 day' end
from public.submissions s
join public.assignments a on a.id = s.assignment_id
join public.courses c on c.id = a.course_id
where a.due_at < now()
  and not (a.id = 'f0000000-0000-4000-a000-000000000021' and s.student_id <> 'a0000000-0000-4000-a000-000000000101');

-- Attendance: 8 sessions per Fall course.
insert into public.attendance (course_id, student_id, session_date, status, recorded_by)
select e.course_id, e.student_id, (current_date - (n * 7))::date,
       (array['present', 'present', 'present', 'late', 'present', 'absent', 'present', 'present'])
         [1 + (abs(hashtext(e.student_id::text || e.course_id::text || n::text)) % 8)]::public.attendance_status,
       c.teacher_id
from public.enrollments e
join public.courses c on c.id = e.course_id and c.term_id = 'e0000000-0000-4000-a000-000000000002'
cross join generate_series(1, 8) n;

insert into public.announcements (course_id, section, title, body, send_email, author_id) values
  ('c0000000-0000-4000-a000-000000000001', null, 'Midterm moved to next week', 'The Web Engineering midterm is now next Tuesday at 10:00 in Room 402.', false, 'a0000000-0000-4000-a000-000000000011'),
  ('c0000000-0000-4000-a000-000000000002', 'A', 'Lab 3 deadline extended for Section A', 'Section A has two extra days for the Lab 3 report.', false, 'a0000000-0000-4000-a000-000000000012'),
  (null, null, 'Fall 2026 midterm schedule published', 'The registrar has published the midterm examination schedule for all departments.', false, 'a0000000-0000-4000-a000-000000000001');

-- ---------------------------------------------------------------------------
-- Hostel finder
-- ---------------------------------------------------------------------------
insert into public.hostel_profiles (user_id, display_name, gender, preferred_block, budget_min, budget_max, lifestyle, sleep_schedule, cleanliness, smoker, bio) values
  ('a0000000-0000-4000-a000-000000000101', 'Fahim R.',  'male',   'West Hall',   3000, 4000, 'quiet',    'early',    4, false, 'Third-year CSE. Early riser, likes a tidy room.'),
  ('a0000000-0000-4000-a000-000000000103', 'Mehrab A.', 'male',   'West Hall',   3200, 4200, 'balanced', 'flexible', 4, false, 'Into football and late-night coding sometimes.'),
  ('a0000000-0000-4000-a000-000000000102', 'Nusrat J.', 'female', 'North Block', 3500, 5000, 'balanced', 'late',     3, false, 'Looking for a friendly roommate near the library.'),
  ('a0000000-0000-4000-a000-000000000104', 'Sadia I.',  'female', 'North Block', 3000, 4500, 'quiet',    'late',     5, false, 'Quiet, studies a lot, very organised.');

insert into public.hostel_contacts (user_id, contact_method, contact_value) values
  ('a0000000-0000-4000-a000-000000000101', 'email', 'fahim@unibook.test'),
  ('a0000000-0000-4000-a000-000000000103', 'phone', '+8801700000103'),
  ('a0000000-0000-4000-a000-000000000102', 'email', 'nusrat@unibook.test'),
  ('a0000000-0000-4000-a000-000000000104', 'in_app', 'Message me in UniBook');

insert into public.hostel_connections (requester_id, recipient_id, status, message, responded_at) values
  ('a0000000-0000-4000-a000-000000000101', 'a0000000-0000-4000-a000-000000000103', 'accepted', 'Hi! Looking for a West Hall roommate?', now() - interval '1 day'),
  ('a0000000-0000-4000-a000-000000000104', 'a0000000-0000-4000-a000-000000000102', 'pending',  'Are you still looking?', null);

insert into public.hostel_reports (reported_user_id, reporter_id, reason, details) values
  ('a0000000-0000-4000-a000-000000000103', 'a0000000-0000-4000-a000-000000000104', 'Suspected fake listing', 'The budget and block look copied from another listing.');

-- Demo addresses do not exist: don't try to email them.
update public.email_outbox set status = 'skipped', last_error = 'demo seed data' where status = 'pending';
