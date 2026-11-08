/* ---------------------------------------------------------------------------
   Notification center (live)
--------------------------------------------------------------------------- */

const NOTIFICATION_GROUPS = [
    { type: "grades", label: "Grades", icon: "progress" },
    { type: "announcements", label: "Announcements", icon: "megaphone" },
    { type: "hostel", label: "Hostel Finder", icon: "roommate" },
    { type: "system", label: "System", icon: "notifications" }
];

let notifications = [];
let notificationsError = null;

async function loadNotifications() {
    const { data, error } = await sb
        .from("notifications")
        .select("id, type, title, body, link, read_at, created_at")
        .eq("user_id", currentAccount.id)
        .order("created_at", { ascending: false })
        .limit(100);
    notificationsError = error ? friendlyError(error) : null;
    notifications = data || [];
    renderNotifications();
}

function renderNotifications() {
    updateNotificationBadge();
    const container = document.querySelector(".notifications-list");
    if (!container) return;

    if (notificationsError) {
        container.innerHTML = errorHtml(notificationsError, "reloadNotifications");
        return;
    }

    const html = NOTIFICATION_GROUPS.map(group => {
        const items = notifications.filter(n => n.type === group.type);
        if (items.length === 0) return "";
        return `
            <div class="notification-group">
                <h4>${escapeHtml(group.label)}</h4>
                ${items.map(n => `
                    <button class="notification-item ${n.read_at ? "" : "unread"}" data-action="openNotification" data-id="${n.id}">
                        ${icon(group.icon)}
                        <div class="notification-item-body">
                            <div class="title">${escapeHtml(n.title)}</div>
                            <div class="meta">${n.body ? escapeHtml(n.body) + " Â· " : ""}${escapeHtml(timeAgo(n.created_at))}</div>
                        </div>
                        ${n.read_at ? "" : '<span class="unread-dot" aria-label="Unread"></span>'}
                    </button>`).join("")}
            </div>`;
    }).join("");

    container.innerHTML = html || emptyStateHtml("You're all caught up", "No notifications right now.", "notifications");
}

function updateNotificationBadge() {
    const unread = notifications.filter(n => !n.read_at).length;
    document.querySelectorAll('.nav-item[data-page="notifications"] .nav-badge').forEach(badge => {
        badge.textContent = unread > 0 ? unread : "";
        badge.classList.toggle("hidden", unread === 0);
    });
    document.querySelectorAll(".bell-count").forEach(el => {
        el.textContent = unread > 99 ? "99+" : unread;
        el.classList.toggle("hidden", unread === 0);
    });
    const bell = document.querySelector(".bell-btn");
    if (bell) bell.setAttribute("aria-label", unread ? `Notifications, ${unread} unread` : "Notifications");
}

function initNotifications() {
    loadNotifications();
    sb.channel("notifications-" + currentAccount.id)
        .on("postgres_changes",
            { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + currentAccount.id },
            (payload) => {
                notifications.unshift(payload.new);
                renderNotifications();
                showToast(payload.new.title);
                if (typeof onNotificationArrived === "function") onNotificationArrived(payload.new);
            })
        .subscribe();
}

registerActions({
    reloadNotifications: () => loadNotifications(),

    openNotification: async (el) => {
        const item = notifications.find(n => n.id === el.dataset.id);
        if (!item) return;
        if (!item.read_at) {
            item.read_at = new Date().toISOString();
            renderNotifications();
            const { error } = await sb.from("notifications").update({ read_at: item.read_at }).eq("id", item.id);
            if (error) showToast(friendlyError(error), "error");
        }
        if (item.link && typeof handleNotificationLink === "function") handleNotificationLink(item.link);
    },

    markAllNotificationsRead: async (el) => {
        await withBusy(el, async () => {
            const { error } = await sb.rpc("mark_all_notifications_read");
            if (error) return showToast(friendlyError(error), "error");
            notifications.forEach(n => { if (!n.read_at) n.read_at = new Date().toISOString(); });
            renderNotifications();
            showToast("All notifications marked as read");
        });
    }
});

registerPages({ notifications: () => loadNotifications() });


