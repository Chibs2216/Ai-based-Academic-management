const session = requireRole("student");

let openCourseId = null;
let openAssignmentId = null;
let hostelShortlist = [];


/* MOCK DATA */

const COURSES = {

    "web-eng": {
        title: "Web Engineering",
        teacher: "Mr. Rahman",
        term: "Fall 2026",
        syllabus: "This course covers modern front-end and back-end web development: HTML/CSS fundamentals, JavaScript, responsive design, REST APIs, and deployment. Weekly labs, a midterm, and a final group project.",
        materials: [
            {
                title: "Lecture 05 - Responsive Layouts",
                text: "Responsive layouts adapt to different screen sizes using flexible grids, relative units, and media queries. Flexbox and CSS Grid are the two main layout tools for building responsive interfaces. Media queries let you apply different styles below or above a given viewport width. Mobile-first design starts with the smallest screen and adds complexity as the viewport grows. Testing across real devices catches issues that a resized browser window can miss."
            },
            {
                title: "Lecture 06 - JavaScript DOM Basics",
                text: "The DOM represents an HTML document as a tree of nodes that JavaScript can read and modify. Methods like querySelector and addEventListener are the most common way to select elements and respond to user interaction. Changing an element's classList is usually safer than rewriting its style attribute directly. Event delegation lets a single listener handle events for many child elements, which is useful for dynamically created content. Keeping DOM updates batched avoids unnecessary layout recalculation."
            }
        ],
        announcements: [
            { title: "Midterm moved to next week", date: "Aug 15" },
            { title: "Lab 5 solutions posted", date: "Aug 10" }
        ],
        grades: [
            { item: "Assignment 1", score: "18/20" },
            { item: "Quiz 1", score: "9/10" },
            { item: "Midterm", score: "42/50" }
        ]
    },

    "db-mgmt": {
        title: "Database Management",
        teacher: "Ms. Akter",
        term: "Fall 2026",
        syllabus: "An introduction to relational database design and SQL: normalization, indexing, transactions, and query optimization. Includes a semester-long lab project building and querying a multi-table database.",
        materials: [
            {
                title: "Lecture 03 - Normalization",
                text: "Normalization reduces data redundancy by organizing tables around a single, well-defined purpose. First normal form removes repeating groups so every column holds a single value. Second normal form removes partial dependencies on part of a composite key. Third normal form removes columns that depend on other non-key columns rather than the key itself. Over-normalizing can hurt read performance, so real schemas often balance normalization with practical query needs."
            },
            {
                title: "Lecture 04 - SQL Joins",
                text: "Joins combine rows from two or more tables based on a related column, usually a foreign key. An inner join returns only rows that match in both tables. A left join returns every row from the left table plus matching rows from the right, filling unmatched columns with null. Understanding join order and indexing is essential for query performance on large tables. Common mistakes include joining on the wrong column or forgetting a join condition entirely, which produces a cartesian product."
            }
        ],
        announcements: [
            { title: "Lab 3 deadline extended by 2 days", date: "Aug 12" }
        ],
        grades: [
            { item: "Lab 1", score: "15/15" },
            { item: "Lab 2", score: "13/15" },
            { item: "Quiz 1", score: "8/10" }
        ]
    },

    "comp-net": {
        title: "Computer Networks",
        teacher: "Mr. Hasan",
        term: "Fall 2026",
        syllabus: "Covers the OSI and TCP/IP models, routing, switching, and network security fundamentals. Includes hands-on labs using packet capture tools to inspect real traffic.",
        materials: [
            {
                title: "Lecture 02 - TCP/IP Fundamentals",
                text: "The TCP/IP model organizes network communication into four layers: link, internet, transport, and application. TCP provides reliable, ordered delivery through acknowledgments and retransmission, while UDP trades reliability for lower overhead. IP addresses identify hosts on a network, and subnetting divides a network into smaller routable segments. Ports let a single IP address host many independent services at once. Understanding this layering is essential for diagnosing where a network problem is actually occurring."
            }
        ],
        announcements: [
            { title: "Midterm examination schedule updated", date: "Aug 9" }
        ],
        grades: [
            { item: "Assignment 1", score: "17/20" },
            { item: "Quiz 1", score: "9/10" }
        ]
    }

};

