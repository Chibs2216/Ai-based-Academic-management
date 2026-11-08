/* Shared runtime for every portal page: helpers, routing, dialogs, auth guard,
   notification center and the settings screen. Needs config.js and icons.js. */

let currentAccount = null;   // result of rpc('get_my_account')
let loggingOut = false;


/* ---------------------------------------------------------------------------
   Formatting helpers
--------------------------------------------------------------------------- */

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const DATETIME_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function fmtDate(value) {
    return value ? DATE_FMT.format(new Date(value)) : "";
}

function fmtDateTime(value) {
    return value ? DATETIME_FMT.format(new Date(value)) : "";
}

function timeAgo(value) {
    if (!value) return "";
    const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + "m ago";
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours + "h ago";
    const days = Math.round(hours / 24);
    if (days === 1) return "yesterday";
    if (days < 7) return days + " days ago";
    return fmtDate(value);
}

function dueText(value) {
    if (!value) return "No due date";
    const ms = new Date(value).getTime() - Date.now();
    const days = Math.round(ms / 86400000);
    const hours = Math.round(ms / 3600000);
    if (ms < 0) {
        const late = Math.abs(days);
        return late === 0 ? "Overdue today" : `Overdue by ${late} day${late === 1 ? "" : "s"}`;
    }
    if (hours < 24) return hours <= 1 ? "Due within the hour" : `Due in ${hours} hours`;
    if (days === 1) return "Due tomorrow";
    if (days < 14) return `Due in ${days} days`;
    return "Due " + fmtDate(value);
}

function fmtNumber(value, digits) {
    if (value === null || value === undefined || value === "") return "-";
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits === undefined ? 0 : digits).replace(/\.0+$/, "") : "-";
}

function fmtBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return n.toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

function initials(name, fallback) {
    const source = (name || fallback || "?").trim();
    const parts = source.split(/\s+/);
    return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

const KIND_LABELS = { assignment: "Assignment", quiz: "Quiz", lab: "Lab", exam: "Exam", project: "Project" };


/* ---------------------------------------------------------------------------
   State snippets
--------------------------------------------------------------------------- */

function emptyStateHtml(title, message, iconName) {
    return `
        <div class="empty-state">
            ${icon(iconName || "clipboard")}
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(message)}</p>
        </div>`;
}

function loadingHtml(text) {
    return `<div class="loading-state" role="status">${escapeHtml(text || "Loading...")}</div>`;
}

function errorHtml(message, retryAction) {
    return `
        <div class="error-state" role="alert">
            <div>${escapeHtml(message)}</div>
            ${retryAction ? `<button class="btn btn-ghost btn-sm" data-action="${retryAction}">${icon("refresh", "icon-sm")} Try again</button>` : ""}
        </div>`;
}

/* Turn any Supabase / network error into one sentence a user can act on. */
function friendlyError(error) {
    if (!error) return "Something went wrong.";
    const message = error.message || String(error);
    if (/Failed to fetch|NetworkError|network/i.test(message)) {
        return "Can't reach the server. Check your internet connection and try again.";
    }
    if (error.code === "42501" || /row-level security|permission denied/i.test(message)) {
        return "You don't have permission to do that.";
    }
    if (error.code === "23505" || /duplicate key/i.test(message)) {
        return "That already exists.";
    }
    if (/JWT expired|invalid JWT/i.test(message)) {
        return "Your session has expired. Sign in again.";
    }
    return message;
}

function showToast(message, kind) {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast" + (kind === "error" ? " toast--error" : "");
    toast.setAttribute("role", kind === "error" ? "alert" : "status");
    toast.textContent = message;
    if (kind === "error") toast.style.background = "var(--color-danger)";
    container.appendChild(toast);
    setTimeout(() => toast.classList.add("toast-visible"), 10);
    setTimeout(() => {
        toast.classList.remove("toast-visible");
        setTimeout(() => toast.remove(), 300);
    }, kind === "error" ? 6000 : 3500);
}

/* Disable a button while an async action runs. */
async function withBusy(button, task) {
    if (button) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
    }
    try {
        return await task();
    } finally {
        if (button) {
            button.disabled = false;
            button.removeAttribute("aria-busy");
        }
    }
}


/* ---------------------------------------------------------------------------
   Edge functions
--------------------------------------------------------------------------- */

async function callFunction(name, body) {
    const { data, error } = await sb.functions.invoke(name, { body });
    if (!error) return data;

    let message = error.message;
    let code = null;
    try {
        if (error.context && typeof error.context.json === "function") {
            const payload = await error.context.json();
            if (payload && payload.error) {
                message = payload.error.message || message;
                code = payload.error.code || null;
            }
        }
    } catch (e) { /* body was not JSON */ }

    const wrapped = new Error(message);
    wrapped.code = code;
    throw wrapped;
}

