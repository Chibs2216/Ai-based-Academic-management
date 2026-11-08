/* Submission queue and the single, explicit grade-release action. */
let teacherSubmissions = [];
let activeTeacherSubmission = null;

async function loadGradingQueue() {
    const root = document.querySelector(".grading-queue");
    if (!root) return;
    root.innerHTML = loadingHtml("Loading submissions...");
    const { data, error } = await sb.from("submissions")
        .select("id,student_id,body,file_paths,status,submitted_at,assignment:assignments!inner(title,max_points,course:courses!inner(code,teacher_id))")
        .eq("assignment.course.teacher_id", currentAccount.id).eq("status", "submitted")
        .order("submitted_at", { ascending: false });
    if (error) { root.innerHTML = errorHtml(friendlyError(error), "reloadGrading"); return; }
    const ids = [...new Set((data || []).map(item => item.student_id))];
    const { data: people } = ids.length ? await sb.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] };
    const names = new Map((people || []).map(person => [person.id, person.full_name || person.email]));
    teacherSubmissions = (data || []).map(item => ({ ...item, studentName: names.get(item.student_id) || "Student" }));
    root.innerHTML = teacherSubmissions.map(item => `<div class="list-row-wrapper">
        <button class="list-row-main" data-action="openGrading" data-submission-id="${item.id}"><div class="title">${escapeHtml(item.studentName)}</div>
        <div class="meta">${escapeHtml(item.assignment.title)} · ${escapeHtml(item.assignment.course.code)} · ${escapeHtml(timeAgo(item.submitted_at))}</div></button>
        <span class="badge badge--pending">Pending</span></div>`).join("")
        || emptyStateHtml("Queue is empty", "Nothing is waiting to be graded.", "clipboard");
}

function openGrading(id) {
    activeTeacherSubmission = teacherSubmissions.find(item => item.id === id);
    if (!activeTeacherSubmission) return;
    const item = activeTeacherSubmission;
    const root = document.querySelector(".grading-detail-content");
    root.innerHTML = `<h3>${escapeHtml(item.studentName)}</h3><p class="meta">${escapeHtml(item.assignment.title)} · ${escapeHtml(item.assignment.course.code)}</p>
        <p>${escapeHtml(item.body || "No written response.")}</p>
        ${(item.file_paths || []).map(path => `<p class="small muted">${escapeHtml(path)}</p>`).join("")}
        <form data-submit="releaseGrade"><div class="field-group"><label for="gradeScore">Score (out of ${item.assignment.max_points})</label><input id="gradeScore" class="field" type="number" min="0" max="${item.assignment.max_points}" step="0.01" required></div>
        <div class="field-group"><label for="gradingFeedback">Feedback</label><textarea id="gradingFeedback" class="field"></textarea></div><button class="btn btn-primary" type="submit">Save and release</button></form>`;
    showPage("grading-detail", { title: item.studentName, subtitle: item.assignment.title });
}

async function releaseGrade(form) {
    const item = activeTeacherSubmission;
    if (!item) return;
    const score = Number(form.querySelector("#gradeScore").value);
    if (!Number.isFinite(score) || score < 0 || score > Number(item.assignment.max_points)) return showToast("Enter a valid score.", "error");
    await withBusy(form.querySelector("button"), async () => {
        const { error } = await sb.from("grades").upsert({ submission_id: item.id, score, feedback: form.querySelector("#gradingFeedback").value.trim(), graded_by: currentAccount.id, released_at: new Date().toISOString() });
        if (error) return showToast(friendlyError(error), "error");
        showToast("Grade released to " + item.studentName);
        await loadGradingQueue(); showPage("grading");
    });
}
