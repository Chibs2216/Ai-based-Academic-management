/* Student portal. Every list comes from Supabase; RLS limits it to this student. */

let enrollmentsCache = null;      // [{ section, course: {...} }]
let assignmentsCache = null;      // assignments with my submission + released grade
let openCourse = null;
let openAssignmentId = null;
let hostelProfile = null;         // my listing (or null)
let openConnectionId = null;
let chatChannel = null;

const SUBMISSION_MAX_BYTES = 25 * 1024 * 1024;
const SUBMISSION_TYPES = [
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip", "application/x-zip-compressed",
    "text/plain", "text/markdown", "image/png", "image/jpeg", "image/webp"
];

const LIFESTYLE_LABELS = { quiet: "Quiet", balanced: "Balanced", social: "Social" };
const SLEEP_LABELS = { early: "Early riser", flexible: "Flexible", late: "Night owl" };
const GENDER_LABELS = { male: "Male", female: "Female", other: "Other", prefer_not_to_say: "Prefer not to say" };


/* ---------------------------------------------------------------------------
   Data loaders (cached per page view)
--------------------------------------------------------------------------- */

async function loadEnrollments(force) {
    if (enrollmentsCache && !force) return enrollmentsCache;
    const { data, error } = await sb
        .from("enrollments")
        .select("section, course:courses(id, code, title, description, syllabus, credits, term:terms(id, name, is_current, starts_on), teacher:profiles!courses_teacher_id_fkey(full_name, email))")
        .eq("student_id", currentAccount.id);
    if (error) throw error;
    enrollmentsCache = (data || []).filter(e => e.course);
    enrollmentsCache.sort((a, b) => (b.course.term?.starts_on || "").localeCompare(a.course.term?.starts_on || "") || a.course.code.localeCompare(b.course.code));
    return enrollmentsCache;
}

function one(value) {
    return Array.isArray(value) ? (value[0] || null) : (value || null);
}

async function loadAssignments(force) {
    if (assignmentsCache && !force) return assignmentsCache;
    const { data, error } = await sb
        .from("assignments")
        .select("id, title, description, kind, due_at, max_points, rubric, allow_late, course:courses(id, code, title), submissions(id, status, body, file_paths, submitted_at, grades(score, feedback, rubric_scores, released_at))")
        .order("due_at", { ascending: true, nullsFirst: false });
    if (error) throw error;
    assignmentsCache = (data || []).map(a => {
        const submission = one(a.submissions);
        const grade = submission ? one(submission.grades) : null;
        return Object.assign(a, { submission, grade });
    });
    return assignmentsCache;
}

/* What the student sees: To do / Overdue / Submitted / Graded. */
function assignmentState(a) {
    if (a.grade && a.grade.released_at) return { key: "graded", label: "Graded", badge: "graded" };
    if (a.submission) return { key: "submitted", label: a.submission.status === "submitted" ? "Submitted" : "Awaiting grade", badge: "submitted" };
    if (a.due_at && new Date(a.due_at) < new Date()) return { key: "todo", label: "Overdue", badge: "danger" };
    return { key: "todo", label: "Not started", badge: "not-started" };
}

