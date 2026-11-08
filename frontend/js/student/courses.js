/* ---------------------------------------------------------------------------
   Courses
--------------------------------------------------------------------------- */

async function loadCourses() {
    const root = document.getElementById("coursesRoot");
    root.innerHTML = loadingHtml();
    let enrollments;
    try {
        enrollments = await loadEnrollments(true);
    } catch (e) {
        root.innerHTML = errorHtml(friendlyError(e), "reloadCourses");
        return;
    }

    const filter = document.getElementById("termFilter");
    const terms = [];
    enrollments.forEach(e => {
        if (e.course.term && !terms.find(t => t.id === e.course.term.id)) terms.push(e.course.term);
    });
    const current = terms.find(t => t.is_current);
    const previous = filter.value;
    filter.innerHTML = `<option value="">All terms</option>` + terms.map(t =>
        `<option value="${t.id}">${escapeHtml(t.name)}${t.is_current ? " (current)" : ""}</option>`).join("");
    filter.value = previous && terms.find(t => t.id === previous) ? previous : (current ? current.id : "");
    renderCourseTable();
}

function renderCourseTable() {
    const root = document.getElementById("coursesRoot");
    const termId = document.getElementById("termFilter").value;
    const rows = enrollmentsCache.filter(e => !termId || (e.course.term && e.course.term.id === termId));
    if (!rows.length) {
        root.innerHTML = emptyStateHtml("No courses", termId ? "You have no courses in this term." : "You aren't enrolled in any course yet.", "courses");
        return;
    }
    root.innerHTML = `
        <div class="table-wrap"><table>
            <thead><tr><th>Course</th><th>Teacher</th><th>Term</th><th>Section</th><th class="num">Credits</th><th></th></tr></thead>
            <tbody>
                ${rows.map(e => `
                    <tr>
                        <td><strong>${escapeHtml(e.course.code)}</strong> ${escapeHtml(e.course.title)}</td>
                        <td>${escapeHtml(e.course.teacher ? e.course.teacher.full_name : "To be assigned")}</td>
                        <td>${escapeHtml(e.course.term ? e.course.term.name : "")}</td>
                        <td>${escapeHtml(e.section)}</td>
                        <td class="num">${fmtNumber(e.course.credits, 1)}</td>
                        <td><button class="btn btn-ghost btn-sm" data-action="viewCourse" data-course-id="${e.course.id}">View ${icon("arrow-right", "icon-sm")}</button></td>
                    </tr>`).join("")}
            </tbody>
        </table></div>`;
}

document.addEventListener("change", (e) => {
    if (e.target.id === "termFilter") renderCourseTable();
    if (e.target.id === "assignmentFilter") renderAssignmentList();
});

