# 📚 AI-Based Academic Management — Full Code Explanation

> **Project:** University Learning Portal (Student · Teacher · Admin)
> **Stack:** Pure HTML + Vanilla CSS + Vanilla JavaScript (no frameworks, no backend)
> **Author's note:** Every section below is explained step-by-step, line by line.

---

## 🗂️ Project Structure

```
frontend/
├── index.html              ← Entry point (redirector)
├── pages/
│   ├── index.html          ← Login page
│   ├── student.html        ← Student portal
│   ├── teacher.html        ← Teacher portal
│   └── admin.html          ← Admin portal
├── js/
│   ├── shared.js           ← Shared utilities used by ALL portals
│   ├── login.js            ← Login logic
│   ├── student.js          ← Student-specific logic
│   ├── teacher.js          ← Teacher-specific logic
│   └── admin.js            ← Admin-specific logic
└── style/
    ├── tokens.css          ← CSS design variables (colors, spacing, etc.)
    ├── base.css            ← Global resets and base element styles
    ├── layout.css          ← App shell: sidebar + content area
    ├── components.css      ← Reusable UI components (buttons, cards, etc.)
    ├── pages.css           ← Page-specific styles (login, materials, etc.)
    ├── dashboard.css       ← Dashboard grid, stat cards, gauges
    ├── portal.css          ← Portal-specific UI (badges, tabs, dropzone, etc.)
    └── admin.css           ← Admin-specific styles (nav badges, hostel, etc.)
```

---

## 1. `frontend/index.html` — Entry Point Redirector

```html
<!DOCTYPE html>
```
> Tells the browser this is an HTML5 document.

```html
<html lang="en">
```
> Opens the root HTML element. `lang="en"` declares English for accessibility and SEO.

```html
<head>
    <meta charset="UTF-8">
```
> `charset="UTF-8"` ensures the browser reads characters correctly (supports emojis, Unicode, Bangla ৳ signs, etc.)

```html
    <meta http-equiv="refresh" content="0; url=pages/index.html">
```
> This is an **HTTP meta-refresh** redirect. `content="0"` means wait 0 seconds, then redirect to `pages/index.html`. This is the server-less way to redirect immediately.

```html
    <title>University Learning Portal</title>
```
> Sets the browser tab title.

```html
<body>
    <p>Redirecting to the <a href="pages/index.html">login page</a>...</p>
```
> Shows a fallback message in case JavaScript or meta-refresh doesn't work. The `<a>` tag lets users click manually.

