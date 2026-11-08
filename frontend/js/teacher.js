/* Small coordinator: feature code lives in the teacher-*.js modules. */
registerActions({
    openGrading: element => openGrading(element.dataset.submissionId),
    reloadGrading: loadGradingQueue,
    switchToGradingPage: () => showPage("grading"),
    backToGrading: () => showPage("grading"),
    sendAnnouncement: sendTeacherAnnouncement,
    bulkReturn: () => showToast("Open each submission to review and release its grade.")
});

registerPages({
    dashboard: loadTeacherDashboard,
    grading: loadGradingQueue,
    announcements: loadTeacherAnnouncementForm,
    settings: loadSettingsPage
});

bootPortal("teacher", () => showPage("dashboard"));
