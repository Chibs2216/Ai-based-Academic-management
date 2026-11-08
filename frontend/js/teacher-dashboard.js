/* Read-only teacher home data. Kept separate from grading and announcements. */
function teacherCard(label, value) {
    const card = [...document.querySelectorAll(".card")].find(item => item.querySelector("h3")?.textContent === label);
    if (card) card.querySelector("strong").textContent = fmtNumber(value);
}

async function loadTeacherDashboard() {
    const { data, error } = await sb.rpc("teacher_dashboard");
    if (error) return showToast(friendlyError(error), "error");
    teacherCard("Classes", data.classes_count);
    teacherCard("Students", data.students_count);
    teacherCard("Pending Grading", data.pending_grading);
    teacherCard("Announcements", data.announcements_30d);
    const root = document.querySelector(".teacher-dashboard-submissions");
    if (!root) return;
    root.innerHTML = (data.recent_submissions || []).map(item => `
        <div class="activity-item"><span class="activity-icon activity-icon--blue">${icon("clipboard")}</span>
        <div class="activity-body"><div class="title">${escapeHtml(item.student)} submitted ${escapeHtml(item.assignment)}</div>
        <div class="meta">${escapeHtml(item.course_code)} · ${escapeHtml(timeAgo(item.submitted_at))}</div></div></div>`).join("")
        || emptyStateHtml("All caught up", "No submissions are waiting for review.", "clipboard");
}
