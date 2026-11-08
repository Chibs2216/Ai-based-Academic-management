/* ---------------------------------------------------------------------------
   Assignments
--------------------------------------------------------------------------- */

async function loadAssignmentsPage() {
    const root = document.getElementById("assignmentsRoot");
    root.innerHTML = loadingHtml();
    try {
        await loadAssignments(true);
    } catch (e) {
        root.innerHTML = errorHtml(friendlyError(e), "reloadAssignments");
        return;
    }
    renderAssignmentList();
}

function renderAssignmentList() {
    const root = document.getElementById("assignmentsRoot");
    if (!assignmentsCache) return;
    const filter = document.getElementById("assignmentFilter").value;
    const list = assignmentsCache.filter(a => !filter || assignmentState(a).key === filter);

    // Open work first (soonest due), then the rest newest first.
    list.sort((a, b) => {
        const oa = assignmentState(a).key === "todo" ? 0 : 1;
        const ob = assignmentState(b).key === "todo" ? 0 : 1;
        if (oa !== ob) return oa - ob;
        const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
        const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
        return oa === 0 ? da - db : db - da;
    });

    if (!list.length) {
        root.innerHTML = assignmentsCache.length
            ? emptyStateHtml("Nothing here", "No assignments match this filter.", "clipboard")
            : emptyStateHtml("No assignments yet", "Your teachers haven't posted any work.", "clipboard");
        return;
    }

    root.innerHTML = list.map(a => {
        const state = assignmentState(a);
        return `
            <button class="list-row" data-action="viewAssignment" data-assignment-id="${a.id}">
                <div class="list-row-main">
                    <div class="title">${escapeHtml(a.title)}</div>
                    <div class="meta">${escapeHtml(a.course ? a.course.code : "")} Â· ${escapeHtml(KIND_LABELS[a.kind])} Â· ${escapeHtml(state.key === "todo" ? dueText(a.due_at) : (a.due_at ? "Due " + fmtDate(a.due_at) : "No due date"))}</div>
                </div>
                ${a.grade && a.grade.released_at ? `<span class="num small">${fmtNumber(a.grade.score, 1)}/${fmtNumber(a.max_points, 1)}</span>` : ""}
                <span class="badge badge--${state.badge}">${escapeHtml(state.label)}</span>
            </button>`;
    }).join("");
}