const ASSIGNMENTS = [
    {
        id: "a1",
        title: "Web Engineering Assignment 2",
        course: "Web Engineering",
        due: "in 2 days",
        status: "not-started",
        description: "Build a responsive navigation bar component using CSS Flexbox that collapses into a menu on small screens."
    },
    {
        id: "a2",
        title: "Database Lab Report",
        course: "Database Management",
        due: "in 5 days",
        status: "not-started",
        description: "Write up your findings from Lab 3, including your normalized schema and three sample queries."
    },
    {
        id: "a3",
        title: "AI Project Proposal",
        course: "AI Fundamentals",
        due: "in 1 week",
        status: "not-started",
        description: "Submit a one-page proposal describing the problem, dataset, and approach for your term project."
    },
    {
        id: "a4",
        title: "Networks Quiz Reflection",
        course: "Computer Networks",
        due: "Aug 10",
        status: "graded",
        description: "Short reflection on the TCP/IP quiz results.",
        grade: "9/10"
    },
    {
        id: "a5",
        title: "Web Engineering Assignment 1",
        course: "Web Engineering",
        due: "Aug 5",
        status: "submitted",
        description: "Build a static landing page using semantic HTML."
    }
];

const HOSTEL_LISTINGS = [
    { id: "h1", name: "Ahmed Hasan", block: "West Hall", budget: "3000-4000", lifestyle: "Quiet environment", compatibility: 92, contact: "ahmed.hasan@uni.edu" },
    { id: "h2", name: "Rakib Hossain", block: "East Wing", budget: "4000-5000", lifestyle: "Social environment", compatibility: 78, contact: "rakib.h@uni.edu" },
    { id: "h3", name: "Farhan Kabir", block: "North Block", budget: "3000-4000", lifestyle: "Balanced", compatibility: 85, contact: "farhan.k@uni.edu" }
];

const NOTIFICATIONS_STUDENT = [
    { id: "n1", type: "grades", title: "Your Web Engineering assignment has been graded", meta: "Grade: A", read: false },
    { id: "n2", type: "announcements", title: "New assignment posted in Web Engineering", meta: "Mr. Rahman", read: false },
    { id: "n3", type: "announcements", title: "New Database Management material available", meta: "Ms. Akter", read: true },
    { id: "n4", type: "hostel", title: "New roommate match found", meta: "92% compatibility with Ahmed Hasan", read: false },
    { id: "n5", type: "system", title: "Midterm examination schedule updated", meta: "Registrar's office", read: true }
];

function getNotificationData() {
    return NOTIFICATIONS_STUDENT;
}


/* COURSE DETAIL + AI SUMMARIZER */

function openCourseDetail(courseId) {

    const course = COURSES[courseId];
    if (!course) return;

    openCourseId = courseId;

    document.querySelector(".course-detail-title").textContent = course.title;
    document.querySelector(".course-detail-meta").textContent = `${course.teacher} • ${course.term}`;
    document.querySelector(".course-detail-syllabus").textContent = course.syllabus;

    document.querySelector(".course-detail-materials").innerHTML =
        course.materials.map((material, index) => `
            <div class="material-block">
                <div class="material">
                    <span class="material-name">
                        <svg class="icon" aria-hidden="true"><use href="#icon-materials"></use></svg>
                        ${escapeHtml(material.title)}
                    </span>
                    <button class="btn btn-ghost" data-action="summarizeMaterial" data-material-index="${index}">
                        <svg class="icon" aria-hidden="true"><use href="#icon-ai"></use></svg>
                        Summarize with AI
                    </button>
                </div>
                <div class="material-summary hidden" data-material-index="${index}"></div>
            </div>
        `).join("");

    document.querySelector(".course-detail-announcements").innerHTML =
        course.announcements.map(a => `
            <div class="notification">
                <svg class="icon" aria-hidden="true"><use href="#icon-megaphone"></use></svg>
                <div>
                    <strong>${escapeHtml(a.title)}</strong>
                    <div class="meta">${escapeHtml(a.date)}</div>
                </div>
            </div>
        `).join("");

    document.querySelector(".course-detail-grades").innerHTML = `
        <table>
            <thead><tr><th>Item</th><th>Score</th></tr></thead>
            <tbody>
                ${course.grades.map(g => `<tr><td>${escapeHtml(g.item)}</td><td>${escapeHtml(g.score)}</td></tr>`).join("")}
            </tbody>
        </table>
    `;

    const tabsWrapper = document.querySelector(".tabs-wrapper");
    tabsWrapper.querySelectorAll('[data-action="switchTab"]').forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === "syllabus");
    });
    tabsWrapper.querySelectorAll("[data-tab-content]").forEach(content => {
        content.classList.toggle("hidden", content.dataset.tabContent !== "syllabus");
    });

    showPage("course-detail", { title: course.title, subtitle: "Syllabus, materials, and grades" });
}