async function openCourseDetail(courseId, tab, materialId) {
    showPage("course-detail", { nav: "courses", title: "Course", skipLoad: true });
    const root = document.getElementById("courseDetailRoot");
    root.innerHTML = loadingHtml();

    try {
        await loadEnrollments();
    } catch (e) {
        root.innerHTML = errorHtml(friendlyError(e));
        return;
    }
    const enrollment = enrollmentsCache.find(e => e.course.id === courseId);
    if (!enrollment) {
        root.innerHTML = emptyStateHtml("Course not found", "You may no longer be enrolled in this course.", "courses");
        return;
    }
    const course = enrollment.course;
    openCourse = course;
    setHeader(course.title, `${course.code} Â· ${course.teacher ? course.teacher.full_name : "Teacher to be assigned"} Â· ${course.term ? course.term.name : ""}`);

    const [modulesRes, materialsRes, announcementsRes, assignments, resultRes] = await Promise.all([
        sb.from("course_modules").select("id, title, position").eq("course_id", courseId).order("position"),
        sb.from("materials").select("id, title, kind, module_id, storage_path, external_url, body_text, mime_type, size_bytes, created_at").eq("course_id", courseId).order("created_at"),
        sb.from("announcements").select("id, title, body, section, created_at, author:profiles!announcements_author_id_fkey(full_name)").eq("course_id", courseId).order("created_at", { ascending: false }),
        loadAssignments(true).catch(() => []),
        sb.from("course_results").select("*").eq("course_id", courseId).eq("student_id", currentAccount.id).maybeSingle()
    ]);
    const firstError = modulesRes.error || materialsRes.error || announcementsRes.error;
    if (firstError) {
        root.innerHTML = errorHtml(friendlyError(firstError));
        return;
    }

    const modules = modulesRes.data || [];
    const materials = materialsRes.data || [];
    const courseWork = assignments.filter(a => a.course && a.course.id === courseId);
    const result = resultRes.data;

    const materialGroups = modules.map(m => ({ title: m.title, items: materials.filter(x => x.module_id === m.id) }));
    const loose = materials.filter(x => !x.module_id || !modules.find(m => m.id === x.module_id));
    if (loose.length) materialGroups.push({ title: modules.length ? "Other materials" : "", items: loose });

    root.innerHTML = `
        <div class="panel tabs-wrapper">
            <div class="tab-bar" role="tablist">
                <button class="active" role="tab" data-action="switchTab" data-tab="syllabus">Syllabus</button>
                <button role="tab" data-action="switchTab" data-tab="materials">Materials (${materials.length})</button>
                <button role="tab" data-action="switchTab" data-tab="announcements">Announcements (${(announcementsRes.data || []).length})</button>
                <button role="tab" data-action="switchTab" data-tab="grades">Grades</button>
            </div>

            <div data-tab-content="syllabus">
                ${course.description ? `<p style="margin-bottom: var(--space-3);">${escapeHtml(course.description)}</p>` : ""}
                <p class="material-text">${escapeHtml(course.syllabus || "The teacher hasn't added a syllabus yet.")}</p>
                <dl class="kv" style="margin-top: var(--space-4);">
                    <dt>Credits</dt><dd>${fmtNumber(course.credits, 1)}</dd>
                    <dt>Section</dt><dd>${escapeHtml(enrollment.section)}</dd>
                    ${course.teacher ? `<dt>Teacher</dt><dd>${escapeHtml(course.teacher.full_name)} Â· <a href="mailto:${escapeHtml(course.teacher.email)}">${escapeHtml(course.teacher.email)}</a></dd>` : ""}
                </dl>
            </div>

            <div data-tab-content="materials" class="hidden">
                ${materials.length ? materialGroups.filter(g => g.items.length).map(g => `
                    ${g.title ? `<h4 class="muted small" style="text-transform: uppercase; letter-spacing: 0.04em; margin: var(--space-4) 0 var(--space-2);">${escapeHtml(g.title)}</h4>` : ""}
                    ${g.items.map(materialBlockHtml).join("")}`).join("")
                : emptyStateHtml("No materials yet", "Your teacher hasn't uploaded anything for this course.", "materials")}
            </div>

            <div data-tab-content="announcements" class="hidden">
                ${(announcementsRes.data || []).length ? announcementsRes.data.map(a => `
                    <div class="notification">
                        ${icon("megaphone")}
                        <div>
                            <strong>${escapeHtml(a.title)}</strong>
                            <div class="meta small muted">${escapeHtml(a.author ? a.author.full_name : "")} Â· ${escapeHtml(fmtDateTime(a.created_at))}${a.section ? " Â· Section " + escapeHtml(a.section) : ""}</div>
                            <p style="margin-top: var(--space-2);">${escapeHtml(a.body)}</p>
                        </div>
                    </div>`).join("")
                : emptyStateHtml("No announcements", "Nothing has been posted for this course yet.", "megaphone")}
            </div>

            <div data-tab-content="grades" class="hidden">
                ${result && result.percentage !== null ? `
                    <div class="banner">${icon("progress")}<span>Current result: <strong>${fmtNumber(result.percentage, 1)}%</strong> (${escapeHtml(result.letter)}, ${fmtNumber(result.grade_point, 2)} grade points) from ${result.graded_items} released grade${result.graded_items === 1 ? "" : "s"}.</span></div>` : ""}
                ${courseWork.length ? `
                    <div class="table-wrap"><table>
                        <thead><tr><th>Work</th><th>Due</th><th>Status</th><th class="num">Score</th></tr></thead>
                        <tbody>
                            ${courseWork.map(a => {
                                const state = assignmentState(a);
                                return `<tr>
                                    <td><button class="link-btn" data-action="viewAssignment" data-assignment-id="${a.id}">${escapeHtml(a.title)}</button> <span class="muted small">${escapeHtml(KIND_LABELS[a.kind])}</span></td>
                                    <td>${escapeHtml(a.due_at ? fmtDateTime(a.due_at) : "-")}</td>
                                    <td><span class="badge badge--${state.badge}">${escapeHtml(state.label)}</span></td>
                                    <td class="num">${a.grade && a.grade.released_at ? `${fmtNumber(a.grade.score, 1)} / ${fmtNumber(a.max_points, 1)}` : "-"}</td>
                                </tr>`;
                            }).join("")}
                        </tbody>
                    </table></div>
                    <p class="field-hint">Grades show here once your teacher releases them.</p>`
                : emptyStateHtml("No graded work", "Assignments and quizzes for this course will appear here.", "clipboard")}
            </div>
        </div>`;

    window._courseMaterials = materials;
    if (tab) {
        const tabBtn = root.querySelector(`[data-action="switchTab"][data-tab="${tab}"]`);
        if (tabBtn) switchTab(tabBtn);
    }
    if (materialId) {
        const block = root.querySelector(`.material-block[data-material-id="${materialId}"]`);
        if (block) block.scrollIntoView({ block: "center" });
    }
}

