const session = requireRole("teacher");

let openSubmissionId = null;


/* MOCK DATA */

const TEACHER_COURSES = [
    { id: "web-eng", title: "Web Engineering", term: "Fall 2026", students: 32, description: "Modern front-end and back-end web development." },
    { id: "db-mgmt", title: "Database Management", term: "Fall 2026", students: 28, description: "Relational database design, SQL, and query optimization." }
];

const GRADING_QUEUE = [
    { id: "s1", student: "Fahim Rahman", assignment: "Assignment 2", course: "Web Engineering", status: "pending" },
    { id: "s2", student: "Nusrat Jahan", assignment: "Assignment 2", course: "Web Engineering", status: "pending" },
    { id: "s3", student: "Tanvir Alam", assignment: "Lab 3 Report", course: "Database Management", status: "pending" },
    { id: "s4", student: "Mehrab Ahmed", assignment: "Lab 3 Report", course: "Database Management", status: "returned" }
];

const ANNOUNCEMENTS = [
    { title: "Midterm schedule posted", body: "Check the course page for your midterm date and room assignment.", audience: "All Classes", date: "Aug 9" }
];

const NOTIFICATIONS_TEACHER = [
    { id: "n1", type: "grades", title: "12 submissions awaiting grading", meta: "Web Engineering & Database Management", read: false },
    { id: "n2", type: "announcements", title: "Your announcement was sent to 32 students", meta: "Web Engineering", read: true },
    { id: "n3", type: "system", title: "Class roster updated for Database Management", meta: "Registrar's office", read: false },
    { id: "n4", type: "system", title: "Midterm examination schedule updated", meta: "Registrar's office", read: true }
];

function getNotificationData() {
    return NOTIFICATIONS_TEACHER;
}


/* COURSE BUILDER */

function editCourse(courseId) {

    const course = TEACHER_COURSES.find(c => c.id === courseId);
    if (!course) return;

    const form = document.querySelector(".course-builder-form");
    form.classList.remove("hidden");

    form.querySelector("#courseTitle").value = course.title;
    form.querySelector("#courseTerm").value = course.term;
    form.querySelector("#courseDescription").value = course.description;

    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}


/* GRADING */

function renderGradingQueue() {

    const container = document.querySelector(".grading-queue");
    if (!container) return;

    if (GRADING_QUEUE.length === 0) {
        container.innerHTML = emptyStateHtml("Queue is empty", "Nothing waiting to be graded right now.");
        return;
    }

    container.innerHTML = GRADING_QUEUE.map(g => `
        <div class="list-row-wrapper">
            <input type="checkbox" class="grading-checkbox" data-submission-id="${g.id}">
            <button class="list-row-main" data-action="openGrading" data-submission-id="${g.id}">
                <div class="title">${escapeHtml(g.student)}</div>
                <div class="meta">${escapeHtml(g.assignment)} • ${escapeHtml(g.course)}</div>
            </button>
            <span class="badge badge--${g.status === "returned" ? "graded" : "pending"}">
                ${g.status === "returned" ? "Returned" : "Pending"}
            </span>
        </div>
    `).join("");
}

function openGradingDetail(id) {

    const submission = GRADING_QUEUE.find(g => g.id === id);
    if (!submission) return;

    openSubmissionId = id;

    const content = document.querySelector(".grading-detail-content");

    content.innerHTML = `
        <h3>${escapeHtml(submission.student)}</h3>
        <p class="meta">${escapeHtml(submission.assignment)} • ${escapeHtml(submission.course)}</p>

        <div class="rubric">
            <div class="rubric-row">
                <span>Content &amp; Accuracy</span>
                <input class="field rubric-input" type="number" min="0" max="10" value="8">
            </div>
            <div class="rubric-row">
                <span>Code Quality</span>
                <input class="field rubric-input" type="number" min="0" max="10" value="7">
            </div>
            <div class="rubric-row">
                <span>Presentation</span>
                <input class="field rubric-input" type="number" min="0" max="5" value="4">
            </div>
        </div>

        <div class="field-group">
            <label for="gradingFeedback">Feedback</label>
            <textarea class="field" id="gradingFeedback" placeholder="Leave feedback for the student..."></textarea>
        </div>

        <button class="btn btn-primary" data-action="returnGrade">Return Grade</button>
    `;

    showPage("grading-detail", { title: submission.student, subtitle: submission.assignment });
}

function returnGrade() {

    const submission = GRADING_QUEUE.find(g => g.id === openSubmissionId);
    if (!submission) return;

    submission.status = "returned";

    showToast("Grade returned to " + submission.student);
    renderGradingQueue();
    showPage("grading");
}

function bulkReturn() {

    const checked = document.querySelectorAll(".grading-checkbox:checked");

    if (checked.length === 0) {
        showToast("Select at least one submission first");
        return;
    }

    checked.forEach(checkbox => {
        const submission = GRADING_QUEUE.find(g => g.id === checkbox.dataset.submissionId);
        if (submission) submission.status = "returned";
    });

    showToast(`${checked.length} grade(s) returned`);
    renderGradingQueue();
}

function renderTeacherDashboardSubmissions() {

    const container = document.querySelector(".teacher-dashboard-submissions");
    if (!container) return;

    const pending = GRADING_QUEUE.filter(g => g.status === "pending");

    if (pending.length === 0) {
        container.innerHTML = emptyStateHtml("All caught up", "No submissions are waiting on you right now.");
        return;
    }

    container.innerHTML = pending.map(g => `
        <div class="activity-item">
            <span class="activity-icon activity-icon--blue">
                <svg class="icon" aria-hidden="true"><use href="#icon-clipboard"></use></svg>
            </span>
            <div class="activity-body">
                <div class="title">${escapeHtml(g.student)} submitted ${escapeHtml(g.assignment)}</div>
                <div class="meta">${escapeHtml(g.course)}</div>
            </div>
        </div>
    `).join("");
}


/* ANNOUNCEMENTS */

function sendAnnouncement() {

    const titleInput = document.getElementById("announcementTitle");
    const bodyInput = document.getElementById("announcementBody");
    const audienceInput = document.getElementById("announcementAudience");

    if (!titleInput.value || !bodyInput.value) {
        showToast("Please fill in a title and message");
        return;
    }

    ANNOUNCEMENTS.unshift({
        title: titleInput.value,
        body: bodyInput.value,
        audience: audienceInput.value,
        date: "Just now"
    });

    titleInput.value = "";
    bodyInput.value = "";

    renderAnnouncements();
    showToast("Announcement sent");
}

function renderAnnouncements() {

    const container = document.querySelector(".announcements-sent");
    if (!container) return;

    container.innerHTML = ANNOUNCEMENTS.map(a => `
        <div class="notification">
            <svg class="icon" aria-hidden="true"><use href="#icon-megaphone"></use></svg>
            <div>
                <strong>${escapeHtml(a.title)}</strong>
                <div class="meta">${escapeHtml(a.audience)} • ${escapeHtml(a.date)}</div>
                <p>${escapeHtml(a.body)}</p>
            </div>
        </div>
    `).join("");
}


/* INIT */

if (session) {

    currentUser = session.username;

    document.querySelector(".user-role").textContent =
        session.role.charAt(0).toUpperCase() + session.role.slice(1);

    document.querySelector(".user-avatar").textContent =
        session.username.charAt(0).toUpperCase();

    renderGradingQueue();
    renderAnnouncements();
    renderTeacherDashboardSubmissions();
    renderNotifications();

    showPage("dashboard");
}
