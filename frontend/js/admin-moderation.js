async function loadModerationQueue() {
    const root = document.querySelector(".admin-moderation-queue");
    if (!root) return;
    const { data, error } = await sb.from("hostel_reports").select("id,reported_user_id,reason,created_at,profile:profiles!hostel_reports_reported_user_id_fkey(full_name,email)").eq("status", "pending").order("created_at", { ascending: false });
    if (error) { root.innerHTML = errorHtml(friendlyError(error)); return; }
    root.innerHTML = (data || []).map(report => `<div class="list-row-wrapper"><div class="list-row-main"><div class="title">${escapeHtml(report.profile?.full_name || report.profile?.email || "Listing")}</div><div class="meta">${escapeHtml(report.reason)} · ${escapeHtml(timeAgo(report.created_at))}</div></div><button class="btn btn-ghost btn-sm" data-action="resolveReport" data-report-id="${report.id}">Dismiss</button><button class="btn btn-primary btn-sm" data-action="removeListing" data-report-id="${report.id}" data-user-id="${report.reported_user_id}">Remove listing</button></div>`).join("") || emptyStateHtml("Queue is clear", "No listings need review.", "flag");
}

async function moderateReport(element, removeListing) {
    const { error } = await sb.from("hostel_reports").update({ status: removeListing ? "removed" : "resolved", resolved_by: currentAccount.id, resolved_at: new Date().toISOString() }).eq("id", element.dataset.reportId);
    if (!error && removeListing) await sb.from("hostel_profiles").update({ is_active: false, removed_by_admin: true }).eq("user_id", element.dataset.userId);
    if (error) return showToast(friendlyError(error), "error");
    showToast(removeListing ? "Listing removed" : "Report dismissed"); loadModerationQueue();
}
