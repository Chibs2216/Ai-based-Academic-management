/* ---------------------------------------------------------------------------
   MFA enrollment (used by the sign-in page and by Settings)
--------------------------------------------------------------------------- */

/* Renders the authenticator-app setup into `container`.
   onDone(codes) runs after the factor is verified and backup codes are created. */
async function renderMfaEnrollment(container, onDone) {
    container.innerHTML = loadingHtml("Preparing your QR code...");

    // Clear any half-finished enrollment so a fresh one can start.
    const { data: existing } = await sb.auth.mfa.listFactors();
    for (const factor of (existing && existing.all) || []) {
        if (factor.status === "unverified") await sb.auth.mfa.unenroll({ factorId: factor.id });
    }

    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator " + new Date().toISOString().slice(0, 16) });
    if (error) {
        container.innerHTML = errorHtml(friendlyError(error));
        return;
    }

    const factorId = data.id;
    container.innerHTML = `
        <p class="lead">1. Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy).</p>
        <div class="qr-box"><img src="${escapeHtml(data.totp.qr_code)}" alt="QR code for your authenticator app"></div>
        <p class="small muted">Can't scan? Enter this key instead:</p>
        <p class="secret-text">${escapeHtml(data.totp.secret)}</p>
        <form data-submit="noop" class="mfa-verify-form">
            <div class="field-group">
                <label for="enrollCode">2. Enter the 6-digit code from the app</label>
                <input class="field otp-field" id="enrollCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
            </div>
            <button class="btn btn-primary btn-block" type="submit">Verify and turn on</button>
            <p class="auth-message" aria-live="polite"></p>
        </form>`;

    const form = container.querySelector("form");
    const message = form.querySelector(".auth-message");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const code = form.querySelector("#enrollCode").value.trim();
        const button = form.querySelector("button");
        await withBusy(button, async () => {
            message.textContent = "";
            const { error: verifyError } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
            if (verifyError) {
                message.textContent = "That code didn't match. Check the time on your phone and try the newest code.";
                return;
            }
            let codes = [];
            try {
                const result = await callFunction("mfa-recovery", { action: "generate" });
                codes = result.codes || [];
            } catch (err) {
                showToast("Two-step verification is on, but backup codes could not be created: " + err.message, "error");
            }
            onDone(codes);
        });
    }, true);
}

/* Shows backup codes once, with an explicit "I saved them" confirmation. */
function renderBackupCodes(container, codes, onConfirmed) {
    if (!codes.length) {
        onConfirmed();
        return;
    }
    container.innerHTML = `
        <div class="banner banner--warning">${icon("key")}<span>Save these backup codes somewhere safe. Each one works once if you lose your phone. They won't be shown again.</span></div>
        <div class="code-list">${codes.map(c => `<span>${escapeHtml(c)}</span>`).join("")}</div>
        <div class="form-actions">
            <button class="btn btn-ghost" type="button" data-codes="copy">${icon("clipboard", "icon-sm")} Copy</button>
            <button class="btn btn-ghost" type="button" data-codes="download">${icon("download", "icon-sm")} Download</button>
        </div>
        <label class="checkbox-row" style="margin-top: var(--space-4);">
            <input type="checkbox" id="codesSaved"> I have saved my backup codes
        </label>
        <button class="btn btn-primary btn-block" type="button" data-codes="done" disabled>Continue</button>`;

    const text = "UniBook backup codes\n\n" + codes.join("\n") + "\n\nEach code works once.";
    const checkbox = container.querySelector("#codesSaved");
    const done = container.querySelector('[data-codes="done"]');
    checkbox.addEventListener("change", () => { done.disabled = !checkbox.checked; });

    container.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-codes]");
        if (!btn) return;
        e.stopPropagation();
        if (btn.dataset.codes === "copy") {
            try {
                await navigator.clipboard.writeText(text);
                showToast("Backup codes copied");
            } catch (err) {
                showToast("Copy failed. Select the codes and copy them manually.", "error");
            }
        } else if (btn.dataset.codes === "download") {
            const blob = new Blob([text], { type: "text/plain" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "unibook-backup-codes.txt";
            link.click();
            URL.revokeObjectURL(link.href);
        } else if (btn.dataset.codes === "done" && checkbox.checked) {
            onConfirmed();
        }
    });
}


/* ---------------------------------------------------------------------------
   Settings page (same for every role)
--------------------------------------------------------------------------- */

