function login() {

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;
    const message = document.getElementById("loginMessage");

    if (!username || !password) {
        message.innerText = "Please enter username and password.";
        return;
    }

    message.innerText = "";
    saveSession(username, role);

    const destinations = {
        student: "student.html",
        teacher: "teacher.html",
        admin: "admin.html"
    };

    window.location.href = destinations[role] || destinations.student;
}
