/* ---------------------------------------------------------------------------
   Auth guard for portal pages
--------------------------------------------------------------------------- */

const PORTAL_PAGES = { student: "student.html", teacher: "teacher.html", admin: "admin.html" };

async function fetchAccount() {
    const { data, error } = await sb.rpc("get_my_account");
    if (error) throw error;
    return data;
}

function goToLogin(reason) {
    window.location.href = "index.html" + (reason ? "?reason=" + encodeURIComponent(reason) : "");
}

/* Every portal calls this first. It sends the user to the sign-in page for
   anything unfinished (MFA, onboarding, locked account) and to their own portal
   if they opened the wrong one. */
async function bootPortal(role, init) {
    const { data } = await sb.auth.getSession();
    if (!data.session) return goToLogin("signed_out");

    let account;
    try {
        account = await fetchAccount();
    } catch (e) {
        return goToLogin("expired");
    }
    if (!account || !account.role) return goToLogin("no_profile");
    if (account.status !== "active" || !account.mfa.satisfied || !account.onboarded) return goToLogin();
    if (account.role !== role) {
        window.location.href = PORTAL_PAGES[account.role];
        return;
    }

    currentAccount = account;
    renderIdentity();
    if (account.maintenance_mode) {
        const content = document.querySelector(".content header");
        if (content) {
            content.insertAdjacentHTML("afterend",
                `<div class="banner banner--warning" role="status">${icon("alert")}<span>UniBook is in maintenance mode. Some features may be unavailable.</span></div>`);
        }
    }

    sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT" && !loggingOut) goToLogin("expired");
    });

    initNotifications();
    await init(account);
}

function renderIdentity() {
    document.querySelectorAll(".user-avatar").forEach(el => {
        el.textContent = initials(currentAccount.full_name, currentAccount.email);
    });
    document.querySelectorAll(".user-name").forEach(el => {
        el.textContent = currentAccount.full_name || currentAccount.email;
    });
    document.querySelectorAll(".user-role").forEach(el => {
        el.textContent = capitalize(currentAccount.role);
    });
}

async function logout() {
    loggingOut = true;
    await sb.auth.signOut();
    window.location.href = "index.html?reason=signed_out_ok";
}

registerActions({
    logout: () => logout(),
    openNotifications: () => showPage("notifications")
});


