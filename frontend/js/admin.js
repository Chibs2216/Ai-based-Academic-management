const session = requireRole("admin");

let editingCatalogCourseId = null;


/* MOCK DATA */

const ADMIN_USERS = [
    { id: "u1", name: "Mehrab Ahmed", role: "Student", department: "CSE", status: "active" },
    { id: "u2", name: "Fahim Rahman", role: "Student", department: "CSE", status: "active" },
    { id: "u3", name: "Ms. Akter", role: "Teacher", department: "CSE", status: "active" },
    { id: "u4", name: "Mr. Rahman", role: "Teacher", department: "CSE", status: "active" },
    { id: "u5", name: "Nusrat Jahan", role: "Student", department: "EEE", status: "inactive" }
];

const ADMIN_COURSES = [
    { id: "c1", title: "Web Engineering", department: "CSE", term: "Fall 2026" },
    { id: "c2", title: "Database Management", department: "CSE", term: "Fall 2026" },
    { id: "c3", title: "Computer Networks", department: "CSE", term: "Fall 2026" }
];

const HOSTEL_REPORTS = [
    { id: "r1", listing: "Ahmed Hasan - West Hall", reportedBy: "anonymous", reason: "Suspected fake listing", status: "pending" },
    { id: "r2", listing: "Rakib Hossain - East Wing", reportedBy: "Nusrat Jahan", reason: "Inappropriate contact behavior", status: "pending" }
];

const NOTIFICATIONS_ADMIN = [
    { id: "n1", type: "hostel", title: "New hostel listing reported", meta: "Awaiting moderation review", read: false },
    { id: "n2", type: "system", title: "14 new student accounts created", meta: "Fall 2026 intake", read: false },
    { id: "n3", type: "system", title: "Scheduled maintenance completed", meta: "No downtime recorded", read: true }
];

function getNotificationData() {
    return NOTIFICATIONS_ADMIN;
}


/* USER MANAGEMENT */

