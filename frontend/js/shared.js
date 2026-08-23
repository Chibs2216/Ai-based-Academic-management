let currentUser = "";


/* SESSION (localStorage-backed, since each portal is now a real page) */

const SESSION_KEY = "uniportal_session";

function saveSession(username, role) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ username, role }));
}

function getSession() {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch (e) {
        return null;
    }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

function requireRole(role) {

    const session = getSession();

    if (!session || session.role !== role) {
        window.location.href = "index.html";
        return null;
    }

    return session;
}

function logout() {
    clearSession();
    window.location.href = "index.html";
}


/* HELPERS */

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function getGreeting() {

    const hour = new Date().getHours();

    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";

    return "Good evening";
}

function statusLabel(status) {

    const labels = {
        "not-started": "Not Started",
        submitted: "Submitted",
        graded: "Graded"
    };

    return labels[status] || status;
}

function emptyStateHtml(title, message) {

    return `
        <div class="empty-state">
            <svg class="icon" aria-hidden="true"><use href="#icon-clipboard"></use></svg>
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

function showToast(message) {

    const container = document.getElementById("toastContainer");

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => toast.classList.add("toast-visible"), 10);

    setTimeout(() => {
        toast.classList.remove("toast-visible");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function saveSettings() {
    showToast("Settings saved");
}


/* PAGE NAVIGATION (one portal per page now, so this operates on `document` directly) */

function showPage(pageName, options) {

    options = options || {};

    document.querySelectorAll(".page").forEach(page => {
        page.classList.add("hidden");
    });

    const target = document.querySelector(`.page[data-page="${pageName}"]`);
    if (target) target.classList.remove("hidden");

    const navItems = document.querySelectorAll(".nav-item[data-page]");
    const hasNavMatch = Array.from(navItems).some(btn => btn.dataset.page === pageName);

    if (hasNavMatch) {
        navItems.forEach(btn => {
            btn.classList.toggle("active", btn.dataset.page === pageName);
        });
    }

    const titleEl = document.querySelector(".page-title");
    const subtitleEl = document.querySelector(".welcome-text");

    if (pageName === "dashboard" && !options.title) {

        titleEl.textContent = `${getGreeting()}, ${currentUser} `;

        const wave = document.createElement("span");
        wave.className = "wave";
        wave.textContent = "👋";
        titleEl.appendChild(wave);

        subtitleEl.textContent = "Here's what's happening today.";

    } else {

        const navItem = document.querySelector(`.nav-item[data-page="${pageName}"]`);

        titleEl.textContent = options.title || (navItem ? navItem.dataset.title : "");
        subtitleEl.textContent = options.subtitle || ("Welcome, " + currentUser + "!");
    }
}

function switchTab(btn) {

    const wrapper = btn.closest(".tabs-wrapper");

    wrapper.querySelectorAll('[data-action="switchTab"]').forEach(b => {
        b.classList.toggle("active", b === btn);
    });

    wrapper.querySelectorAll("[data-tab-content]").forEach(content => {
        content.classList.toggle("hidden", content.dataset.tabContent !== btn.dataset.tab);
    });
}


/* NOTIFICATION CENTER (generic engine; each portal script defines getNotificationData()) */

const NOTIFICATION_GROUPS = [
    { type: "grades", label: "Grades", icon: "icon-progress" },
    { type: "announcements", label: "Announcements", icon: "icon-megaphone" },
    { type: "hostel", label: "Hostel Finder", icon: "icon-roommate" },
    { type: "system", label: "System", icon: "icon-notifications" }
];

function renderNotifications() {

    const container = document.querySelector(".notifications-list");
    if (!container) return;

    const data = getNotificationData();

    const groupsHtml = NOTIFICATION_GROUPS
        .map(group => {
            const items = data.filter(n => n.type === group.type);
            if (items.length === 0) return "";

            return `
                <div class="notification-group">
                    <h4>${escapeHtml(group.label)}</h4>
                    ${items.map(n => `
                        <button class="notification-item ${n.read ? "" : "unread"}" data-action="markNotificationRead" data-notification-id="${n.id}">
                            <svg class="icon" aria-hidden="true"><use href="#${group.icon}"></use></svg>
                            <div class="notification-item-body">
                                <div class="title">${escapeHtml(n.title)}</div>
                                <div class="meta">${escapeHtml(n.meta)}</div>
                            </div>
                            ${n.read ? "" : '<span class="unread-dot"></span>'}
                        </button>
                    `).join("")}
                </div>
            `;
        })
        .join("");

    container.innerHTML = groupsHtml || emptyStateHtml("You're all caught up", "No notifications right now.");

    updateNotificationBadge();
}

function updateNotificationBadge() {

    const data = getNotificationData();
    const unreadCount = data.filter(n => !n.read).length;
    const badge = document.querySelector('.nav-item[data-page="notifications"] .nav-badge');

    if (!badge) return;

    badge.textContent = unreadCount > 0 ? unreadCount : "";
    badge.classList.toggle("hidden", unreadCount === 0);
}

function markNotificationRead(id) {

    const item = getNotificationData().find(n => n.id === id);
    if (item) item.read = true;

    renderNotifications();
}

function markAllNotificationsRead() {

    getNotificationData().forEach(n => { n.read = true; });

    renderNotifications();
    showToast("All notifications marked as read");
}


/* DROPZONE */

function initDropzone() {

    document.querySelectorAll(".dropzone").forEach(zone => {

        zone.addEventListener("dragover", e => {
            e.preventDefault();
            zone.classList.add("dropzone-active");
        });

        zone.addEventListener("dragleave", () => {
            zone.classList.remove("dropzone-active");
        });

        zone.addEventListener("drop", e => {
            e.preventDefault();
            zone.classList.remove("dropzone-active");
            showToast("File added (demo only)");
        });
    });
}


/* ACTION ROUTING */

function handleAction(el) {

    const action = el.dataset.action;

    switch (action) {
        case "login": login(); break;
        case "logout": logout(); break;
        case "viewCourse": openCourseDetail(el.dataset.courseId); break;
        case "backToCourses": showPage("courses"); break;
        case "viewAssignment": openAssignmentDetail(el.dataset.assignmentId); break;
        case "backToAssignments": showPage("assignments"); break;
        case "submitAssignment": submitAssignment(); break;
        case "saveSettings": saveSettings(); break;
        case "editCourse": editCourse(el.dataset.courseId); break;
        case "openGrading": openGradingDetail(el.dataset.submissionId); break;
        case "backToGrading": showPage("grading"); break;
        case "returnGrade": returnGrade(); break;
        case "bulkReturn": bulkReturn(); break;
        case "sendAnnouncement": sendAnnouncement(); break;
        case "switchTab": switchTab(el); break;
        case "summarizeMaterial": summarizeMaterial(el); break;
        case "toggleSummaryLength": toggleSummaryLength(el); break;
        case "switchToGradingPage": showPage("grading"); break;
        case "searchHostelListings": renderHostelResults(); break;
        case "toggleShortlist": toggleShortlist(el.dataset.listingId); break;
        case "revealContact": revealContact(el.dataset.listingId, el.closest(".hostel-card")); break;
        case "saveHostelProfile": saveHostelProfile(); break;
        case "markNotificationRead": markNotificationRead(el.dataset.notificationId); break;
        case "markAllNotificationsRead": markAllNotificationsRead(); break;
        case "filterUsers": filterUsers(); break;
        case "bulkUserAction": bulkUserAction(el); break;
        case "resetUserMfa": resetUserMfa(el.dataset.userId); break;
        case "newCatalogCourse": newCatalogCourse(); break;
        case "editCatalogCourse": editCatalogCourse(el.dataset.courseId); break;
        case "saveCatalogCourse": saveCatalogCourse(); break;
        case "deleteCatalogCourse": deleteCatalogCourse(el.dataset.courseId); break;
        case "resolveReport": resolveReport(el.dataset.reportId); break;
        case "removeListing": removeListing(el.dataset.reportId); break;
    }
}

document.addEventListener("click", e => {

    const navBtn = e.target.closest(".nav-item[data-page]");

    if (navBtn) {
        showPage(navBtn.dataset.page);
        return;
    }

    const actionEl = e.target.closest("[data-action]");

    if (actionEl) {
        handleAction(actionEl);
    }
});

document.addEventListener("DOMContentLoaded", () => {
    initDropzone();
});
