/* ---------------------------------------------------------------------------
   Hostel roommate finder
--------------------------------------------------------------------------- */

function compatibilityTag(score) {
    if (score === null || score === undefined) return "tag--muted";
    if (score >= 80) return "tag--green";
    if (score >= 60) return "tag--purple";
    return "tag--orange";
}

function hostelCardHtml(m) {
    const status = m.connection_status;
    return `
        <div class="hostel-card">
            <div class="hostel-card-main">
                <div class="title">${escapeHtml(m.display_name)}</div>
                <div class="meta">${escapeHtml(m.preferred_block)} Â· à§³${Number(m.budget_min).toLocaleString()}-${Number(m.budget_max).toLocaleString()} Â· ${escapeHtml(LIFESTYLE_LABELS[m.lifestyle])} Â· ${escapeHtml(SLEEP_LABELS[m.sleep_schedule])} Â· Tidiness ${m.cleanliness}/5${m.smoker ? " Â· Smoker" : ""}</div>
                ${m.bio ? `<div class="meta" style="margin-top: 4px;">${escapeHtml(m.bio)}</div>` : ""}
            </div>
            <span class="tag ${compatibilityTag(m.compatibility)}" title="Compatibility with your listing">${m.compatibility === null ? "Create a listing to see match" : m.compatibility + "% match"}</span>
            <div class="hostel-card-actions">
                <button class="btn btn-ghost btn-sm" data-action="toggleShortlist" data-user-id="${m.user_id}" data-on="${m.is_shortlisted ? "1" : "0"}">${m.is_shortlisted ? "Remove" : "Shortlist"}</button>
                ${status === "accepted"
                    ? `<button class="btn btn-primary btn-sm" data-action="goConnections">${icon("message", "icon-sm")} Message</button>`
                    : status === "pending"
                        ? '<span class="badge badge--pending">Request pending</span>'
                        : status === "declined"
                            ? '<span class="badge badge--not-started">Declined</span>'
                            : `<button class="btn btn-primary btn-sm" data-action="requestConnection" data-user-id="${m.user_id}" data-name="${escapeHtml(m.display_name)}">${icon("send", "icon-sm")} Connect</button>`}
                <button class="btn btn-ghost btn-sm btn-sm-icon" data-action="reportListing" data-user-id="${m.user_id}" data-name="${escapeHtml(m.display_name)}" aria-label="Report ${escapeHtml(m.display_name)}'s listing" title="Report listing">${icon("flag", "icon-sm")}</button>
            </div>
        </div>`;
}

async function hostelUnavailable(root) {
    const { data } = await sb.from("app_settings").select("value").eq("key", "hostel_finder_enabled").maybeSingle();
    if (data && data.value === false) {
        root.innerHTML = `<div class="banner banner--warning">${icon("alert")}<span>The roommate finder is turned off by the university right now. Try again later.</span></div>`;
        return true;
    }
    return false;
}

async function loadRoommatePage() {
    const results = document.getElementById("hostelResults");
    if (await hostelUnavailable(results)) return;

    const [profileRes, blocksRes] = await Promise.all([
        sb.from("hostel_profiles").select("*").eq("user_id", currentAccount.id).maybeSingle(),
        sb.from("hostel_profiles").select("preferred_block")
    ]);
    hostelProfile = profileRes.data || null;

    const blocks = [...new Set((blocksRes.data || []).map(r => r.preferred_block))].sort();
    const blockSelect = document.getElementById("hostelBlockFilter");
    const keep = blockSelect.value;
    blockSelect.innerHTML = '<option value="">Any block</option>' + blocks.map(b => `<option>${escapeHtml(b)}</option>`).join("");
    blockSelect.value = blocks.includes(keep) ? keep : "";

    searchHostel();
}

