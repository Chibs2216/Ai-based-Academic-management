# AI-Based Academic Management

A browser-based academic portal prototype for students, teachers, and administrators. It is built with vanilla HTML, CSS, and JavaScript and currently uses in-memory sample data—there is no backend or persistent storage yet.

## Features

- **Student portal:** browse course materials and grades, view announcements, track and submit assignments, and browse/shortlist roommate listings.
- **Teacher portal:** view courses, review a grading queue, return grades, and post announcements.
- **Admin portal:** manage sample user accounts and course catalog entries, and review hostel listing reports.
- **Material summaries:** generate short or detailed summaries from the sample course material in the browser. This is a front-end demonstration, not a connection to an AI service.
- Role-based demo navigation for student, teacher, and admin views.

> **Prototype note:** The login form accepts any non-empty username and password. User, course, grade, assignment, and listing data are hard-coded in JavaScript and changes are lost when the page is reloaded. Do not use real credentials or sensitive data.

## Run locally

No build step or package installation is required.

1. Clone the repository:

   ```bash
   git clone https://github.com/Chibs2216/Ai-based-Academic-management.git
   cd Ai-based-Academic-management
   ```

2. Open `index.html` in a modern browser. It redirects to the frontend login page. Alternatively, serve the repository with a local static web server and open the root URL.
3. Enter any non-empty username and password, then choose a role to open its demo portal.

## Project structure

```text
.
├── index.html                 # Redirects to the frontend
├── frontend/
│   ├── index.html             # Redirects to the login page
│   ├── pages/
│   │   ├── index.html         # Login
│   │   ├── student.html
│   │   ├── teacher.html
│   │   └── admin.html
│   ├── js/
│   │   ├── shared.js          # Shared UI and session helpers
│   │   ├── login.js
│   │   ├── student.js
│   │   ├── teacher.js
│   │   └── admin.js
│   └── style/                 # Shared and role-specific stylesheets
├── .gitignore
└── README.md
```

## Technology

- HTML5
- CSS3
- Vanilla JavaScript

## Development status

This is a front-end prototype. Authentication is not secure, data is not persisted, and there is no server-side API or real AI integration. A production version would need a backend, secure authentication and authorization, persistent storage, and appropriate privacy and security controls.
