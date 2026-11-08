/* Sign-in page: password, MFA challenge/enrollment, backup codes, password
   reset, first-login onboarding and locked accounts. Routes to the right portal. */

const REASON_MESSAGES = {
    expired: "Your session has expired. Sign in again to continue.",
    signed_out: "Sign in to continue.",
    signed_out_ok: "You have been signed out.",
    no_profile: "Your account is not set up yet. Contact an administrator."
};

let challengeFactorId = null;
let countdownTimer = null;
let recoveryMode = false;

function showStep(name) {
    document.querySelectorAll(".auth-step").forEach(step => {
        step.classList.toggle("hidden", step.dataset.step !== name);
    });
    document.querySelectorAll(`.auth-step[data-step="${name}"] .auth-message`).forEach(m => {
        m.textContent = "";
        m.classList.remove("ok");
    });
    const focusTarget = document.querySelector(`.auth-step[data-step="${name}"] input:not([type="checkbox"])`);
    if (focusTarget) focusTarget.focus();
    if (name === "challenge") startTotpCountdown();
    else stopTotpCountdown();
}

function setMessage(step, text, ok) {
    const message = document.querySelector(`.auth-step[data-step="${step}"] .auth-message`);
    if (!message) return;
    message.textContent = text;
    message.classList.toggle("ok", !!ok);
}

function setBanner(text, kind) {
    const banner = document.getElementById("authBanner");
    banner.innerHTML = text
        ? `<div class="banner ${kind === "danger" ? "banner--danger" : ""}" role="status">${icon(kind === "danger" ? "alert" : "check")}<span>${escapeHtml(text)}</span></div>`
        : "";
}

/* TOTP codes change every 30 seconds; show when the next one appears. */
function startTotpCountdown() {
    stopTotpCountdown();
    const el = document.getElementById("totpCountdown");
    const tick = () => { el.textContent = 30 - (Math.floor(Date.now() / 1000) % 30); };
    tick();
    countdownTimer = setInterval(tick, 1000);
}

function stopTotpCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
}


/* Decide where a signed-in user goes next. */
async function routeSignedIn() {
    let account;
    try {
        account = await fetchAccount();
    } catch (e) {
        setBanner(friendlyError(e), "danger");
        return showStep("login");
    }

    if (!account || !account.role) {
        setBanner(REASON_MESSAGES.no_profile, "danger");
        await sb.auth.signOut();
        return showStep("login");
    }

    if (account.status !== "active") {
        document.getElementById("lockedText").textContent = account.status === "locked"
            ? "Your account is locked."
            : "Your account has been deactivated.";
        return showStep("locked");
    }

    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();

    if (account.mfa.enrolled && aal.currentLevel !== "aal2") {
        const { data: factors } = await sb.auth.mfa.listFactors();
        const factor = factors && factors.totp.find(f => f.status === "verified");
        challengeFactorId = factor ? factor.id : null;
        return showStep("challenge");
    }

    if (!account.mfa.enrolled && account.mfa.required) {
        showStep("enroll");
        return renderMfaEnrollment(document.getElementById("enrollRoot"), (codes) => {
            renderBackupCodes(document.getElementById("enrollRoot"), codes, async () => {
                await sb.auth.refreshSession();
                routeSignedIn();
            });
        });
    }

    if (!account.onboarded) {
        document.getElementById("onboardName").value = account.full_name || "";
        document.getElementById("onboardLocale").value = account.locale || "en";
        document.getElementById("onboardMfaRow").classList.toggle("hidden", account.mfa.enrolled);
        return showStep("onboarding");
    }

    window.location.href = PORTAL_PAGES[account.role];
}


