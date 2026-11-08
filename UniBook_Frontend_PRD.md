# Product Requirements Document (PRD)
## UniBook — AI-Based Academic Management System
### Scope: Frontend

**Document owner:** Project Team (Munim Shariar Shihab, Shanzan Hossain Apurbo)
**Supervisor:** Nahidul Islam, Lecturer, Dept. of CSE
**Status:** Draft v1.0
**Last updated:** August 19, 2026

---

## 1. Overview

UniBook is an AI-enhanced academic management system that extends the traditional LMS model (Moodle, Canvas, Google Classroom, TalentLMS, Docebo) with personalization, AI-assisted study tools, and campus-life services. Existing platforms manage courses, assignments, and grading but fall short on personalization, AI support, and student wellbeing features. UniBook addresses this gap with a multi-portal experience (Student, Teacher, Admin), an AI study-material summarizer, a hostel roommate finder, and built-in Multi-Factor Authentication (MFA).

This PRD covers **only the frontend** of UniBook: the screens, components, states, and interaction patterns required to deliver the product objectives to end users across three portals. Backend/API design, AI model behavior, and infrastructure are referenced only where they shape frontend requirements.

---

## 2. Problem Statement

Traditional LMS platforms are course-management tools first — they are not designed around the student's full academic and campus life. Common gaps identified in the existing-system analysis:

| Feature | Existing LMS | UniBook (Proposed) |
|---|---|---|
| Multi-portal separation | Limited | Fully separated (Student / Teacher / Admin) |
| AI support | None | Built-in (study material summarization) |
| Progress dashboard | Basic | Advanced, personalized |
| Hostel/campus-life services | None | Hostel roommate finder |
| Security (MFA) | Optional or absent | Built-in by default |
| Personalization | Weak | Strong |

The frontend must make these differentiators **visible and usable**, not just technically present — a personalized dashboard that looks like a generic table, or an AI feature buried three clicks deep, fails the product's actual goal.

---

## 3. Goals & Success Criteria (Frontend)

| Goal | Success signal |
|---|---|
| Give each role a focused, uncluttered workspace | A first-time user of any portal reaches their primary task (view grade, post assignment, approve user) in ≤3 clicks from login |
| Make the AI summarizer feel native, not bolted-on | Summarization is reachable directly from any course material view, not a separate disconnected page |
| Make progress visible at a glance | Student dashboard surfaces GPA/attendance/pending-work trends without requiring navigation |
| Make security frictionless | MFA enrollment and challenge add ≤15 seconds to login flow, with clear recovery path |
| Support the hostel finder without feeling like a bolted-on classifieds page | Consistent visual language with the rest of the academic UI |

---

## 4. Users & Portals

UniBook is explicitly a **multi-portal** system. Each portal is a distinct frontend experience sharing a common design system, not three views of one generic admin panel.

### 4.1 Student Portal
- Views own courses, grades, attendance, and progress analytics
- Uploads/submits assignments
- Uses AI summarization on course materials
- Uses the hostel roommate finder
- Manages notification preferences, MFA settings, profile

### 4.2 Teacher Portal
- Manages courses and uploads materials
- Creates/grades assignments and quizzes
- Views class-level and per-student performance analytics
- Sends announcements/notifications to a class

### 4.3 Admin Portal
- Manages users, roles, and permissions across the system
- System-wide configuration (departments, course catalog, terms)
- Monitors system usage/health at a summary level
- Manages hostel-finder moderation (flagged listings, verification)

---

## 5. Information Architecture

```
UniBook
├── Auth
│   ├── Login
│   ├── MFA Challenge
│   ├── MFA Enrollment
│   ├── Forgot Password / Recovery
│   └── Onboarding (first-login profile setup)
│
├── Student Portal
│   ├── Dashboard (progress, GPA trend, attendance, upcoming deadlines)
│   ├── Courses → Course Detail → Materials → AI Summary Panel
│   ├── Assignments (list, detail, submission)
│   ├── Grades
│   ├── Hostel Finder (browse, profile match, saved matches, chat/contact)
│   ├── Notifications
│   └── Settings (profile, MFA, notification preferences)
│
├── Teacher Portal
│   ├── Dashboard (classes overview, pending grading, announcements)
│   ├── Courses → Course Builder → Materials Upload
│   ├── Assignments & Grading (queue, rubric view, bulk actions)
│   ├── Class Analytics
│   ├── Announcements/Notifications
│   └── Settings
│
└── Admin Portal
    ├── Dashboard (system overview, usage summary)
    ├── User Management (students, teachers, roles)
    ├── Course Catalog Management
    ├── Hostel Finder Moderation
    ├── Security & Access Logs
    └── System Settings
```

---

## 6. Functional Requirements by Module

### 6.1 Authentication & MFA
- Login screen: email/ID + password, "Remember this device" option
- MFA challenge screen: OTP entry (SMS/email/authenticator app), resend timer, "use backup code" link
- MFA enrollment flow during onboarding: method selection → verification → backup codes shown once, with explicit "save these codes" confirmation step
- Session-expired and account-locked states with clear next steps (not raw error text)
- Role-aware redirect after login (Student/Teacher/Admin land on their respective dashboard)

### 6.2 Student Dashboard
- Summary cards: current GPA, attendance %, pending assignments count, unread notifications
- Progress trend chart (GPA or grade trend over terms)
- "Due soon" widget listing upcoming assignment deadlines, sorted by urgency
- Empty states for new students with no data yet (guidance, not blank cards)

