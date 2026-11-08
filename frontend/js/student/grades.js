/* ---------------------------------------------------------------------------
   Grades
--------------------------------------------------------------------------- */

async function loadGrades() {
    const root = document.getElementById("gradesRoot");
    root.innerHTML = loadingHtml();
    const { data, error } = await sb.from("course_results").select("*").eq("student_id", currentAccount.id);
    if (error) {
        root.innerHTML = errorHtml(friendlyError(error), "reloadGrades");
        return;
    }
    if (!data.length) {
        root.innerHTML = `<div class="panel">${emptyStateHtml("No grades yet", "Your results appear here once you are enrolled and teachers release grades.", "progress")}</div>`;
        return;
    }

    const terms = {};
    data.forEach(r => {
        const key = r.term_id || "none";
        if (!terms[key]) terms[key] = { name: r.term_name || "No term", starts: r.term_starts_on || "", rows: [] };
        terms[key].rows.push(r);
    });
    const ordered = Object.values(terms).sort((a, b) => b.starts.localeCompare(a.starts));

    let totalPoints = 0, totalCredits = 0;
    data.forEach(r => { if (r.grade_point !== null) { totalPoints += r.grade_point * r.credits; totalCredits += Number(r.credits); } });

    root.innerHTML = `
        <div class="banner">${icon("progress")}<span>Cumulative GPA: <strong>${totalCredits ? (totalPoints / totalCredits).toFixed(2) : "-"}</strong> over ${fmtNumber(totalCredits, 1)} graded credits. Results use released grades only and update as teachers release more.</span></div>
        ${ordered.map(term => {
            let pts = 0, cr = 0;
            term.rows.forEach(r => { if (r.grade_point !== null) { pts += r.grade_point * r.credits; cr += Number(r.credits); } });
            return `
                <div class="panel">
                    <div class="section-head">
                        <h3>${escapeHtml(term.name)}</h3>
                        <span class="tag tag--purple">Term GPA ${cr ? (pts / cr).toFixed(2) : "-"}</span>
                    </div>
                    <div class="table-wrap"><table>
                        <thead><tr><th>Course</th><th class="num">Credits</th><th class="num">Score</th><th>Grade</th><th class="num">Grade point</th><th>Status</th></tr></thead>
                        <tbody>
                            ${term.rows.sort((a, b) => a.code.localeCompare(b.code)).map(r => `
                                <tr>
                                    <td><button class="link-btn" data-action="viewCourse" data-course-id="${r.course_id}" data-tab="grades">${escapeHtml(r.code)}</button> ${escapeHtml(r.title)}</td>
                                    <td class="num">${fmtNumber(r.credits, 1)}</td>
                                    <td class="num">${r.percentage !== null ? fmtNumber(r.percentage, 1) + "%" : "-"}</td>
                                    <td>${r.letter ? escapeHtml(r.letter) : "-"}</td>
                                    <td class="num">${r.grade_point !== null ? Number(r.grade_point).toFixed(2) : "-"}</td>
                                    <td>${r.graded_items ? `<span class="badge badge--graded">${r.graded_items} released</span>` : '<span class="badge badge--not-started">Pending</span>'}</td>
                                </tr>`).join("")}
                        </tbody>
                    </table></div>
                </div>`;
        }).join("")}`;
}