function summarizeMaterial(btn) {

    const index = btn.dataset.materialIndex;
    const material = COURSES[openCourseId].materials[index];
    const summaryEl = btn.closest(".material-block").querySelector(".material-summary");

    summaryEl.classList.remove("hidden");
    summaryEl.innerHTML = `<p class="summary-loading">Generating summary...</p>`;

    setTimeout(() => renderMaterialSummary(summaryEl, material, "short"), 700);
}

function toggleSummaryLength(btn) {

    const summaryEl = btn.closest(".material-summary");
    const material = COURSES[openCourseId].materials[summaryEl.dataset.materialIndex];
    const nextLength = summaryEl.dataset.length === "detailed" ? "short" : "detailed";

    renderMaterialSummary(summaryEl, material, nextLength);
}

function renderMaterialSummary(summaryEl, material, length) {

    const sentences = material.text.split(".").filter(sentence => sentence.trim().length > 0);
    const count = length === "detailed" ? 5 : 2;
    const summary = sentences.slice(0, count).join(". ") + ".";

    summaryEl.dataset.length = length;

    summaryEl.innerHTML = `
        <strong>AI Summary</strong>
        <span class="tag tag--purple">${length === "detailed" ? "Detailed" : "Short"}</span>
        <br><br>
        ${escapeHtml(summary)}
        <div class="summary-actions">
            <button class="btn btn-ghost btn-sm" data-action="toggleSummaryLength">
                Show ${length === "detailed" ? "shorter" : "more detailed"} summary
            </button>
        </div>
    `;
}


/* ASSIGNMENTS */

function renderAssignments() {

    const container = document.querySelector(".assignments-list");
    if (!container) return;

    if (ASSIGNMENTS.length === 0) {
        container.innerHTML = emptyStateHtml("No assignments yet", "Your teacher hasn't posted any assignments.");
        return;
    }

    container.innerHTML = ASSIGNMENTS.map(a => `
        <button class="list-row" data-action="viewAssignment" data-assignment-id="${a.id}">
            <div class="list-row-main">
                <div class="title">${escapeHtml(a.title)}</div>
                <div class="meta">${escapeHtml(a.course)} • Due ${escapeHtml(a.due)}</div>
            </div>
            <span class="badge badge--${a.status}">${statusLabel(a.status)}</span>
        </button>
    `).join("");
}

function openAssignmentDetail(id) {

    const assignment = ASSIGNMENTS.find(a => a.id === id);
    if (!assignment) return;

    openAssignmentId = id;

    const content = document.querySelector(".assignment-detail-content");

    if (assignment.status === "not-started") {

        content.innerHTML = `
            <h3>${escapeHtml(assignment.title)}</h3>
            <p class="meta">${escapeHtml(assignment.course)} • Due ${escapeHtml(assignment.due)}</p>
            <p>${escapeHtml(assignment.description)}</p>

            <div class="field-group">
                <label for="assignmentAnswer">Your answer</label>
                <textarea class="field" id="assignmentAnswer" placeholder="Write your answer here..."></textarea>
            </div>

            <div class="field-group">
                <label for="assignmentFile">Attach a file (optional)</label>
                <input class="field" type="file" id="assignmentFile">
            </div>

            <button class="btn btn-primary" data-action="submitAssignment">Submit Assignment</button>
        `;

    } else {

        const statusText = assignment.status === "graded"
            ? `Graded — ${escapeHtml(assignment.grade || "")}`
            : "Your submission has been received and is awaiting grading.";

        content.innerHTML = `
            <h3>${escapeHtml(assignment.title)}</h3>
            <p class="meta">${escapeHtml(assignment.course)} • Due ${escapeHtml(assignment.due)}</p>
            <span class="badge badge--${assignment.status}">${statusLabel(assignment.status)}</span>
            <p style="margin-top: var(--space-4);">${statusText}</p>
        `;
    }

    showPage("assignment-detail", { title: assignment.title, subtitle: assignment.course });
}