registerActions({
    goStep: (el) => {
        setBanner("");
        showStep(el.dataset.stepTarget);
    },

    signOutHere: async () => {
        await sb.auth.signOut();
        setBanner("");
        showStep("login");
    },

    signIn: async (form) => {
        const email = form.querySelector("#email").value.trim();
        const password = form.querySelector("#password").value;
        if (!email || !password) return setMessage("login", "Enter your email and password.");

        // Apply the "remember this device" choice before the session is stored.
        const remember = form.querySelector("#rememberDevice").checked;
        if (remember !== rememberDevice()) {
            setRememberDevice(remember);
            sb = makeSupabaseClient();
        }

        await withBusy(form.querySelector('button[type="submit"]'), async () => {
            setMessage("login", "");
            setBanner("");
            const { error } = await sb.auth.signInWithPassword({ email, password });
            if (error) {
                if (/banned/i.test(error.message)) {
                    document.getElementById("lockedText").textContent = "Your account is locked or deactivated.";
                    return showStep("locked");
                }
                if (/Invalid login credentials/i.test(error.message)) {
                    return setMessage("login", "That email and password don't match. Check them and try again.");
                }
                if (/rate limit|too many/i.test(error.message)) {
                    return setMessage("login", "Too many attempts. Wait a few minutes before trying again.");
                }
                return setMessage("login", friendlyError(error));
            }
            form.querySelector("#password").value = "";
            await routeSignedIn();
        });
    },

    /* Student self-registration. The role is never sent: the database trigger
       makes every self-registered account a student. */
    signUp: async (form) => {
        const fullName = form.querySelector("#signupName").value.trim();
        const email = form.querySelector("#signupEmail").value.trim();
        const password = form.querySelector("#signupPassword").value;
        if (!fullName || !email || !password) return setMessage("signup", "Fill in every field.");
        if (password.length < 10) return setMessage("signup", "Use at least 10 characters for your password.");
        if (password !== form.querySelector("#signupPassword2").value) return setMessage("signup", "The two passwords don't match.");

        await withBusy(form.querySelector('button[type="submit"]'), async () => {
            setMessage("signup", "");
            const emailRedirectTo = window.location.href.split("?")[0].split("#")[0];
            const { data, error } = await sb.auth.signUp({
                email, password,
                options: { data: { full_name: fullName }, emailRedirectTo }
            });
            if (error) {
                if (/signups? not allowed|disabled/i.test(error.message)) {
                    return setMessage("signup", "Sign-up is currently closed. Contact the university office.");
                }
                if (/already registered|already exists/i.test(error.message)) {
                    return setMessage("signup", "An account with that email already exists. Sign in instead.");
                }
                return setMessage("signup", friendlyError(error));
            }
            form.reset();
            if (data.session) return routeSignedIn();
            // Email confirmation is on: the user must click the link first.
            setMessage("signup", "Almost done! Check your email and click the confirmation link, then sign in.", true);
        });
    },

    verifyChallenge: async (form) => {
        const code = form.querySelector("#challengeCode").value.replace(/\s/g, "");
        if (!/^\d{6}$/.test(code)) return setMessage("challenge", "Enter the 6-digit code.");
        if (!challengeFactorId) return setMessage("challenge", "No authenticator is set up. Use a backup code instead.");

        await withBusy(form.querySelector('button[type="submit"]'), async () => {
            const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: challengeFactorId, code });
            if (error) {
                form.querySelector("#challengeCode").select();
                return setMessage("challenge", "That code didn't work. Wait for a new code and try again.");
            }
            form.reset();
            await routeSignedIn();
        });
    },

    redeemCode: async (form) => {
        const code = form.querySelector("#backupCode").value.trim();
        if (!code) return setMessage("recovery", "Enter a backup code.");
        await withBusy(form.querySelector('button[type="submit"]'), async () => {
            try {
                const result = await callFunction("mfa-recovery", { action: "redeem", code });
                await sb.auth.signOut();
                form.reset();
                setBanner(result.message);
                showStep("login");
            } catch (err) {
                setMessage("recovery", err.message);
            }
        });
    },

    sendReset: async (form) => {
        const email = form.querySelector("#forgotEmail").value.trim();
        if (!email) return setMessage("forgot", "Enter your email.");
        await withBusy(form.querySelector('button[type="submit"]'), async () => {
            const redirectTo = window.location.href.split("?")[0].split("#")[0];
            const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
            if (error) return setMessage("forgot", friendlyError(error));
            // Same message whether or not the account exists.
            setMessage("forgot", "If that email has an account, a reset link is on its way. Check your inbox.", true);
        });
    },

    saveNewPassword: async (form) => {
        const password = form.querySelector("#resetPassword").value;
        if (password.length < 10) return setMessage("reset", "Use at least 10 characters.");
        if (password !== form.querySelector("#resetPassword2").value) return setMessage("reset", "The two passwords don't match.");
        await withBusy(form.querySelector('button[type="submit"]'), async () => {
            const { error } = await sb.auth.updateUser({ password });
            if (error) return setMessage("reset", friendlyError(error));
            recoveryMode = false;
            form.reset();
            setBanner("Password changed.");
            await routeSignedIn();
        });
    },

    finishOnboarding: async (form) => {
        const fullName = form.querySelector("#onboardName").value.trim();
        if (!fullName) return setMessage("onboarding", "Enter your full name.");
        const wantsMfa = !form.querySelector("#onboardMfaRow").classList.contains("hidden")
            && form.querySelector("#onboardMfa").checked;

        await withBusy(form.querySelector('button[type="submit"]'), async () => {
            const { error } = await sb.rpc("complete_onboarding", {
                p_full_name: fullName,
                p_phone: form.querySelector("#onboardPhone").value.trim() || null,
                p_locale: form.querySelector("#onboardLocale").value
            });
            if (error) return setMessage("onboarding", friendlyError(error));

            if (wantsMfa) {
                showStep("enroll");
                document.querySelector('.auth-step[data-step="enroll"] .lead').textContent =
                    "Add a code from your phone to every sign-in. This takes about a minute.";
                return renderMfaEnrollment(document.getElementById("enrollRoot"), (codes) => {
                    renderBackupCodes(document.getElementById("enrollRoot"), codes, async () => {
                        await sb.auth.refreshSession();
                        routeSignedIn();
                    });
                });
            }
            await routeSignedIn();
        });
    }
});


/* Start */
(async function init() {
    document.getElementById("rememberDevice").checked = rememberDevice();

    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    if (reason && REASON_MESSAGES[reason]) {
        setBanner(REASON_MESSAGES[reason], reason === "expired" ? "danger" : "");
    }

    // Arriving from a password-reset email.
    sb.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
            recoveryMode = true;
            setBanner("");
            showStep("reset");
        }
    });
    if (window.location.hash.includes("type=recovery")) {
        recoveryMode = true;
    }

    const { data } = await sb.auth.getSession();
    if (recoveryMode) return showStep("reset");
    if (data.session) return routeSignedIn();
    showStep("login");
})();