```html
    <script>location.replace("pages/index.html");</script>
```
> **JavaScript redirect** as a third layer of safety. `location.replace()` replaces the current history entry (so the user can't press Back to return here). This runs instantly, before the page is even fully rendered.

---

## 2. `frontend/pages/index.html` — Login Page

### `<head>` Section

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```
> `viewport` tells mobile browsers not to zoom out. `initial-scale=1.0` sets 1:1 pixel ratio, making the page mobile-friendly.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```
> Loads the **Inter** font from Google Fonts. `preconnect` pre-establishes the TCP connection to Google's servers, so fonts load faster. `crossorigin` is required for the static file server (`gstatic.com`). The `display=swap` means the browser shows a system font first and swaps to Inter when it loads.

```html
<link rel="stylesheet" href="../style/tokens.css">
<link rel="stylesheet" href="../style/base.css">
... (6 more CSS files)
```
> Loads all CSS files in order. The order matters — later files can override earlier ones. `tokens.css` must be first because all other files reference its CSS variables.

### `<body>` — SVG Icon Sprite

```html
<svg xmlns="http://www.w3.org/2000/svg" class="visually-hidden" aria-hidden="true">
    <defs>
        <symbol id="icon-logo" viewBox="0 0 24 24">
            <path d="M12 3L2 8L12 13L22 8L12 3Z"></path>
            <path d="M6 10.5V15.5C6 15.5 8 18 12 18C16 18 18 15.5 18 15.5V10.5"></path>
        </symbol>
    </defs>
</svg>
```
> This is an **SVG sprite** pattern. Instead of including the SVG code every time you need an icon, you define it once inside `<defs>` as a `<symbol>`, then reuse it with `<use href="#icon-logo">`.
> - `class="visually-hidden"` hides the container from visual layout (defined in base.css)
> - `aria-hidden="true"` hides it from screen readers too (pure decorative)
> - The two `<path>` elements draw the graduation cap logo shape

### Login Form

```html
<div id="loginPage" class="login-page">
    <div class="login-box">
```
> `login-page` is the full-screen centered container. `login-box` is the white card in the center.

```html
        <div class="brand-mark">
            <svg class="icon" aria-hidden="true"><use href="#icon-logo"></use></svg>
        </div>
```
> Renders the logo icon by **referencing** the `#icon-logo` symbol defined in the sprite above.

```html
        <h1>University Portal</h1>
        <p class="subtitle">Student • Teacher • Admin</p>
```
> Page heading and subtitle. Only one `<h1>` per page (SEO best practice).

```html
        <div class="field-group">
            <label for="username">Username</label>
            <input class="field" type="text" id="username" placeholder="Enter your username">
        </div>
```
> `<label for="username">` is **linked** to the input via the matching `id="username"`. Clicking the label focuses the input (accessibility). `class="field"` gives it consistent styling.

```html
        <div class="field-group">
            <label for="password">Password</label>
            <input class="field" type="password" id="password" placeholder="Enter your password">
        </div>
```
> `type="password"` makes the browser hide the typed characters with dots/asterisks.

```html
        <div class="field-group">
            <label for="role">Role</label>
            <select class="field" id="role">
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
            </select>
        </div>
```
> A dropdown (`<select>`) that lets users pick their role. The `value` attributes are what JavaScript reads — they are lowercase strings that map to page filenames (`student.html`, etc.).

```html
        <button class="btn btn-primary btn-block" data-action="login">Login</button>
```
> The login button. Notice there is **no `onclick` attribute** — instead it uses `data-action="login"`. The `shared.js` file has a global click listener that reads `data-action` and calls the right function. This is the **action routing pattern**.

```html
        <p id="loginMessage"></p>
```
> An empty paragraph used to display error messages (e.g., "Please enter username and password."). It starts empty and is filled by JavaScript.

```html
<script src="../js/shared.js"></script>
<script src="../js/login.js"></script>
```
> Scripts are loaded at the **bottom of `<body>`** (not in `<head>`). This ensures the HTML is parsed first, so the DOM is ready when the scripts run. `shared.js` must come before `login.js` because `login.js` calls functions defined in `shared.js`.

---

## 3. `frontend/js/login.js` — Login Logic

```js
function login() {
```
> Defines the `login` function. It's called by the action router in `shared.js` when the Login button is clicked.

```js
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;
    const message = document.getElementById("loginMessage");
```
> Reads the current values from all three form fields and gets a reference to the message paragraph. `getElementById` finds an element by its `id` attribute. `.value` gets what the user typed.

```js
    if (!username || !password) {
        message.innerText = "Please enter username and password.";
        return;
    }
```
> **Validation.** `!username` is `true` if the string is empty (`""`). If either field is empty, we set an error message and `return` early — stopping the rest of the function from running.

```js
    message.innerText = "";
```
> Clears any previous error message when inputs are valid.

```js
    saveSession(username, role);
```
> Calls `saveSession()` (defined in `shared.js`) to store the user's identity in `localStorage`. The password is intentionally **not stored** — this is a demo with no real authentication.

```js
    const destinations = {
        student: "student.html",
        teacher: "teacher.html",
        admin: "admin.html"
    };
```
> A lookup table (plain object) mapping role names to page filenames.

```js
    window.location.href = destinations[role] || destinations.student;
```
> Navigates the browser to the correct portal page. `destinations[role]` looks up the role string (e.g., `"teacher"`) in the object. The `|| destinations.student` fallback means if the role is unknown, go to the student portal.

---

## 4. `frontend/js/shared.js` — Shared Utilities

This file is the **backbone** shared by all portal pages. It's loaded on every page.

### Global Variable

```js
let currentUser = "";
```
> A module-level variable that holds the logged-in username. It's set to `""` here and populated later by each portal's init block.

---

### Session Management

```js
const SESSION_KEY = "uniportal_session";
```
> A constant string used as the key for localStorage. Centralizing it prevents typos.

```js
function saveSession(username, role) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ username, role }));
}
```
> Saves a JSON object `{ username, role }` to `localStorage`. `JSON.stringify` converts the object to a string because `localStorage` only stores strings. `{ username, role }` is ES6 shorthand for `{ username: username, role: role }`.

```js
function getSession() {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch (e) {
        return null;
    }
}
```
> Reads the session from localStorage. `JSON.parse` converts the stored string back to an object. The `try/catch` handles the case where the stored value is corrupt/invalid JSON — instead of crashing, it returns `null`.

```js
function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}
```
> Deletes the session from localStorage. Called on logout.

```js
function requireRole(role) {
    const session = getSession();
    if (!session || session.role !== role) {
        window.location.href = "index.html";
        return null;
    }
    return session;
}
```
> **Route guard.** Every portal page calls this at the top of its JS file. If there's no session, or the session's role doesn't match what the page expects (e.g., a student trying to access `admin.html`), the user is forcibly redirected back to the login page. Returns the session object if the check passes.

```js
function logout() {
    clearSession();
    window.location.href = "index.html";
}
```
> Clears the session and redirects to the login page.

---

### Helper Functions

```js
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
```
> **XSS (Cross-Site Scripting) protection.** When you insert user-provided data into the DOM as HTML, a malicious user could inject `<script>` tags. By setting `.textContent` (which treats the string as plain text), the browser automatically escapes special characters like `<` → `&lt;`, `>` → `&gt;`. Then `.innerHTML` reads back the now-safe escaped string. This pattern is a safe alternative to `DOMPurify` for simple cases.

```js
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}
```
> Returns a time-appropriate greeting string. `new Date().getHours()` gets the current hour (0–23). Before 12 → morning, before 18 (6pm) → afternoon, otherwise → evening.

```js
function statusLabel(status) {
    const labels = {
        "not-started": "Not Started",
        submitted: "Submitted",
        graded: "Graded"
    };
    return labels[status] || status;
}
```
> Converts internal status keys (e.g., `"not-started"`) to display-friendly labels (e.g., `"Not Started"`). The `|| status` fallback returns the raw key if not found in the map.

```js
function emptyStateHtml(title, message) {
    return `
        <div class="empty-state">
            <svg class="icon" aria-hidden="true"><use href="#icon-clipboard"></use></svg>
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}
```
> Returns an HTML string for showing an "empty list" placeholder. Uses a template literal (backtick string) to embed the `title` and `message`. Both are passed through `escapeHtml` for safety.

---

### Toast Notifications

```js
function showToast(message) {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);
```
> Creates a new `<div>` with class `toast` and adds the message as text. Appends it to the `#toastContainer` div (defined in each portal's HTML).