async function searchHostel() {
    const results = document.getElementById("hostelResults");
    results.innerHTML = loadingHtml("Finding matches...");
    const budget = document.getElementById("hostelBudgetFilter").value;
    const [bMin, bMax] = budget ? budget.split("-").map(Number) : [null, null];
    const { data, error } = await sb.rpc("hostel_matches", {
        p_block: document.getElementById("hostelBlockFilter").value || null,
        p_budget_min: bMin,
        p_budget_max: bMax,
        p_lifestyle: document.getElementById("hostelLifestyleFilter").value || null,
        p_gender: document.getElementById("hostelGenderFilter").value || null
    });
    if (error) {
        results.innerHTML = errorHtml("The roommate finder is unavailable right now. " + friendlyError(error), "searchHostel");
        return;
    }
    results.innerHTML = `
        ${hostelProfile ? "" : `<div class="banner">${icon("roommate")}<span>Create your listing in <button class="link-btn" data-action="goListing">My Listing</button> to see how well you match with each student.</span></div>`}
        ${data.length ? data.map(hostelCardHtml).join("") : emptyStateHtml("No matches found", "Try widening your filters.", "roommate")}`;
}

function renderListingForm() {
    const root = document.getElementById("hostelListingRoot");
    const p = hostelProfile || {};
    root.innerHTML = loadingHtml();
    sb.from("hostel_contacts").select("*").eq("user_id", currentAccount.id).maybeSingle().then(({ data: contact }) => {
        contact = contact || {};
        root.innerHTML = `
            ${p.removed_by_admin ? `<div class="banner banner--danger">${icon("alert")}<span>An administrator removed your listing. Contact the hostel office if you think this was a mistake.</span></div>` : ""}
            <form data-submit="saveHostelProfile">
                <div class="form-grid">
                    <div class="field-group"><label for="hpName">Name shown to others</label>
                        <input class="field" id="hpName" required maxlength="60" value="${escapeHtml(p.display_name || (currentAccount.full_name || "").split(" ")[0])}"></div>
                    <div class="field-group"><label for="hpGender">Gender</label>
                        <select class="field" id="hpGender">${Object.entries(GENDER_LABELS).map(([k, v]) => `<option value="${k}" ${p.gender === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
                    <div class="field-group"><label for="hpBlock">Preferred hall / block</label>
                        <input class="field" id="hpBlock" required list="blockList" value="${escapeHtml(p.preferred_block || "")}" placeholder="e.g. West Hall">
                        <datalist id="blockList">${Array.from(document.querySelectorAll("#hostelBlockFilter option")).filter(o => o.value).map(o => `<option value="${escapeHtml(o.value)}">`).join("")}</datalist></div>
                    <div class="field-group"><label for="hpBudgetMin">Budget from (à§³ / month)</label>
                        <input class="field" id="hpBudgetMin" type="number" min="0" step="100" required value="${p.budget_min ?? 3000}"></div>
                    <div class="field-group"><label for="hpBudgetMax">Budget up to (à§³ / month)</label>
                        <input class="field" id="hpBudgetMax" type="number" min="0" step="100" required value="${p.budget_max ?? 4000}"></div>
                    <div class="field-group"><label for="hpLifestyle">Lifestyle</label>
                        <select class="field" id="hpLifestyle">${Object.entries(LIFESTYLE_LABELS).map(([k, v]) => `<option value="${k}" ${(p.lifestyle || "balanced") === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
                    <div class="field-group"><label for="hpSleep">Sleep schedule</label>
                        <select class="field" id="hpSleep">${Object.entries(SLEEP_LABELS).map(([k, v]) => `<option value="${k}" ${(p.sleep_schedule || "flexible") === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
                    <div class="field-group"><label for="hpClean">Tidiness (1 relaxed - 5 very tidy)</label>
                        <input class="field" id="hpClean" type="number" min="1" max="5" required value="${p.cleanliness ?? 3}"></div>
                    <div class="field-group"><label for="hpContactMethod">Contact method</label>
                        <select class="field" id="hpContactMethod">
                            <option value="email" ${contact.contact_method === "email" ? "selected" : ""}>Email</option>
                            <option value="phone" ${contact.contact_method === "phone" ? "selected" : ""}>Phone</option>
                            <option value="in_app" ${contact.contact_method === "in_app" ? "selected" : ""}>In-app messages only</option>
                        </select></div>
                    <div class="field-group"><label for="hpContactValue">Contact details</label>
                        <input class="field" id="hpContactValue" required value="${escapeHtml(contact.contact_value || currentAccount.email)}">
                        <p class="field-hint">Only shown to students after you both accept a connection.</p></div>
                </div>
                <label class="checkbox-row"><input type="checkbox" id="hpSmoker" ${p.smoker ? "checked" : ""}> I smoke</label>
                <div class="field-group"><label for="hpBio">About you</label>
                    <textarea class="field short" id="hpBio" maxlength="500" placeholder="Study habits, hobbies, what you're looking for...">${escapeHtml(p.bio || "")}</textarea></div>
                ${hostelProfile && !p.removed_by_admin ? `<label class="checkbox-row"><input type="checkbox" id="hpActive" ${p.is_active ? "checked" : ""}> Show my listing to other students</label>` : ""}
                <div class="form-actions">
                    <button class="btn btn-primary" type="submit" ${p.removed_by_admin ? "disabled" : ""}>${hostelProfile ? "Save listing" : "Publish listing"}</button>
                    ${hostelProfile ? '<button class="btn btn-ghost" type="button" data-action="deleteHostelProfile">Delete listing</button>' : ""}
                </div>
            </form>`;
    });
}

async function saveHostelProfile(form) {
    const v = id => form.querySelector("#" + id);
    const budgetMin = Number(v("hpBudgetMin").value);
    const budgetMax = Number(v("hpBudgetMax").value);
    if (budgetMax < budgetMin) return showToast("The upper budget must be at least the lower budget.", "error");

    await withBusy(form.querySelector('button[type="submit"]'), async () => {
        const listing = {
            user_id: currentAccount.id,
            display_name: v("hpName").value.trim(),
            gender: v("hpGender").value,
            preferred_block: v("hpBlock").value.trim(),
            budget_min: budgetMin,
            budget_max: budgetMax,
            lifestyle: v("hpLifestyle").value,
            sleep_schedule: v("hpSleep").value,
            cleanliness: Number(v("hpClean").value),
            smoker: v("hpSmoker").checked,
            bio: v("hpBio").value.trim(),
            is_active: v("hpActive") ? v("hpActive").checked : true
        };
        const { data, error } = await sb.from("hostel_profiles").upsert(listing, { onConflict: "user_id" }).select().single();
        if (error) return showToast(friendlyError(error), "error");
        const { error: contactError } = await sb.from("hostel_contacts").upsert({
            user_id: currentAccount.id,
            contact_method: v("hpContactMethod").value,
            contact_value: v("hpContactValue").value.trim()
        }, { onConflict: "user_id" });
        if (contactError) return showToast(friendlyError(contactError), "error");
        hostelProfile = data;
        showToast("Listing saved");
        renderListingForm();
    });
}

async function loadShortlist() {
    const root = document.getElementById("hostelShortlistRoot");
    root.innerHTML = loadingHtml();
    const { data, error } = await sb.rpc("hostel_matches", { p_limit: 200 });
    if (error) {
        root.innerHTML = errorHtml(friendlyError(error));
        return;
    }
    const list = data.filter(m => m.is_shortlisted);
    root.innerHTML = list.length ? list.map(hostelCardHtml).join("")
        : emptyStateHtml("No shortlisted students", "Shortlist people from the Browse tab to compare them here.", "roommate");
}

async function loadConnections() {
    const root = document.getElementById("hostelConnectionsRoot");
    root.innerHTML = loadingHtml();
    const { data, error } = await sb.from("hostel_connections").select("*").order("created_at", { ascending: false });
    if (error) {
        root.innerHTML = errorHtml(friendlyError(error));
        return;
    }
    const others = data.map(c => c.requester_id === currentAccount.id ? c.recipient_id : c.requester_id);
    const { data: names } = others.length
        ? await sb.from("hostel_profiles").select("user_id, display_name, preferred_block").in("user_id", others)
        : { data: [] };
    const nameOf = id => (names || []).find(n => n.user_id === id);

    if (!data.length) {
        root.innerHTML = emptyStateHtml("No connections yet", "Send a request to a student from the Browse tab. Contact details unlock when they accept.", "message");
        return;
    }

    const section = (title, rows) => rows.length ? `<h4 class="muted small" style="text-transform: uppercase; letter-spacing: .04em; margin: var(--space-4) 0 var(--space-2);">${title}</h4>${rows.join("")}` : "";
    const incoming = data.filter(c => c.status === "pending" && c.recipient_id === currentAccount.id);
    const outgoing = data.filter(c => c.status === "pending" && c.requester_id === currentAccount.id);
    const accepted = data.filter(c => c.status === "accepted");

    const row = (c, actions) => {
        const otherId = c.requester_id === currentAccount.id ? c.recipient_id : c.requester_id;
        const other = nameOf(otherId);
        return `
            <div class="list-row-wrapper">
                <div class="list-row-main">
                    <div class="title">${escapeHtml(other ? other.display_name : "Student")}</div>
                    <div class="meta">${other ? escapeHtml(other.preferred_block) + " Â· " : ""}${escapeHtml(timeAgo(c.created_at))}${c.message ? " Â· â€œ" + escapeHtml(c.message) + "â€" : ""}</div>
                </div>
                ${actions}
            </div>`;
    };

    root.innerHTML = `
        ${section("Requests for you", incoming.map(c => row(c, `
            <button class="btn btn-ghost btn-sm" data-action="respondConnection" data-id="${c.id}" data-status="declined">Decline</button>
            <button class="btn btn-primary btn-sm" data-action="respondConnection" data-id="${c.id}" data-status="accepted">Accept</button>`)))}
        ${section("Connected", accepted.map(c => row(c, `
            <button class="btn btn-primary btn-sm" data-action="openChat" data-id="${c.id}" data-other="${c.requester_id === currentAccount.id ? c.recipient_id : c.requester_id}" data-name="${escapeHtml((nameOf(c.requester_id === currentAccount.id ? c.recipient_id : c.requester_id) || {}).display_name || "Student")}">${icon("message", "icon-sm")} Open</button>`)))}
        ${section("Waiting for a reply", outgoing.map(c => row(c, `
            <button class="btn btn-ghost btn-sm" data-action="withdrawConnection" data-id="${c.id}">Withdraw</button>`)))}
        <div id="chatRoot"></div>`;
}

async function openChat(el) {
    openConnectionId = el.dataset.id;
    const otherId = el.dataset.other;
    const root = document.getElementById("chatRoot");
    root.innerHTML = loadingHtml();

    const [contactRes, messagesRes] = await Promise.all([
        sb.from("hostel_contacts").select("contact_method, contact_value").eq("user_id", otherId).maybeSingle(),
        sb.from("hostel_messages").select("*").eq("connection_id", openConnectionId).order("created_at")
    ]);
    const contact = contactRes.data;
    const methodLabel = { email: "Email", phone: "Phone", in_app: "In-app" };

    root.innerHTML = `
        <div class="panel" style="margin-top: var(--space-4);">
            <h3 class="panel-title">${icon("message")} ${escapeHtml(el.dataset.name)}</h3>
            ${contact ? `<p class="small" style="margin-bottom: var(--space-3);">${methodLabel[contact.contact_method]}: <strong>${escapeHtml(contact.contact_value)}</strong></p>` : '<p class="small muted" style="margin-bottom: var(--space-3);">Their listing is no longer active, so contact details are hidden.</p>'}
            <div class="chat" id="chatLog" aria-live="polite"></div>
            <form class="chat-form" data-submit="sendMessage">
                <label class="visually-hidden" for="chatInput">Message</label>
                <input class="field" id="chatInput" maxlength="2000" autocomplete="off" placeholder="Write a message..." required>
                <button class="btn btn-primary" type="submit">${icon("send", "icon-sm")} Send</button>
            </form>
        </div>`;

    const log = document.getElementById("chatLog");
    const render = (m) => {
        log.insertAdjacentHTML("beforeend", `<div class="chat-msg ${m.sender_id === currentAccount.id ? "mine" : ""}">${escapeHtml(m.body)}<div class="meta">${escapeHtml(fmtDateTime(m.created_at))}</div></div>`);
        log.scrollTop = log.scrollHeight;
    };
    (messagesRes.data || []).forEach(render);
    if (!(messagesRes.data || []).length) log.innerHTML = '<p class="muted small" id="chatEmpty">No messages yet. Say hello!</p>';

    if (chatChannel) sb.removeChannel(chatChannel);
    chatChannel = sb.channel("chat-" + openConnectionId)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "hostel_messages", filter: "connection_id=eq." + openConnectionId },
            (payload) => {
                const empty = document.getElementById("chatEmpty");
                if (empty) empty.remove();
                if (!log.querySelector(`[data-id="${payload.new.id}"]`)) render(payload.new);
            })
        .subscribe();
    root.scrollIntoView({ behavior: "smooth", block: "start" });
}


/* ---------------------------------------------------------------------------
   Notification links
--------------------------------------------------------------------------- */