const PREFERENCE_ROWS = [
    { key: "email_grades", title: "Grades", desc: "Email me when a grade is released", roles: ["student", "teacher"] },
    { key: "email_announcements", title: "Announcements", desc: "Email me about class and campus announcements", roles: ["student", "teacher", "admin"] },
    { key: "email_hostel", title: "Hostel Finder", desc: "Email me about roommate requests and messages", roles: ["student", "admin"] },
    { key: "email_system", title: "System", desc: "Email me about account and system updates", roles: ["student", "teacher", "admin"] }
];

async function loadSettingsPage() {
    const root = document.getElementById("settingsRoot");
    if (!root) return;
    root.innerHTML = loadingHtml();

    const [profileRes, prefsRes, factorsRes, aalRes] = await Promise.all([
        sb.from("profiles").select("full_name, email, phone, locale, institution_id").eq("id", currentAccount.id).single(),
        sb.from("notification_preferences").select("*").eq("user_id", currentAccount.id).maybeSingle(),
        sb.auth.mfa.listFactors(),
        sb.auth.mfa.getAuthenticatorAssuranceLevel()
    ]);

    if (profileRes.error) {
        root.innerHTML = errorHtml(friendlyError(profileRes.error), "reloadSettings");
        return;
    }

    const profile = profileRes.data;
    const prefs = prefsRes.data || {};
    const factors = ((factorsRes.data && factorsRes.data.totp) || []).filter(f => f.status === "verified");
    const isAal2 = aalRes.data && aalRes.data.currentLevel === "aal2";

    let remainingCodes = null;
    if (factors.length) {
        try {
            remainingCodes = (await callFunction("mfa-recovery", { action: "status" })).remaining;
        } catch (e) { remainingCodes = null; }
    }

    root.innerHTML = `
        <form class="panel" data-submit="saveProfile">
            <h3>Profile</h3>
            <div class="form-grid">
                <div class="field-group">
                    <label for="settingsName">Full name</label>
                    <input class="field" id="settingsName" required value="${escapeHtml(profile.full_name)}">
                </div>
                <div class="field-group">
                    <label for="settingsEmail">Email</label>
                    <input class="field" id="settingsEmail" type="email" value="${escapeHtml(profile.email)}" disabled>
                    <p class="field-hint">Ask an administrator to change your email.</p>
                </div>
                <div class="field-group">
                    <label for="settingsPhone">Phone</label>
                    <input class="field" id="settingsPhone" type="tel" value="${escapeHtml(profile.phone || "")}" placeholder="+8801...">
                </div>
                <div class="field-group">
                    <label for="settingsLocale">Language</label>
                    <select class="field" id="settingsLocale">
                        <option value="en" ${profile.locale === "en" ? "selected" : ""}>English</option>
                        <option value="bn" ${profile.locale === "bn" ? "selected" : ""}>à¦¬à¦¾à¦‚à¦²à¦¾ (Bangla)</option>
                    </select>
                </div>
            </div>
            ${profile.institution_id ? `<p class="field-hint" style="margin-bottom: var(--space-3);">ID: ${escapeHtml(profile.institution_id)}</p>` : ""}
            <button class="btn btn-primary" type="submit">Save changes</button>
        </form>

        <div class="panel">
            <h3>Email notifications</h3>
            <p class="small muted" style="margin-bottom: var(--space-3);">Everything always appears in the notification center. Choose what also comes by email.</p>
            ${PREFERENCE_ROWS.filter(r => r.roles.includes(currentAccount.role)).map(row => `
                <div class="settings-row">
                    <div>
                        <div class="settings-row-title">${row.title}</div>
                        <div class="settings-row-desc">${row.desc}</div>
                    </div>
                    <label class="toggle">
                        <input type="checkbox" data-pref="${row.key}" ${prefs[row.key] ? "checked" : ""} aria-label="${row.desc}">
                        <span class="toggle-track"><span class="toggle-thumb"></span></span>
                    </label>
                </div>`).join("")}
        </div>

        <div class="panel">
            <h3 class="panel-title">${icon("shield")} Two-step verification</h3>
            ${factors.length ? `
                <p style="margin-bottom: var(--space-3);"><span class="badge badge--graded">On</span> Authenticator app connected${factors[0].created_at ? " since " + escapeHtml(fmtDate(factors[0].created_at)) : ""}.</p>
                ${remainingCodes !== null ? `<p class="small ${remainingCodes <= 2 ? "" : "muted"}" style="margin-bottom: var(--space-3);">${remainingCodes} backup code${remainingCodes === 1 ? "" : "s"} left.${remainingCodes <= 2 ? " Create new ones soon." : ""}</p>` : ""}
                <div class="form-actions">
                    <button class="btn btn-ghost" data-action="regenerateCodes" ${isAal2 ? "" : "disabled"}>${icon("key", "icon-sm")} New backup codes</button>
                    ${currentAccount.mfa.required ? "" : `<button class="btn btn-ghost" data-action="disableMfa" data-factor-id="${factors[0].id}" ${isAal2 ? "" : "disabled"}>Turn off</button>`}
                </div>
                ${isAal2 ? "" : '<p class="field-hint">Sign in again with your authenticator code to change these settings.</p>'}
            ` : `
                <p style="margin-bottom: var(--space-3);"><span class="badge badge--not-started">Off</span> Protect your account with a code from your phone each time you sign in.</p>
                <button class="btn btn-primary" data-action="enableMfa">${icon("lock", "icon-sm")} Set up authenticator app</button>
            `}
        </div>

        <form class="panel" data-submit="changePassword">
            <h3 class="panel-title">${icon("lock")} Password</h3>
            <div class="form-grid">
                <div class="field-group">
                    <label for="newPassword">New password</label>
                    <input class="field" id="newPassword" type="password" minlength="10" autocomplete="new-password" required>
                    <p class="field-hint">At least 10 characters.</p>
                </div>
                <div class="field-group">
                    <label for="confirmPassword">Confirm new password</label>
                    <input class="field" id="confirmPassword" type="password" minlength="10" autocomplete="new-password" required>
                </div>
            </div>
            <button class="btn btn-ghost" type="submit">Change password</button>
        </form>`;
}

