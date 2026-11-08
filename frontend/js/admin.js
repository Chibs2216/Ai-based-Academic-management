/* Small coordinator for independently testable admin feature modules. */
async function loadAdminDashboard() {
    const { count, error } = await sb.from("profiles").select("id", { count: "exact", head: true });
    if (error) return;
    const card = [...document.querySelectorAll(".card")].find(item => item.querySelector("h3")?.textContent === "Total Users");
    if (card) card.querySelector("strong").textContent = fmtNumber(count);
}
registerActions({ filterUsers: renderManagedUsers, bulkUserAction: changeSelectedUserStatus, resetUserMfa: resetManagedUserMfa, resolveReport: item => moderateReport(item, false), removeListing: item => moderateReport(item, true) });
registerPages({ dashboard: loadAdminDashboard, users: loadManagedUsers, moderation: loadModerationQueue, settings: loadSettingsPage });
bootPortal("admin", () => showPage("dashboard"));