async function openAssignmentDetail(id) {
    openAssignmentId = id;
    showPage("assignment-detail", { nav: "assignments", title: "Assignment", skipLoad: true });
    const root = document.getElementById("assignmentDetailRoot");
    root.innerHTML = loadingHtml();
    try {
        await loadAssignments(true);
    } catch (e) {
        root.innerHTML = errorHtml(friendlyError(e));
        return;
    }
    const a = assignmentsCache.find(x => x.id === id);
    if (!a) {
        root.innerHTML = emptyStateHtml("Assignment not found", "It may have been removed by your teacher.", "clipboard");
        return;
    }
    setHeader(a.title, `${a.course ? a.course.code + " Â· " + a.course.title : ""}`);

    const state = assignmentState(a);
    const pastDue = a.due_at && new Date(a.due_at) < new Date();
    const canSubmit = (!a.submission || a.submission.status === "submitted") && !(pastDue && !a.allow_late);
    const rubric = Array.isArray(a.rubric) ? a.rubric : [];
    const files = a.submission ? a.submission.file_paths || [] : [];

    root.innerHTML = `
        <div class="panel">
            <div class="section-head">
                <h3>${escapeHtml(a.title)}</h3>
                <span class="badge badge--${state.badge}">${escapeHtml(state.label)}</span>
            </div>
            <dl class="kv" style="margin-bottom: var(--space-4);">
                <dt>Type</dt><dd>${escapeHtml(KIND_LABELS[a.kind])}</dd>
                <dt>Due</dt><dd>${a.due_at ? escapeHtml(fmtDateTime(a.due_at)) + ` <span class="muted small">(${escapeHtml(dueText(a.due_at))})</span>` : "No due date"}</dd>
                <dt>Points</dt><dd>${fmtNumber(a.max_points, 1)}</dd>
                ${!a.allow_late ? "<dt>Late work</dt><dd>Not accepted after the deadline</dd>" : ""}
            </dl>
            <p class="material-text">${escapeHtml(a.description || "")}</p>
            ${rubric.length ? `
                <h4 style="margin-top: var(--space-4);">Marking rubric</h4>
                <div class="rubric">${rubric.map(r => `<div class="rubric-row"><span>${escapeHtml(r.criterion)}</span><span class="num">${fmtNumber(r.max_points, 1)} pts</span></div>`).join("")}</div>` : ""}
        </div>

        ${a.grade && a.grade.released_at ? `
            <div class="panel">
                <h3 class="panel-title">${icon("check")} Your grade</h3>
                <p style="font-size: 22px; font-weight: 600;">${fmtNumber(a.grade.score, 1)} <span class="muted" style="font-size: 15px;">/ ${fmtNumber(a.max_points, 1)}</span></p>
                ${(a.grade.rubric_scores || []).length ? `<div class="rubric">${a.grade.rubric_scores.map(r => `<div class="rubric-row"><span>${escapeHtml(r.criterion)}</span><span class="num">${fmtNumber(r.points, 1)}</span></div>`).join("")}</div>` : ""}
                ${a.grade.feedback ? `<div class="feedback-box"><strong>Feedback</strong><p class="material-text">${escapeHtml(a.grade.feedback)}</p></div>` : ""}
            </div>` : ""}

        ${a.submission ? `
            <div class="panel">
                <h3>Your submission</h3>
                <p class="small muted" style="margin-bottom: var(--space-3);">Submitted ${escapeHtml(fmtDateTime(a.submission.submitted_at))}${a.due_at && new Date(a.submission.submitted_at) > new Date(a.due_at) ? ' Â· <span class="badge badge--warning">Late</span>' : ""}</p>
                ${a.submission.body ? `<div class="feedback-box material-text">${escapeHtml(a.submission.body)}</div>` : ""}
                ${files.length ? `<div class="pill-list" style="margin-top: var(--space-3);">${files.map(path => `<button class="btn btn-ghost btn-sm" data-action="downloadSubmissionFile" data-path="${escapeHtml(path)}">${icon("download", "icon-sm")} ${escapeHtml(path.split("/").pop().replace(/^\d+-/, ""))}</button>`).join("")}</div>` : ""}
                ${a.submission.status !== "submitted" && !(a.grade && a.grade.released_at) ? '<p class="field-hint" style="margin-top: var(--space-3);">Your teacher has graded this. You will see the grade once it is released.</p>' : ""}
            </div>` : ""}

        ${canSubmit ? `
            <form class="panel" data-submit="submitAssignment">
                <h3>${a.submission ? "Update your submission" : "Submit your work"}</h3>
                ${pastDue ? `<div class="banner banner--warning">${icon("alert")}<span>The deadline has passed. Your submission will be marked late.</span></div>` : ""}
                <div class="field-group">
                    <label for="assignmentAnswer">Your answer</label>
                    <textarea class="field short" id="assignmentAnswer" placeholder="Write your answer or a note for your teacher...">${escapeHtml(a.submission ? a.submission.body : "")}</textarea>
                </div>
                <div class="field-group">
                    <label for="assignmentFiles">Attach files (optional)</label>
                    <input class="field" type="file" id="assignmentFiles" multiple accept=".pdf,.doc,.docx,.pptx,.zip,.txt,.md,.png,.jpg,.jpeg,.webp">
                    <p class="field-hint">PDF, Word, PowerPoint, ZIP, text or images. Up to 25 MB each.${files.length ? " New files are added to the ones already submitted." : ""}</p>
                </div>
                <div class="upload-progress hidden"></div>
                <button class="btn btn-primary" type="submit">${icon("send", "icon-sm")} ${a.submission ? "Update submission" : "Submit assignment"}</button>
            </form>` : (!a.submission && pastDue ? `<div class="banner banner--danger">${icon("alert")}<span>The deadline has passed and this assignment doesn't accept late work. Contact your teacher if you need an extension.</span></div>` : "")}`;
}

async function submitAssignment(form) {
    const a = assignmentsCache.find(x => x.id === openAssignmentId);
    if (!a) return;
    const body = form.querySelector("#assignmentAnswer").value.trim();
    const fileInput = form.querySelector("#assignmentFiles");
    const files = Array.from(fileInput.files || []);

    for (const file of files) {
        if (file.size > SUBMISSION_MAX_BYTES) return showToast(`${file.name} is larger than 25 MB.`, "error");
        if (file.type && !SUBMISSION_TYPES.includes(file.type)) return showToast(`${file.name} is not an allowed file type.`, "error");
    }
    if (!body && !files.length && !(a.submission && a.submission.file_paths.length)) {
        return showToast("Write an answer or attach a file before submitting.", "error");
    }

    const progress = form.querySelector(".upload-progress");
    await withBusy(form.querySelector('button[type="submit"]'), async () => {
        const paths = a.submission ? [...(a.submission.file_paths || [])] : [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            progress.classList.remove("hidden");
            progress.innerHTML = `
                <div class="progress-header"><span>Uploading ${escapeHtml(file.name)}</span><span>${i + 1} of ${files.length}</span></div>
                <div class="progress-bar"><div style="width: ${Math.round((i / files.length) * 100)}%"></div></div>`;
            const safeName = file.name.replace(/[^\w.\-]+/g, "_");
            const path = `${a.id}/${currentAccount.id}/${Date.now()}-${safeName}`;
            const { error } = await sb.storage.from("submissions").upload(path, file, { contentType: file.type || undefined });
            if (error) {
                progress.innerHTML = `<p class="field-error">${escapeHtml(file.name)} failed to upload: ${escapeHtml(friendlyError(error))}</p>`;
                return;
            }
            paths.push(path);
        }
        progress.classList.add("hidden");

        const { error } = await sb.from("submissions").upsert(
            { assignment_id: a.id, student_id: currentAccount.id, body, file_paths: paths },
            { onConflict: "assignment_id,student_id" });
        if (error) return showToast(friendlyError(error), "error");

        showToast(a.submission ? "Submission updated" : "Assignment submitted");
        openAssignmentDetail(a.id);
    });
}