```js
    setTimeout(() => toast.classList.add("toast-visible"), 10);
```
> Adds the `toast-visible` class after 10ms. This tiny delay is needed because CSS transitions don't animate if you set a class on the same frame the element is created. The 10ms gives the browser time to paint the element first, then trigger the fade-in animation.

```js
    setTimeout(() => {
        toast.classList.remove("toast-visible");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
```
> After 3 seconds, removes `toast-visible` (triggering a fade-out CSS transition). Then, after another 300ms (the transition duration), completely removes the element from the DOM.

---

### Page Navigation

```js
function showPage(pageName, options) {
    options = options || {};
```
> `options` is an optional second argument. `options || {}` means if it's not passed, default to an empty object (avoids `options.title` throwing an error).

```js
    document.querySelectorAll(".page").forEach(page => {
        page.classList.add("hidden");
    });
```
> Hides ALL sections with class `"page"`. This is the foundation of the single-page navigation pattern — all "pages" exist in the same HTML file, we just hide/show them.

```js
    const target = document.querySelector(`.page[data-page="${pageName}"]`);
    if (target) target.classList.remove("hidden");
```
> Finds the specific `<div class="page" data-page="dashboard">` and removes the `hidden` class, making it visible.

```js
    const navItems = document.querySelectorAll(".nav-item[data-page]");
    const hasNavMatch = Array.from(navItems).some(btn => btn.dataset.page === pageName);
    if (hasNavMatch) {
        navItems.forEach(btn => {
            btn.classList.toggle("active", btn.dataset.page === pageName);
        });
    }
```
> Updates the sidebar nav: adds `"active"` class to the matching nav item, removes it from others. `Array.from()` converts the NodeList to a real array so `.some()` works. `.classList.toggle(className, condition)` adds the class if the condition is `true`, removes it if `false`.

