/* Dashboard */

async function loadDashboard() {
    const root = document.getElementById("dashboardRoot");
    root.innerHTML = loadingHtml("Loading your dashboard...");

    const { data, error } = await sb.rpc("student_dashboard");
    if (error) {
        root.innerHTML = errorHtml(friendlyError(error), "reloadDashboard");
        return;
    }

    const d = data;
    const isNew = d.courses_count === 0;

    root.innerHTML = `
        ${isNew ? `<div class="banner">${icon("courses")}<span>You're not enrolled in any courses yet. Once your department enrolls you, your courses, deadlines and grades will appear here.</span></div>` : ""}
        <div class="cards">
            ${statCard("purple", "progress", "GPA", d.gpa !== null ? fmtNumber(d.gpa, 2) : "-",
                d.gpa !== null ? `${fmtNumber(d.credits_completed, 1)} credits graded` : "No released grades yet")}
            ${statCard("blue", "calendar", "Attendance", d.attendance_pct !== null ? fmtNumber(d.attendance_pct, 1) + "%" : "-",
                d.attendance_pct !== null ? (d.attendance_pct < 75 ? "Below the 75% requirement" : "Present or late") : "No classes recorded yet")}
            ${statCard("green", "clipboard", "Pending work", d.pending_assignments,
                d.overdue_assignments ? `${d.overdue_assignments} overdue` : "Nothing overdue")}
            ${statCard("orange", "notifications", "Notifications", d.unread_notifications, "Unread")}
        </div>

        <div class="dashboard-grid">
            <div>
                <div class="panel">
                    <div class="panel-header">
                        <h3 class="panel-title">${icon("progress")} GPA by term</h3>
                        ${d.current_term_gpa !== null ? `<span class="tag tag--purple">This term: ${fmtNumber(d.current_term_gpa, 2)}</span>` : ""}
                    </div>
                    <div id="gpaChart"></div>
                </div>
                <div class="panel">
                    <div class="panel-header">
                        <h3 class="panel-title">${icon("courses")} Courses</h3>
                        <button class="btn btn-ghost btn-sm" data-action="goPage" data-target="courses">All courses ${icon("arrow-right", "icon-sm")}</button>
                    </div>
                    ${d.courses.length ? `
                        <div class="table-wrap"><table>
                            <thead><tr><th>Course</th><th>Term</th><th class="num">Score</th><th>Grade</th><th class="num">Attendance</th></tr></thead>
                            <tbody>
                                ${d.courses.map(c => `
                                    <tr>
                                        <td><button class="link-btn" data-action="viewCourse" data-course-id="${c.course_id}">${escapeHtml(c.code)}</button> ${escapeHtml(c.title)}</td>
                                        <td>${escapeHtml(c.term || "")}</td>
                                        <td class="num">${c.percentage !== null ? fmtNumber(c.percentage, 1) + "%" : "-"}</td>
                                        <td>${c.letter ? `<span class="badge badge--graded">${escapeHtml(c.letter)}</span>` : '<span class="muted small">No grades yet</span>'}</td>
                                        <td class="num">${c.attendance_pct !== null ? fmtNumber(c.attendance_pct, 1) + "%" : "-"}</td>
                                    </tr>`).join("")}
                            </tbody>
                        </table></div>` : emptyStateHtml("No courses yet", "Your enrolled courses will show here.", "courses")}
                </div>
            </div>

            <div class="dashboard-side">
                <div class="panel">
                    <div class="panel-header">
                        <h3 class="panel-title">${icon("calendar")} Due soon</h3>
                        <button class="btn btn-ghost btn-sm" data-action="goPage" data-target="assignments">All work</button>
                    </div>
                    ${d.due_soon.length ? d.due_soon.map(w => `
                        <button class="deadline-item" style="width:100%; text-align:left;" data-action="viewAssignment" data-assignment-id="${w.id}">
                            <span class="deadline-icon deadline-icon--${w.overdue ? "orange" : "purple"}">${icon("calendar")}</span>
                            <div class="deadline-body">
                                <div class="title">${escapeHtml(w.title)}</div>
                                <div class="meta">${escapeHtml(dueText(w.due_at))}</div>
                            </div>
                            <span class="tag ${w.overdue ? "tag--orange" : "tag--purple"}">${escapeHtml(w.code)}</span>
                        </button>`).join("")
                    : emptyStateHtml("Nothing due", "You have no open work in the next weeks.", "check")}
                </div>
            </div>
        </div>`;

    const chart = document.getElementById("gpaChart");
    if (d.gpa_trend.length) {
        renderLineChart(chart, d.gpa_trend.map(t => ({ label: t.term, value: Number(t.gpa) })), {
            min: 0, max: 4, ticks: [0, 2, 3, 4], format: v => Number(v).toFixed(2).replace(/\.00$/, ""),
            ariaLabel: "GPA by term: " + d.gpa_trend.map(t => `${t.term} ${t.gpa}`).join(", ")
        });
    } else {
        chart.innerHTML = emptyStateHtml("No GPA yet", "Your GPA appears once teachers release grades.", "progress");
    }
}

function statCard(color, iconName, title, value, sub) {
    return `
        <div class="card card--${color}">
            <div class="card-icon">${icon(iconName)}</div>
            <div class="card-body">
                <h3>${escapeHtml(title)}</h3>
                <strong>${escapeHtml(value)}</strong>
                <p class="sub">${escapeHtml(sub)}</p>
            </div>
            <svg class="card-watermark" aria-hidden="true"><use href="#icon-${iconName}"></use></svg>
        </div>`;
}


