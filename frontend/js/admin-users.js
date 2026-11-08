let managedUsers = [];

async function loadManagedUsers() {
    const root = document.querySelector(".admin-users-table");
    if (!root) return;
    root.innerHTML = loadingHtml("Loading users...");
    const { data, error } = await sb.from("profiles").select("id,full_name,email,role,status,department:departments(code)").order("created_at", { ascending: false }).limit(500);
    if (error) { root.innerHTML = errorHtml(friendlyError(error), "loadManagedUsers"); return; }
    managedUsers = data || []; renderManagedUsers();
}

function renderManagedUsers() {
    const root = document.querySelector(".admin-users-table");
    const search = document.getElementById("userSearch").value.trim().toLowerCase();
    const role = document.getElementById("userRoleFilter").value.toLowerCase();
    const rows = managedUsers.filter(user => (!search || `${user.full_name} ${user.email}`.toLowerCase().includes(search)) && (!role || user.role === role));
    root.innerHTML = `<table><thead><tr><th></th><th>Name</th><th>Role</th><th>Department</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(user => `<tr><td><input class="grading-checkbox admin-user-checkbox" type="checkbox" data-user-id="${user.id}"></td><td>${escapeHtml(user.full_name || user.email)}<div class="small muted">${escapeHtml(user.email)}</div></td><td>${escapeHtml(capitalize(user.role))}</td><td>${escapeHtml(user.department?.code || "—")}</td><td>${escapeHtml(capitalize(user.status))}</td><td><button class="btn btn-ghost btn-sm" data-action="resetUserMfa" data-user-id="${user.id}">Reset MFA</button></td></tr>`).join("")}</tbody></table>` || emptyStateHtml("No users found", "Try a different search.", "users");
}

async function changeSelectedUserStatus() {
    const ids = [...document.querySelectorAll(".admin-user-checkbox:checked")].map(box => box.dataset.userId);
    if (!ids.length) return showToast("Select at least one user.", "error");
    if (!await confirmDialog("Deactivate accounts", `Deactivate ${ids.length} selected account(s)?`, "Deactivate", true)) return;
    try { await callFunction("admin-users", { action: "set_status", user_ids: ids, status: "inactive" }); showToast("Accounts deactivated"); loadManagedUsers(); } catch (error) { showToast(friendlyError(error), "error"); }
}

async function resetManagedUserMfa(element) {
    if (!await confirmDialog("Reset MFA", "This removes the user's authenticator and recovery codes.", "Reset MFA", true)) return;
    try { await callFunction("admin-users", { action: "reset_mfa", user_ids: [element.dataset.userId] }); showToast("MFA reset"); } catch (error) { showToast(friendlyError(error), "error"); }
}