```js
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
```
> Updates the top header. For the dashboard, it shows a personalized greeting with a waving emoji (created as a DOM element for styling). For other pages, it uses the `options.title` (passed when navigating to detail pages) or falls back to the nav item's `data-title` attribute.

---

### Tab Switching

```js
function switchTab(btn) {
    const wrapper = btn.closest(".tabs-wrapper");
    wrapper.querySelectorAll('[data-action="switchTab"]').forEach(b => {
        b.classList.toggle("active", b === btn);
    });
    wrapper.querySelectorAll("[data-tab-content]").forEach(content => {
        content.classList.toggle("hidden", content.dataset.tabContent !== btn.dataset.tab);
    });
}
```
> `.closest(".tabs-wrapper")` walks up the DOM tree to find the nearest ancestor with class `tabs-wrapper`. This scopes the tab system so you can have multiple tab groups on one page. The function marks the clicked tab button as active and shows only the matching content panel.

---

### Notification System

```js
const NOTIFICATION_GROUPS = [
    { type: "grades", label: "Grades", icon: "icon-progress" },
    { type: "announcements", label: "Announcements", icon: "icon-megaphone" },
    { type: "hostel", label: "Hostel Finder", icon: "icon-roommate" },
    { type: "system", label: "System", icon: "icon-notifications" }
];
```
> Defines the notification categories. Each portal's JS file provides its own `getNotificationData()` function that returns the actual notification objects — `shared.js` provides the engine, the portal files provide the data.

```js
function renderNotifications() {
    const container = document.querySelector(".notifications-list");
    if (!container) return;
    const data = getNotificationData();
    const groupsHtml = NOTIFICATION_GROUPS
        .map(group => {
            const items = data.filter(n => n.type === group.type);
            if (items.length === 0) return "";
            return `<div class="notification-group">...</div>`;
        })
        .join("");
    container.innerHTML = groupsHtml || emptyStateHtml(...);
    updateNotificationBadge();
}
```
> Renders all notifications grouped by type. Filters notification data for each group type, builds HTML, and injects it. If no notifications exist, shows the empty state. Finally updates the badge count.

```js
function updateNotificationBadge() {
    const data = getNotificationData();
    const unreadCount = data.filter(n => !n.read).length;
    const badge = document.querySelector('.nav-item[data-page="notifications"] .nav-badge');
    if (!badge) return;
    badge.textContent = unreadCount > 0 ? unreadCount : "";
    badge.classList.toggle("hidden", unreadCount === 0);
}
```
> Counts unread notifications (`!n.read`). Shows the count number in the red badge on the sidebar nav item, or hides it entirely if count is 0.

```js
function markNotificationRead(id) {
    const item = getNotificationData().find(n => n.id === id);
    if (item) item.read = true;
    renderNotifications();
}
```
> Finds the notification by ID and sets `read = true`. Then re-renders the list (which automatically updates the badge too).

```js
function markAllNotificationsRead() {
    getNotificationData().forEach(n => { n.read = true; });
    renderNotifications();
    showToast("All notifications marked as read");
}
```
> Sets every notification's `read` to `true` using `.forEach()`, re-renders, and shows a toast.

---

### File Dropzone

```js
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
```
> Finds all `.dropzone` elements and wires up drag-and-drop events.
> - `dragover`: fires repeatedly while dragging over the zone. `e.preventDefault()` is **required** — without it, the browser won't allow the drop. Adds visual highlight class.
> - `dragleave`: fires when the drag exits the zone. Removes highlight.
> - `drop`: fires when the file is released. `e.preventDefault()` prevents the browser from opening the file. Shows a toast (file handling is demo-only, no real upload).

---

### Action Router

```js
function handleAction(el) {
    const action = el.dataset.action;
    switch (action) {
        case "login": login(); break;
        case "logout": logout(); break;
        case "viewCourse": openCourseDetail(el.dataset.courseId); break;
        // ... many more cases
    }
}
```
> The central dispatcher. Reads the `data-action` attribute of whatever element was clicked and calls the appropriate function. Note how it also reads other `data-*` attributes (like `data-course-id`) and passes them as arguments.