registerPages({ settings: () => loadSettingsPage() });

registerActions({
    reloadSettings: () => loadSettingsPage(),

    saveProfile: async (form) => {
        const button = form.querySelector('button[type="submit"]');
        await withBusy(button, async () => {
            const fullName = form.querySelector("#settingsName").value.trim();
            const { error } = await sb.from("profiles").update({
                full_name: fullName,
                phone: form.querySelector("#settingsPhone").value.trim() || null,
                locale: form.querySelector("#settingsLocale").value
            }).eq("id", currentAccount.id);
            if (error) return showToast(friendlyError(error), "error");
            currentAccount.full_name = fullName;
            renderIdentity();
            showToast("Profile saved");
        });
    },

    changePassword: async (form) => {
        const password = form.querySelector("#newPassword").value;
        if (password !== form.querySelector("#confirmPassword").value) {
            return showToast("The two passwords don't match.", "error");
        }
        await withBusy(form.querySelector('button[type="submit"]'), async () => {
            const { error } = await sb.auth.updateUser({ password });
            if (error) return showToast(friendlyError(error), "error");
            form.reset();
            showToast("Password changed");
        });
    },

    enableMfa: () => {
        const modal = openModal({ title: "Set up two-step verification", bodyHtml: '<div class="mfa-enroll-root auth-step"></div>', cancelText: "Close" });
        const root = modal.querySelector(".mfa-enroll-root");
        renderMfaEnrollment(root, (codes) => {
            renderBackupCodes(root, codes, async () => {
                closeModal();
                await sb.auth.refreshSession();
                showToast("Two-step verification is on");
                loadSettingsPage();
            });
        });
    },

    regenerateCodes: async (el) => {
        const ok = await confirmDialog("Create new backup codes?", "<p>Your old backup codes will stop working.</p>", "Create new codes");
        if (!ok) return;
        await withBusy(el, async () => {
            try {
                const { codes } = await callFunction("mfa-recovery", { action: "generate" });
                const modal = openModal({ title: "Your new backup codes", bodyHtml: '<div class="codes-root"></div>', hideCancel: true });
                renderBackupCodes(modal.querySelector(".codes-root"), codes, () => {
                    closeModal();
                    loadSettingsPage();
                });
            } catch (err) {
                showToast(err.message, "error");
            }
        });
    },

    disableMfa: async (el) => {
        const ok = await confirmDialog("Turn off two-step verification?",
            "<p>Your account will be protected by your password only, and your backup codes will stop working.</p>",
            "Turn off", true);
        if (!ok) return;
        const { error } = await sb.auth.mfa.unenroll({ factorId: el.dataset.factorId });
        if (error) return showToast(friendlyError(error), "error");
        await sb.auth.refreshSession();
        showToast("Two-step verification is off");
        loadSettingsPage();
    }
});

document.addEventListener("change", async (e) => {
    const toggle = e.target.closest("[data-pref]");
    if (!toggle) return;
    const { error } = await sb.from("notification_preferences")
        .upsert({ user_id: currentAccount.id, [toggle.dataset.pref]: toggle.checked }, { onConflict: "user_id" });
    if (error) {
        toggle.checked = !toggle.checked;
        showToast(friendlyError(error), "error");
    } else {
        showToast("Email preference saved");
    }
});