function submitAssignment() {

    const assignment = ASSIGNMENTS.find(a => a.id === openAssignmentId);
    if (!assignment) return;

    assignment.status = "submitted";

    showToast("Assignment submitted");
    renderAssignments();
    openAssignmentDetail(openAssignmentId);
}


/* HOSTEL ROOMMATE FINDER */

function compatibilityTag(score) {
    if (score >= 90) return "tag--green";
    if (score >= 75) return "tag--purple";
    return "tag--orange";
}

function hostelCardHtml(listing, isShortlisted) {

    return `
        <div class="hostel-card" data-listing-id="${listing.id}">
            <div class="hostel-card-main">
                <div class="title">${escapeHtml(listing.name)}</div>
                <div class="meta">${escapeHtml(listing.block)} • ৳${escapeHtml(listing.budget)} • ${escapeHtml(listing.lifestyle)}</div>
                <div class="hostel-card-contact hidden"></div>
            </div>
            <span class="tag ${compatibilityTag(listing.compatibility)}">${listing.compatibility}% match</span>
            <div class="hostel-card-actions">
                <button class="btn btn-ghost btn-sm" data-action="toggleShortlist" data-listing-id="${listing.id}">
                    ${isShortlisted ? "Remove" : "Shortlist"}
                </button>
                <button class="btn btn-primary btn-sm" data-action="revealContact" data-listing-id="${listing.id}">
                    <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-send"></use></svg>
                    Contact
                </button>
            </div>
        </div>
    `;
}

function renderHostelResults() {

    const container = document.querySelector(".hostel-results");
    if (!container) return;

    const budget = document.querySelector("#hostelBudgetFilter").value;
    const block = document.querySelector("#hostelBlockFilter").value;
    const lifestyle = document.querySelector("#hostelLifestyleFilter").value;

    const filtered = HOSTEL_LISTINGS.filter(listing =>
        (!budget || listing.budget === budget) &&
        (!block || listing.block === block) &&
        (!lifestyle || listing.lifestyle === lifestyle)
    );

    if (filtered.length === 0) {
        container.innerHTML = emptyStateHtml("No matches found", "Try widening your search filters.");
        return;
    }

    container.innerHTML = filtered
        .map(listing => hostelCardHtml(listing, hostelShortlist.includes(listing.id)))
        .join("");
}

function toggleShortlist(id) {

    if (hostelShortlist.includes(id)) {
        hostelShortlist = hostelShortlist.filter(existingId => existingId !== id);
        showToast("Removed from shortlist");
    } else {
        hostelShortlist.push(id);
        showToast("Added to shortlist");
    }

    renderHostelResults();
    renderShortlist();
}

function revealContact(id, cardEl) {

    const listing = HOSTEL_LISTINGS.find(l => l.id === id);
    if (!listing) return;

    const contactEl = cardEl.querySelector(".hostel-card-contact");
    contactEl.textContent = "Contact: " + listing.contact;
    contactEl.classList.remove("hidden");

    showToast("Contact info revealed");
}

function renderShortlist() {

    const container = document.querySelector(".hostel-shortlist");
    if (!container) return;

    const listings = HOSTEL_LISTINGS.filter(listing => hostelShortlist.includes(listing.id));

    if (listings.length === 0) {
        container.innerHTML = emptyStateHtml("No shortlisted matches", "Shortlist a roommate from the Browse tab to see them here.");
        return;
    }

    container.innerHTML = listings.map(listing => hostelCardHtml(listing, true)).join("");
}

function saveHostelProfile() {
    showToast("Roommate profile saved");
}


/* INIT */

if (session) {

    currentUser = session.username;

    document.querySelector(".user-role").textContent =
        session.role.charAt(0).toUpperCase() + session.role.slice(1);

    document.querySelector(".user-avatar").textContent =
        session.username.charAt(0).toUpperCase();

    renderAssignments();
    renderHostelResults();
    renderShortlist();
    renderNotifications();

    showPage("dashboard");
}