```js
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
```
> **Global click listener using event delegation.** Instead of attaching click handlers to every button, one listener on `document` catches ALL clicks.
> - `e.target.closest(selector)` walks up the DOM from the clicked element to find the nearest ancestor matching the selector. This is how `data-action` on a `<button>` still works even if the user clicks the `<svg>` icon inside the button.
> - First checks for nav items (sidebar navigation), then for action elements.

```js
document.addEventListener("DOMContentLoaded", () => {
    initDropzone();
});
```
> Waits until the full HTML is parsed (`DOMContentLoaded`), then initializes the dropzone. Since the scripts are at the bottom of `<body>`, this is technically redundant, but it's a safe pattern.

---

## 5. `frontend/js/student.js` — Student Portal Logic

```js
const session = requireRole("student");
```
> **First line of every portal file.** Calls the route guard. If the session doesn't exist or isn't for a student, the user is redirected to `index.html` and `session` is `null`.

```js
let openCourseId = null;
let openAssignmentId = null;
let hostelShortlist = [];
```
> Module-level state variables. `openCourseId` tracks which course detail is currently open. `hostelShortlist` is an array of listing IDs the student has shortlisted.

### Mock Data (`COURSES`, `ASSIGNMENTS`, `HOSTEL_LISTINGS`, `NOTIFICATIONS_STUDENT`)

These are **hardcoded JavaScript objects** acting as a fake database since there is no backend. Each object has a shape (schema) that the rendering functions expect.

```js
const COURSES = {
    "web-eng": {
        title: "Web Engineering",
        teacher: "Mr. Rahman",
        term: "Fall 2026",
        syllabus: "...",
        materials: [ { title: "...", text: "..." }, ... ],
        announcements: [ { title: "...", date: "..." }, ... ],
        grades: [ { item: "...", score: "..." }, ... ]
    },
    ...
};
```
> An object (not an array) keyed by course ID strings. This allows O(1) lookup: `COURSES["web-eng"]` is instant, no searching.

```js
function getNotificationData() {
    return NOTIFICATIONS_STUDENT;
}
```
> This **implements the interface** that `shared.js` expects. `shared.js` calls `getNotificationData()` without knowing which portal file defines it — this is a simple form of dependency injection.

---

### Course Detail + AI Summarizer

```js
function openCourseDetail(courseId) {
    const course = COURSES[courseId];
    if (!course) return;
    openCourseId = courseId;
    document.querySelector(".course-detail-title").textContent = course.title;
    ...
    showPage("course-detail", { title: course.title, subtitle: "Syllabus, materials, and grades" });
}
```
> Looks up the course by ID, stores it in `openCourseId`, populates all the detail page elements, then calls `showPage()` to navigate to the detail view.

```js
function summarizeMaterial(btn) {
    const index = btn.dataset.materialIndex;
    const material = COURSES[openCourseId].materials[index];
    const summaryEl = btn.closest(".material-block").querySelector(".material-summary");
    summaryEl.classList.remove("hidden");
    summaryEl.innerHTML = `<p class="summary-loading">Generating summary...</p>`;
    setTimeout(() => renderMaterialSummary(summaryEl, material, "short"), 700);
}
```
> Simulates an AI summarization request. Shows a "Generating summary..." loading message, then after 700ms calls `renderMaterialSummary`. The delay simulates a network/AI API call.

```js
function renderMaterialSummary(summaryEl, material, length) {
    const sentences = material.text.split(".").filter(sentence => sentence.trim().length > 0);
    const count = length === "detailed" ? 5 : 2;
    const summary = sentences.slice(0, count).join(". ") + ".";
    ...
}
```
> The "AI" is actually just string manipulation. It splits the lecture text by periods to get sentences, takes the first `count` sentences (2 for short, 5 for detailed), and joins them back together. This simulates summarization without any real AI API.

---

### Assignments

```js
function renderAssignments() {
    const container = document.querySelector(".assignments-list");
    if (!container) return;
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
```
> Builds an HTML string from the `ASSIGNMENTS` array using `.map()` (creates a new array of HTML strings) and `.join("")` (combines them into one string). Each assignment becomes a clickable `<button>` — using a button (not a div) is important for keyboard accessibility. The badge class (e.g., `badge--graded`) determines the color.

