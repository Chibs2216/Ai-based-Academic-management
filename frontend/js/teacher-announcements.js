/* Course selector and announcement composer. */
async function loadTeacherAnnouncementForm() {
    const select = document.getElementById("announcementAudience");
    if (!select) return;
    const { data, error } = await sb.from("courses").select("id,code,title").eq("teacher_id", currentAccount.id).order("code");
    if (error) return showToast(friendlyError(error), "error");
    select.innerHTML = (data || []).map(course => `<option value="${course.id}">${escapeHtml(course.code)} — ${escapeHtml(course.title)}</option>`).join("") || "<option value=\"\">No assigned courses</option>";
}

async function sendTeacherAnnouncement() {
    const title = document.getElementById("announcementTitle").value.trim();
    const body = document.getElementById("announcementBody").value.trim();
    const courseId = document.getElementById("announcementAudience").value;
    if (!title || !body || !courseId) return showToast("Choose a course and enter a title and message.", "error");
    const { error } = await sb.from("announcements").insert({ title, body, course_id: courseId, author_id: currentAccount.id, send_email: document.getElementById("announcementEmail").checked });
    if (error) return showToast(friendlyError(error), "error");
    document.getElementById("announcementTitle").value = "";
    document.getElementById("announcementBody").value = "";
    showToast("Announcement sent");
}