### 6.3 Course & Materials (Student view)
- Course list (enrolled courses, term filter)
- Course detail: syllabus, materials list, announcements, grade breakdown
- Material viewer (PDF/doc/video) with a persistent **"Summarize with AI"** action
  - Summary appears in a side panel or expandable section, not a full navigation away
  - Loading state while summary generates; error state with retry if generation fails
  - Option to regenerate or adjust summary length (short/detailed)

### 6.4 Assignments & Grading
- Student: assignment list (status: not started / submitted / graded), submission form (file upload + text), submission confirmation
- Teacher: grading queue with filter by course/status, rubric-based grading UI, bulk "return grades" action, inline feedback comments
- Grade visibility rules reflected in UI (e.g., grades hidden until teacher publishes)

### 6.5 Teacher Course Management
- Course builder: create/edit course, add modules, upload materials (drag-and-drop, progress indicator, file-type/size validation feedback)
- Class roster view with quick access to individual student performance
- Announcement composer with target audience (class/section) and optional email notification toggle

### 6.6 Admin: User & System Management
- User table: search/filter by role, status, department; bulk actions (activate, deactivate, reset MFA)
- Role assignment UI with clear permission implications shown before confirming
- Course catalog CRUD (departments, terms, course codes)
- System usage summary (active users, storage, recent errors) — read-only dashboard, not deep analytics

### 6.7 Hostel Roommate Finder
- Browse/search view: filters (budget, location/hostel block, lifestyle preferences, gender if applicable to policy)
- Profile creation form (preferences, habits, contact method)
- Match/results list with compatibility indicator
- Saved/shortlisted matches
- Contact/connect action (in-app message or reveal contact info per privacy policy)
- Admin moderation queue for reported/flagged listings

### 6.8 Notifications
- In-app notification center (bell icon, unread count, grouped by type: grades, announcements, hostel, system)
- Notification preference settings (which events trigger email vs in-app only)
- Toast/snackbar pattern for real-time in-session events (e.g., "Assignment graded")

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Responsiveness | Fully usable on mobile web (360px+) and desktop; dashboards reflow to single-column below 768px |
| Accessibility | WCAG 2.1 AA: keyboard navigation, visible focus states, sufficient color contrast, alt text on all icons/images |
| Performance | Route-level code splitting per portal; dashboard initial load target < 2.5s on 4G |
| Consistency | Single shared component library and design tokens across all three portals — no portal should look like a different product |
| Localization-readiness | UI copy externalized (not hardcoded) to support future Bangla/English toggle |
| Offline/degraded states | Clear messaging when AI summarization or hostel-finder services are unavailable, rather than silent failure |

---

## 8. Recommended Frontend Tech Stack

| Layer | Recommendation | Rationale |
|---|---|---|
| Framework | Next.js (React, TypeScript) | Role-based routing, SSR for dashboards, strong ecosystem |
| Styling/UI | Tailwind CSS + shadcn/ui | Fast, consistent design system across 3 portals |
| State/data fetching | React Query (TanStack Query) | Handles async AI summary generation, caching, retries cleanly |
| Charts | Recharts | GPA/attendance trend visualizations |
| Forms | React Hook Form + Zod | Validation for assignment submission, hostel profile, admin forms |
| Auth/session | Supabase Auth or equivalent, with MFA flow built on top | Matches multi-role, MFA-required auth needs |
| Notifications | WebSocket or polling-based in-app notification center | Real-time grading/announcement updates |

*(Backend/infrastructure choices are out of scope for this document but noted here only where they directly shape frontend integration points.)*

---

## 9. Key User Flows

1. **Student checks progress → submits assignment**
   Login → MFA → Dashboard → Courses → Assignment → Submit → Confirmation

2. **Student summarizes a lecture note**
   Course Detail → Materials → Open Material → "Summarize with AI" → Loading → Summary panel

3. **Teacher grades a batch of submissions**
   Login → Dashboard → Grading Queue → Filter by course → Grade each (rubric) → Bulk return

4. **Student finds a hostel roommate**
   Hostel Finder → Create/Edit Profile → Browse Matches → Shortlist → Contact

5. **Admin resets a locked-out user's MFA**
   User Management → Search user → Reset MFA → Confirm → Audit log entry created

---

## 10. Out of Scope (This Document)

- Backend API contracts and database schema
- AI summarization model selection/training
- Payment or billing flows (not present in current feature set)
- Native mobile app (mobile web only, per current objectives)

---

## 11. Open Questions / Assumptions

- Hostel finder privacy model (what contact info is revealed, and when) needs confirmation before finalizing that module's UI.
- Grade-visibility rules (does a teacher publish grades in batches, or per-assignment automatically?) affects the grading UI's default state.
- MFA methods to support at launch (SMS, authenticator app, email) — affects the enrollment screen's option list.
- Whether Admin needs full analytics or a summary-only dashboard, per current objective ("Admin system control") — assumed summary-level for v1.

---

## 12. Suggested Phasing

| Phase | Scope |
|---|---|
| Phase 1 | Auth + MFA, Student & Teacher dashboards, Courses/Materials, Assignments & Grading |
| Phase 2 | AI summarization panel, Notifications system |
| Phase 3 | Hostel Roommate Finder (student + admin moderation) |
| Phase 4 | Admin analytics polish, accessibility/performance hardening |