```js
function submitAssignment() {
    const assignment = ASSIGNMENTS.find(a => a.id === openAssignmentId);
    if (!assignment) return;
    assignment.status = "submitted";
    showToast("Assignment submitted");
    renderAssignments();
    openAssignmentDetail(openAssignmentId);
}
```
> **Mutates** the assignment object in the in-memory array by setting `status = "submitted"`. Then re-renders the list and re-opens the detail view, which now shows the "submitted" state. Without a real backend, changes are lost on page refresh.

---

### Hostel Roommate Finder

```js
function compatibilityTag(score) {
    if (score >= 90) return "tag--green";
    if (score >= 75) return "tag--purple";
    return "tag--orange";
}
```
> Maps a compatibility score to a CSS tag class for color-coding.

```js
function renderHostelResults() {
    const budget = document.querySelector("#hostelBudgetFilter").value;
    const block = document.querySelector("#hostelBlockFilter").value;
    const lifestyle = document.querySelector("#hostelLifestyleFilter").value;
    const filtered = HOSTEL_LISTINGS.filter(listing =>
        (!budget || listing.budget === budget) &&
        (!block || listing.block === block) &&
        (!lifestyle || listing.lifestyle === lifestyle)
    );
    ...
}
```
> Reads the current filter dropdown values. The `(!budget || ...)` pattern means: if the filter is empty/all, skip the check; otherwise require a match. All three conditions must be true (`&&`).

```js
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
```
> Toggles the shortlist. If the ID is already in the array, creates a new array excluding it (immutable pattern). Otherwise, pushes the ID in. Re-renders both tabs after.

### Init Block

```js
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
```
> Only runs if `session` is not null (user is authenticated). Sets the global `currentUser`, populates the profile chip in the header (role capitalized, first letter of username as avatar), renders all data, and shows the dashboard.

---

## 6. `frontend/js/teacher.js` — Teacher Portal Logic

```js
const session = requireRole("teacher");
let openSubmissionId = null;
```
> Same pattern as student. `openSubmissionId` tracks the grading detail view.

### Grading Queue

```js
function renderGradingQueue() {
    container.innerHTML = GRADING_QUEUE.map(g => `
        <div class="list-row-wrapper">
            <input type="checkbox" class="grading-checkbox" data-submission-id="${g.id}">
            <button class="list-row-main" data-action="openGrading" data-submission-id="${g.id}">
                ...
            </button>
            <span class="badge badge--${g.status === "returned" ? "graded" : "pending"}">
                ${g.status === "returned" ? "Returned" : "Pending"}
            </span>
        </div>
    `).join("");
}
```
> Each row has a checkbox (for bulk actions) and a clickable button. The badge color is ternary: if returned → green ("graded" style), otherwise blue ("pending" style). The ternary `condition ? valueIfTrue : valueIfFalse` is used inline in the template literal.

```js
function returnGrade() {
    const submission = GRADING_QUEUE.find(g => g.id === openSubmissionId);
    if (!submission) return;
    submission.status = "returned";
    showToast("Grade returned to " + submission.student);
    renderGradingQueue();
    showPage("grading");
}
```
> Marks one submission as returned and navigates back to the grading list.

```js
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
```
> `querySelectorAll(".grading-checkbox:checked")` uses a CSS pseudo-class to find only the checkboxes that are checked. For each checked box, it reads `data-submission-id` and updates the matching submission.

### Announcements

```js
function sendAnnouncement() {
    ...
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
```
> `.unshift()` adds a new item to the **beginning** of the array (so newest announcements appear first). Clears the form fields after sending.

---

## 7. `frontend/js/admin.js` — Admin Portal Logic

```js
const session = requireRole("admin");
let editingCatalogCourseId = null;
```
> `editingCatalogCourseId` is `null` when creating a new course, or holds the course ID when editing an existing one. The save function checks this to decide whether to create or update.

### User Management

```js
function renderAdminUsers() {
    const search = (document.querySelector("#userSearch").value || "").toLowerCase();
    const roleFilter = document.querySelector("#userRoleFilter").value;
    const filtered = ADMIN_USERS.filter(user =>
        user.name.toLowerCase().includes(search) &&
        (!roleFilter || user.role === roleFilter)
    );
    ...
}
```
> `(... || "").toLowerCase()` — the `|| ""` handles null/undefined safely, and `.toLowerCase()` makes the search case-insensitive. `.includes(search)` checks if the user's name contains the search term anywhere.