function renderAdminUsers() {

    const container = document.querySelector(".admin-users-table");
    if (!container) return;

    const search = (document.querySelector("#userSearch").value || "").toLowerCase();
    const roleFilter = document.querySelector("#userRoleFilter").value;

    const filtered = ADMIN_USERS.filter(user =>
        user.name.toLowerCase().includes(search) &&
        (!roleFilter || user.role === roleFilter)
    );

    if (filtered.length === 0) {
        container.innerHTML = emptyStateHtml("No users found", "Try a different search or role filter.");
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map(user => `
                    <tr>
                        <td><input type="checkbox" class="grading-checkbox admin-user-checkbox" data-user-id="${user.id}"></td>
                        <td>${escapeHtml(user.name)}</td>
                        <td>${escapeHtml(user.role)}</td>
                        <td>${escapeHtml(user.department)}</td>
                        <td><span class="badge badge--${user.status === "active" ? "graded" : "not-started"}">${user.status === "active" ? "Active" : "Inactive"}</span></td>
                        <td><button class="btn btn-ghost btn-sm" data-action="resetUserMfa" data-user-id="${user.id}">Reset MFA</button></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

function filterUsers() {
    renderAdminUsers();
}

function bulkUserAction(el) {

    const checked = document.querySelectorAll(".admin-user-checkbox:checked");

    if (checked.length === 0) {
        showToast("Select at least one user first");
        return;
    }

    const nextStatus = el.dataset.userAction === "deactivate" ? "inactive" : "active";

    checked.forEach(checkbox => {
        const user = ADMIN_USERS.find(u => u.id === checkbox.dataset.userId);
        if (user) user.status = nextStatus;
    });

    showToast(`${checked.length} user(s) updated`);
    renderAdminUsers();
}

function resetUserMfa(id) {

    const user = ADMIN_USERS.find(u => u.id === id);
    if (!user) return;

    showToast(`MFA reset for ${user.name} — audit log entry created`);
}


/* COURSE CATALOG */

function renderCatalog() {

    const container = document.querySelector(".admin-catalog-list");
    if (!container) return;

    if (ADMIN_COURSES.length === 0) {
        container.innerHTML = emptyStateHtml("No courses yet", "Add your first course to the catalog.");
        return;
    }

    container.innerHTML = ADMIN_COURSES.map(course => `
        <div class="list-row-wrapper">
            <div class="list-row-main">
                <div class="title">${escapeHtml(course.title)}</div>
                <div class="meta">${escapeHtml(course.department)} • ${escapeHtml(course.term)}</div>
            </div>
            <button class="btn btn-ghost btn-sm" data-action="editCatalogCourse" data-course-id="${course.id}">
                <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-edit"></use></svg>
            </button>
            <button class="btn btn-ghost btn-sm" data-action="deleteCatalogCourse" data-course-id="${course.id}">
                <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-trash"></use></svg>
            </button>
        </div>
    `).join("");
}

function newCatalogCourse() {

    editingCatalogCourseId = null;

    const form = document.querySelector(".catalog-form");
    form.classList.remove("hidden");
    form.querySelector(".catalog-form-title").textContent = "Add Course";

    form.querySelector("#catalogCourseTitle").value = "";
    form.querySelector("#catalogCourseDept").value = "";
    form.querySelector("#catalogCourseTerm").value = "";

    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function editCatalogCourse(id) {

    const course = ADMIN_COURSES.find(c => c.id === id);
    if (!course) return;

    editingCatalogCourseId = id;

    const form = document.querySelector(".catalog-form");
    form.classList.remove("hidden");
    form.querySelector(".catalog-form-title").textContent = "Edit Course";

    form.querySelector("#catalogCourseTitle").value = course.title;
    form.querySelector("#catalogCourseDept").value = course.department;
    form.querySelector("#catalogCourseTerm").value = course.term;

    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function saveCatalogCourse() {

    const title = document.querySelector("#catalogCourseTitle").value;
    const department = document.querySelector("#catalogCourseDept").value;
    const term = document.querySelector("#catalogCourseTerm").value;

    if (!title || !department || !term) {
        showToast("Please fill in all course fields");
        return;
    }

    if (editingCatalogCourseId) {
        const course = ADMIN_COURSES.find(c => c.id === editingCatalogCourseId);
        course.title = title;
        course.department = department;
        course.term = term;
        showToast("Course updated");
    } else {
        ADMIN_COURSES.push({ id: "c" + (ADMIN_COURSES.length + 1) + "-" + Date.now(), title, department, term });
        showToast("Course added to catalog");
    }

    document.querySelector(".catalog-form").classList.add("hidden");
    renderCatalog();
}

function deleteCatalogCourse(id) {

    const index = ADMIN_COURSES.findIndex(c => c.id === id);
    if (index === -1) return;

    ADMIN_COURSES.splice(index, 1);
    showToast("Course removed from catalog");
    renderCatalog();
}


/* HOSTEL MODERATION */

function renderModerationQueue() {

    const container = document.querySelector(".admin-moderation-queue");
    if (!container) return;

    const pending = HOSTEL_REPORTS.filter(r => r.status === "pending");

    if (pending.length === 0) {
        container.innerHTML = emptyStateHtml("Queue is clear", "No flagged listings need review right now.");
    } else {
        container.innerHTML = pending.map(report => `
            <div class="list-row-wrapper">
                <div class="list-row-main">
                    <div class="title">${escapeHtml(report.listing)}</div>
                    <div class="meta">Reported by ${escapeHtml(report.reportedBy)} • ${escapeHtml(report.reason)}</div>
                </div>
                <button class="btn btn-ghost btn-sm" data-action="resolveReport" data-report-id="${report.id}">Dismiss</button>
                <button class="btn btn-primary btn-sm" data-action="removeListing" data-report-id="${report.id}">Remove Listing</button>
            </div>
        `).join("");
    }

    const pendingCount = pending.length;

    document.querySelectorAll('.nav-item[data-page="moderation"] .nav-badge').forEach(badge => {
        badge.textContent = pendingCount > 0 ? pendingCount : "";
        badge.classList.toggle("hidden", pendingCount === 0);
    });

    const dashboardCount = document.querySelector(".admin-pending-reports-count");
    if (dashboardCount) dashboardCount.textContent = pendingCount;
}

function resolveReport(id) {

    const report = HOSTEL_REPORTS.find(r => r.id === id);
    if (!report) return;

    report.status = "resolved";
    showToast("Report dismissed");
    renderModerationQueue();
}

function removeListing(id) {

    const report = HOSTEL_REPORTS.find(r => r.id === id);
    if (!report) return;

    report.status = "resolved";
    showToast("Listing removed");
    renderModerationQueue();
}


/* INIT */

if (session) {

    currentUser = session.username;

    document.querySelector(".user-role").textContent =
        session.role.charAt(0).toUpperCase() + session.role.slice(1);

    document.querySelector(".user-avatar").textContent =
        session.username.charAt(0).toUpperCase();

    renderAdminUsers();
    renderCatalog();
    renderModerationQueue();
    renderNotifications();

    showPage("dashboard");
}