function materialBlockHtml(m) {
    const canSummarize = !!(m.body_text || (m.storage_path && (m.mime_type === "application/pdf" || (m.mime_type || "").startsWith("text/"))));
    return `
        <div class="material-block" data-material-id="${m.id}">
            <div class="material">
                <span class="material-name">
                    ${icon(m.kind === "link" ? "arrow-right" : "materials")}
                    <span>
                        ${escapeHtml(m.title)}
                        <span class="muted small">${escapeHtml(m.kind.toUpperCase())}${m.size_bytes ? " Â· " + fmtBytes(m.size_bytes) : ""}</span>
                    </span>
                </span>
                <span class="form-actions" style="margin-top:0;">
                    <button class="btn btn-ghost" data-action="openMaterial" data-material-id="${m.id}">${icon("eye", "icon-sm")} Open</button>
                    ${canSummarize ? `<button class="btn btn-ghost" data-action="summarizeMaterial" data-material-id="${m.id}" data-length="short">${icon("ai", "icon-sm")} Summarize with AI</button>` : ""}
                </span>
            </div>
            <div class="material-viewer hidden"></div>
            <div class="material-summary hidden" aria-live="polite"></div>
        </div>`;
}

async function openMaterial(el) {
    const material = (window._courseMaterials || []).find(m => m.id === el.dataset.materialId);
    if (!material) return;
    const viewer = el.closest(".material-block").querySelector(".material-viewer");

    if (!viewer.classList.contains("hidden")) {
        viewer.classList.add("hidden");
        viewer.innerHTML = "";
        return;
    }

    if (material.external_url && !material.storage_path) {
        window.open(material.external_url, "_blank", "noopener");
        return;
    }
    viewer.classList.remove("hidden");

    if (material.body_text && !material.storage_path) {
        viewer.innerHTML = `<div class="feedback-box material-text">${escapeHtml(material.body_text)}</div>`;
        return;
    }

    viewer.innerHTML = loadingHtml("Opening file...");
    const { data, error } = await sb.storage.from("course-materials").createSignedUrl(material.storage_path, 3600);
    if (error) {
        viewer.innerHTML = errorHtml("The file couldn't be opened: " + friendlyError(error));
        return;
    }
    const url = data.signedUrl;
    const mime = material.mime_type || "";
    if (mime === "application/pdf" || mime.startsWith("text/")) {
        viewer.innerHTML = `<iframe src="${escapeHtml(url)}" title="${escapeHtml(material.title)}"></iframe>
            <p class="field-hint"><a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open in a new tab</a></p>`;
    } else if (mime.startsWith("video/")) {
        viewer.innerHTML = `<video src="${escapeHtml(url)}" controls preload="metadata"></video>`;
    } else if (mime.startsWith("image/")) {
        viewer.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(material.title)}" style="max-width:100%; border-radius: var(--radius-md);">`;
    } else {
        viewer.innerHTML = `<p>This file type opens in another app. <a class="btn btn-ghost btn-sm" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon("download", "icon-sm")} Download</a></p>`;
    }
}

async function summarizeMaterial(el, regenerate) {
    const block = el.closest(".material-block");
    const summaryEl = block.querySelector(".material-summary");
    const length = el.dataset.length || "short";
    const materialId = block.dataset.materialId;

    summaryEl.classList.remove("hidden");
    summaryEl.innerHTML = `<p class="summary-loading">${regenerate ? "Writing a new" : "Generating the"} ${length} summary. This can take a few seconds...</p>`;

    try {
        const result = await callFunction("summarize-material", { material_id: materialId, length, regenerate: !!regenerate });
        summaryEl.innerHTML = `
            <strong>AI summary</strong>
            <span class="tag tag--purple">${length === "detailed" ? "Detailed" : "Short"}</span>
            ${result.cached ? '<span class="muted small"> Â· saved summary</span>' : ""}
            <p class="material-text" style="margin-top: var(--space-2);">${escapeHtml(result.summary)}</p>
            <p class="field-hint">AI summaries can miss details. Check the material for anything important.</p>
            <div class="summary-actions form-actions">
                <button class="btn btn-ghost btn-sm" data-action="summarizeMaterial" data-length="${length === "detailed" ? "short" : "detailed"}">
                    ${length === "detailed" ? "Shorter summary" : "More detailed summary"}
                </button>
                <button class="btn btn-ghost btn-sm" data-action="regenerateSummary" data-length="${length}">${icon("refresh", "icon-sm")} Regenerate</button>
                <button class="btn btn-ghost btn-sm" data-action="hideSummary">Hide</button>
            </div>`;
    } catch (err) {
        const unavailable = ["ai_unavailable", "ai_disabled", "ai_busy"].includes(err.code);
        summaryEl.innerHTML = `
            <div class="${unavailable ? "banner banner--warning" : "banner banner--danger"}" role="alert" style="margin-bottom:0;">
                ${icon("alert")}
                <span>${escapeHtml(unavailable ? err.message : "The summary couldn't be created: " + err.message)}</span>
            </div>
            ${err.code === "ai_disabled" ? "" : `<div class="summary-actions"><button class="btn btn-ghost btn-sm" data-action="summarizeMaterial" data-length="${length}">${icon("refresh", "icon-sm")} Try again</button></div>`}`;
    }
}