```js
function bulkUserAction(el) {
    const checked = document.querySelectorAll(".admin-user-checkbox:checked");
    const nextStatus = el.dataset.userAction === "deactivate" ? "inactive" : "active";
    checked.forEach(checkbox => {
        const user = ADMIN_USERS.find(u => u.id === checkbox.dataset.userId);
        if (user) user.status = nextStatus;
    });
    showToast(`${checked.length} user(s) updated`);
    renderAdminUsers();
}
```
> The activate/deactivate button passes `data-user-action="deactivate"` or `"activate"`. The ternary sets `nextStatus` accordingly, then updates all selected users.

### Course Catalog

```js
function saveCatalogCourse() {
    ...
    if (editingCatalogCourseId) {
        // UPDATE existing course
        const course = ADMIN_COURSES.find(c => c.id === editingCatalogCourseId);
        course.title = title;
        course.department = department;
        course.term = term;
        showToast("Course updated");
    } else {
        // CREATE new course
        ADMIN_COURSES.push({ id: "c" + (ADMIN_COURSES.length + 1) + "-" + Date.now(), title, department, term });
        showToast("Course added to catalog");
    }
    document.querySelector(".catalog-form").classList.add("hidden");
    renderCatalog();
}
```
> The `if/else` branch handles both create and update in one function. For new courses, `Date.now()` generates a timestamp-based unique ID suffix to avoid collisions.

```js
function deleteCatalogCourse(id) {
    const index = ADMIN_COURSES.findIndex(c => c.id === id);
    if (index === -1) return;
    ADMIN_COURSES.splice(index, 1);
    showToast("Course removed from catalog");
    renderCatalog();
}
```
> `findIndex` returns the position (index) in the array. `.splice(index, 1)` removes exactly one element at that index. If not found, `index === -1`, so we exit early.

---

## 8. CSS Files — Styling System

### `style/tokens.css` — Design Tokens

```css
:root {
    --color-bg: #fafafa;
    --color-accent: #5b5cf0;
    --space-4: 16px;
    --radius-md: 8px;
    --font-sans: "Inter", -apple-system, ...;
}
```
> **CSS Custom Properties (variables)** on `:root` (the HTML element) make them globally accessible. This is the design token system — change `--color-accent` here and every button, active nav item, and focus ring updates across the whole app. The naming convention:
> - `--color-*` for colors
> - `--space-*` for spacing scale (4px increments)
> - `--radius-*` for border radiuses
> - `--shadow-*` for box shadows

