function handleNotificationLink(link) {
    const parts = link.split("/").filter(Boolean);
    if (parts[0] === "assignments" && parts[1]) return openAssignmentDetail(parts[1]);
    if (parts[0] === "courses" && parts[1]) return openCourseDetail(parts[1], parts[2] === "materials" ? "materials" : null, parts[3]);
    if (parts[0] === "roommate") {
        showPage("roommate");
        const tab = document.querySelector('[data-action="switchTab"][data-tab="connections"]');
        if (tab && parts[1] === "connections") switchTab(tab);
    }
}

function onNotificationArrived() {
    assignmentsCache = null;
    if (currentPage === "dashboard") loadDashboard();
}


/* ---------------------------------------------------------------------------
   Wiring
--------------------------------------------------------------------------- */

registerPages({
    dashboard: loadDashboard,
    courses: loadCourses,
    assignments: loadAssignmentsPage,
    grades: loadGrades,
    roommate: loadRoommatePage
});

registerActions({
    reloadDashboard: loadDashboard,
    reloadCourses: loadCourses,
    reloadAssignments: loadAssignmentsPage,
    reloadGrades: loadGrades,
    goPage: (el) => showPage(el.dataset.target),
    viewCourse: (el) => openCourseDetail(el.dataset.courseId, el.dataset.tab),
    backToCourses: () => showPage("courses"),
    viewAssignment: (el) => openAssignmentDetail(el.dataset.assignmentId),
    backToAssignments: () => showPage("assignments"),
    submitAssignment: (form) => submitAssignment(form),
    openMaterial: (el) => openMaterial(el),
    summarizeMaterial: (el) => summarizeMaterial(el, false),
    regenerateSummary: (el) => summarizeMaterial(el, true),
    hideSummary: (el) => el.closest(".material-summary").classList.add("hidden"),

    downloadSubmissionFile: async (el) => {
        const { data, error } = await sb.storage.from("submissions").createSignedUrl(el.dataset.path, 600);
        if (error) return showToast(friendlyError(error), "error");
        window.open(data.signedUrl, "_blank", "noopener");
    },

    searchHostel: () => searchHostel(),
    goListing: () => switchTab(document.querySelector('[data-action="switchTab"][data-tab="listing"]')),
    goConnections: () => switchTab(document.querySelector('[data-action="switchTab"][data-tab="connections"]')),
    "tab:browse": () => searchHostel(),
    "tab:listing": () => renderListingForm(),
    "tab:shortlisted": () => loadShortlist(),
    "tab:connections": () => loadConnections(),
    saveHostelProfile: (form) => saveHostelProfile(form),

    deleteHostelProfile: async () => {
        const ok = await confirmDialog("Delete your listing?", "<p>Your listing, contact details and shortlist entries pointing to you will be removed. Existing chats stay.</p>", "Delete", true);
        if (!ok) return;
        const { error } = await sb.from("hostel_profiles").delete().eq("user_id", currentAccount.id);
        if (error) return showToast(friendlyError(error), "error");
        hostelProfile = null;
        showToast("Listing deleted");
        renderListingForm();
    },

    toggleShortlist: async (el) => {
        const on = el.dataset.on === "1";
        const query = on
            ? sb.from("hostel_shortlists").delete().eq("user_id", currentAccount.id).eq("target_id", el.dataset.userId)
            : sb.from("hostel_shortlists").insert({ user_id: currentAccount.id, target_id: el.dataset.userId });
        const { error } = await query;
        if (error) return showToast(friendlyError(error), "error");
        showToast(on ? "Removed from shortlist" : "Added to shortlist");
        el.dataset.on = on ? "0" : "1";
        el.textContent = on ? "Shortlist" : "Remove";
        if (!document.querySelector('[data-tab-content="shortlisted"]').classList.contains("hidden")) loadShortlist();
    },

    requestConnection: (el) => {
        if (!hostelProfile) {
            showToast("Create your own listing first so the other student can see who you are.", "error");
            return ACTIONS.goListing();
        }
        openModal({
            title: "Connect with " + el.dataset.name,
            bodyHtml: `
                <p>If they accept, you'll both see each other's contact details and can message here.</p>
                <div class="field-group"><label for="connectMessage">Message (optional)</label>
                <textarea class="field short" id="connectMessage" maxlength="500" placeholder="Hi! I'm looking for a roommate in..."></textarea></div>`,
            confirmText: "Send request",
            onConfirm: async (modal) => {
                const { error } = await sb.from("hostel_connections").insert({
                    recipient_id: el.dataset.userId,
                    message: modal.querySelector("#connectMessage").value.trim() || null
                });
                if (error) {
                    showToast(friendlyError(error), "error");
                    return false;
                }
                showToast("Request sent");
                searchHostel();
            }
        });
    },

    respondConnection: async (el) => {
        await withBusy(el, async () => {
            const { error } = await sb.from("hostel_connections").update({ status: el.dataset.status }).eq("id", el.dataset.id);
            if (error) return showToast(friendlyError(error), "error");
            showToast(el.dataset.status === "accepted" ? "Connected. You can now see their contact details." : "Request declined");
            loadConnections();
        });
    },

    withdrawConnection: async (el) => {
        const { error } = await sb.from("hostel_connections").delete().eq("id", el.dataset.id);
        if (error) return showToast(friendlyError(error), "error");
        showToast("Request withdrawn");
        loadConnections();
    },

    openChat: (el) => openChat(el),

    sendMessage: async (form) => {
        const input = form.querySelector("#chatInput");
        const body = input.value.trim();
        if (!body) return;
        await withBusy(form.querySelector('button[type="submit"]'), async () => {
            const { error } = await sb.from("hostel_messages").insert({ connection_id: openConnectionId, sender_id: currentAccount.id, body });
            if (error) return showToast(friendlyError(error), "error");
            input.value = "";
        });
    },

    reportListing: (el) => {
        openModal({
            title: "Report " + el.dataset.name + "'s listing",
            bodyHtml: `
                <p>An administrator will review it. The student won't see who reported them.</p>
                <div class="field-group"><label for="reportReason">Reason</label>
                    <select class="field" id="reportReason">
                        <option>Suspected fake listing</option>
                        <option>Inappropriate content</option>
                        <option>Harassment or unsafe behaviour</option>
                        <option>Spam or advertising</option>
                        <option>Other</option>
                    </select></div>
                <div class="field-group"><label for="reportDetails">Details (optional)</label>
                    <textarea class="field short" id="reportDetails" maxlength="2000"></textarea></div>`,
            confirmText: "Send report",
            danger: true,
            onConfirm: async (modal) => {
                const { error } = await sb.from("hostel_reports").insert({
                    reported_user_id: el.dataset.userId,
                    reporter_id: currentAccount.id,
                    reason: modal.querySelector("#reportReason").value,
                    details: modal.querySelector("#reportDetails").value.trim()
                });
                if (error) {
                    showToast(friendlyError(error), "error");
                    return false;
                }
                showToast("Report sent. Thank you.");
            }
        });
    }
});

bootPortal("student", () => showPage("dashboard"));