### `style/base.css` — Global Reset

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
```
> The universal selector `*` applies to every element. Removes default browser margins/paddings. `box-sizing: border-box` means padding and border are included in element width (avoids unexpected overflow).

```css
.visually-hidden { position: absolute; width: 1px; height: 1px; ... clip: rect(0,0,0,0); }
```
> Hides content visually but keeps it accessible to screen readers. Used for the SVG sprite container.

```css
.hidden { display: none !important; }
```
> Utility class. `!important` ensures this always wins over other styles — this is the class toggled by `showPage()` and `classList.add("hidden")` throughout the JS.

### `style/layout.css` — App Shell

```css
.app { display: flex; min-height: 100vh; }
.sidebar { width: 250px; flex-shrink: 0; background: var(--sidebar-bg); }
.content { flex: 1; min-width: 0; padding: var(--space-6); }
```
> The app is a flexbox row. Sidebar has a fixed width (`flex-shrink: 0` prevents it from shrinking). Content takes remaining space (`flex: 1`). `min-width: 0` on the content prevents flexbox overflow bugs.

```css
@media (max-width: 600px) {
    .app { flex-direction: column; }
    .sidebar { width: 100%; }
}
```
> Responsive: on small screens, stack sidebar and content vertically.

### `style/components.css` — Reusable Components

```css
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: 10px 18px;
    border-radius: var(--radius-md);
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
```
> Base button: `inline-flex` allows centering the icon and text inside with `gap`. `transition` enables smooth hover animations.

```css
.btn-primary:active { transform: translateY(1px); }
```
> A 1px downward shift on click, simulating a physical press feel.

```css
.field:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-soft);
}
```
> Custom focus ring: removes default outline, adds a colored border and a soft glow ring with `box-shadow`.

```css
.nav-item.active {
    background: rgba(91, 92, 240, 0.16);
    border-left-color: var(--color-accent);
    color: var(--sidebar-text-active);
}
```
> The active sidebar item has a colored left border (accent stripe), a soft tinted background, and bright text.

### `style/dashboard.css` — Dashboard

```css
.cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-4);
}
```
> A 4-column equal-width grid for stat cards.

```css
.gauge {
    background: conic-gradient(
        var(--gauge-color) calc(var(--gauge-percent) * 3.6deg),
        var(--color-border-strong) 0deg
    );
}
```
> A **CSS conic-gradient** creates a circular progress ring without SVG. The `--gauge-percent` CSS variable (set inline on the element via `style` attribute) controls how much of the circle is filled. 3.6 = 360deg / 100.

```css
.toast {
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-visible { opacity: 1; transform: translateY(0); }
```
> The toast starts invisible and slightly below its final position, then slides up and fades in when `.toast-visible` is added by JavaScript.

### `style/portal.css` — Portal UI

```css
.badge--not-started { background: var(--color-border-strong); color: var(--color-text-muted); }
.badge--submitted, .badge--pending { background: var(--color-blue-soft); color: var(--color-blue); }
.badge--graded, .badge--published { background: var(--color-green-soft); color: var(--color-green); }
```
> Status badge colors. CSS allows multiple selectors on one rule with commas.

```css
.toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
.toggle input:checked + .toggle-track { background: var(--color-accent); }
.toggle input:checked + .toggle-track .toggle-thumb { transform: translateX(16px); }
```
> Custom toggle switch built with CSS only. The real `<input type="checkbox">` is hidden (`opacity: 0`). The visible track and thumb are CSS-only siblings. The `+` selector targets the immediate sibling, and `:checked` pseudo-class allows CSS to respond to checkbox state.

### `style/admin.css` — Admin-Specific

```css
.nav-badge {
    margin-left: auto;
    background: var(--color-danger);
    ...
}
```
> Red notification dot on sidebar nav items. `margin-left: auto` pushes it to the right end of the flex container.

```css
.hostel-card { display: flex; flex-wrap: wrap; ... }
```
> `flex-wrap: wrap` allows the card contents to wrap to a new line on small screens.

---

## 🔄 How Everything Fits Together — Data Flow

```
User opens browser
        │
        ▼
frontend/index.html → redirects to → pages/index.html (Login Page)
        │
        ▼
User types username, picks role, clicks Login
        │
        ▼
login.js: login()
  → validates inputs
  → saveSession(username, role)  [stores in localStorage]
  → window.location.href = "student.html" (or teacher/admin)
        │
        ▼
pages/student.html loads
  → loads shared.js → defines utilities + event routing
  → loads student.js
      → requireRole("student") → checks localStorage
      → if invalid → redirect to index.html
      → if valid → renders all data → showPage("dashboard")
        │
        ▼
User clicks sidebar nav item
  → document click listener fires
  → closest(".nav-item[data-page]") found
  → showPage(pageName)
    → hides all .page divs
    → shows the target .page div
    → updates active nav item
    → updates header title
```

---

## ✅ Key Concepts Summary

| Concept | Where Used | Why |
|---|---|---|
| `localStorage` | `shared.js` session functions | Persists login across page loads |
| Event Delegation | `shared.js` document click listener | One listener handles all buttons, even dynamic ones |
| CSS Custom Properties | `tokens.css` → all CSS files | Consistent design system, easy theming |
| Data attributes (`data-*`) | All HTML, all JS | Bridges HTML structure and JS behavior cleanly |
| Template Literals | All JS render functions | Readable HTML string generation |
| Route Guards | Top of every portal JS file | Prevents unauthorized access |
| SVG Sprites | `pages/index.html` etc. | One icon definition, used everywhere |
| XSS Protection | `escapeHtml()` in `shared.js` | Safely renders user/data content as HTML |
| Dependency Injection (informal) | `getNotificationData()` | `shared.js` calls it, each portal provides it |
| CSS-only Toggle | `portal.css` | Native checkbox state drives visual without JS |
