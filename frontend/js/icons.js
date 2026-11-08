/* Shared SVG icon sprite, injected once per page. Use as:
   <svg class="icon" aria-hidden="true"><use href="#icon-name"></use></svg> */
(function () {
    const symbols = {
        logo: '<path d="M12 3L2 8L12 13L22 8L12 3Z"/><path d="M6 10.5V15.5C6 15.5 8 18 12 18C16 18 18 15.5 18 15.5V10.5"/>',
        dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
        courses: '<path d="M4 5.5C4 4.67 4.67 4 5.5 4H11.5V20H5.5C4.67 20 4 19.33 4 18.5V5.5Z"/><path d="M20 5.5C20 4.67 19.33 4 18.5 4H12.5V20H18.5C19.33 20 20 19.33 20 18.5V5.5Z"/>',
        progress: '<polyline points="3 17 9 11 13 15 21 6"/><polyline points="21 12 21 6 15 6"/>',
        materials: '<path d="M6 3H14L19 8V20C19 20.55 18.55 21 18 21H6C5.45 21 5 20.55 5 20V4C5 3.45 5.45 3 6 3Z"/><path d="M14 3V8H19"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
        ai: '<path d="M12 3L13.5 9L19.5 10.5L13.5 12L12 18L10.5 12L4.5 10.5L10.5 9Z"/>',
        roommate: '<path d="M4 11L12 4L20 11"/><path d="M6 10V19C6 19.55 6.45 20 7 20H10V15H14V20H17C17.55 20 18 19.55 18 19V10"/>',
        notifications: '<path d="M6 10C6 6.13 8.69 3 12 3C15.31 3 18 6.13 18 10V15L20 18H4L6 15V10Z"/><path d="M9.5 20C9.5 21.1 10.62 22 12 22C13.38 22 14.5 21.1 14.5 20"/>',
        logout: '<path d="M9 21H5C4.45 21 4 20.55 4 20V4C4 3.45 4.45 3 5 3H9"/><path d="M16 17L21 12L16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
        "chevron-down": '<polyline points="6 9 12 15 18 9"/>',
        download: '<path d="M12 3V15"/><polyline points="7 10 12 15 17 10"/><line x1="5" y1="19" x2="19" y2="19"/>',
        send: '<path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/>',
        check: '<polyline points="5 12 10 17 19 8"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
        megaphone: '<path d="M3 10V14C3 14.55 3.45 15 4 15H6L13 19V5L6 9H4C3.45 9 3 9.45 3 10Z"/><path d="M17 8C18.1 9.2 18.1 12.8 17 14"/>',
        clipboard: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4V3C9 2.45 9.45 2 10 2H14C14.55 2 15 2.45 15 3V4"/><line x1="9" y1="10.5" x2="15" y2="10.5"/><line x1="9" y1="14.5" x2="15" y2="14.5"/>',
        "arrow-right": '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/>',
        pulse: '<polyline points="3 12 8 12 10 6 14 18 16 12 21 12"/>',
        upload: '<path d="M7 18C4.79 18 3 16.21 3 14C3 12.03 4.4 10.39 6.26 10.06C6.62 7.24 9.05 5 12 5C14.95 5 17.38 7.24 17.74 10.06C19.6 10.39 21 12.03 21 14C21 16.21 19.21 18 17 18H7Z"/><path d="M12 12V19"/><polyline points="9 15 12 12 15 15"/>',
        edit: '<path d="M12 20H21"/><path d="M16.5 3.5C17.33 2.67 18.67 2.67 19.5 3.5C20.33 4.33 20.33 5.67 19.5 6.5L7 19L3 20L4 16L16.5 3.5Z"/>',
        users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20C2.5 16.5 5.5 14 9 14C12.5 14 15.5 16.5 15.5 20"/><circle cx="17" cy="9" r="2.8"/><path d="M14.7 20C14.9 17.2 16.7 15.2 19 15.2C21 15.2 21.5 16.8 21.5 18.2"/>',
        settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.9C19.5 13.3 19.5 12.7 19.4 12.1L21 10.8L19.5 8.2L17.6 8.9C17.1 8.5 16.6 8.1 16 7.9L15.7 5.9H12.3L12 7.9C11.4 8.1 10.9 8.5 10.4 8.9L8.5 8.2L7 10.8L8.6 12.1C8.5 12.7 8.5 13.3 8.6 13.9L7 15.2L8.5 17.8L10.4 17.1C10.9 17.5 11.4 17.9 12 18.1L12.3 20.1H15.7L16 18.1C16.6 17.9 17.1 17.5 17.6 17.1L19.5 17.8L21 15.2L19.4 13.9Z"/>',
        shield: '<path d="M12 3L19 6V11C19 15.5 16 19 12 21C8 19 5 15.5 5 11V6L12 3Z"/><polyline points="9 12 11 14 15 9.5"/>',
        flag: '<path d="M5 3V21"/><path d="M5 4H17.5L15 8L17.5 12H5"/>',
        plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
        trash: '<path d="M4 7H20"/><path d="M9 7V4.5C9 3.95 9.45 3.5 10 3.5H14C14.55 3.5 15 3.95 15 4.5V7"/><path d="M6 7L6.8 19.2C6.85 19.9 7.4 20.5 8.1 20.5H15.9C16.6 20.5 17.15 19.9 17.2 19.2L18 7"/>',
        lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5C8 5.3 9.8 3.5 12 3.5C14.2 3.5 16 5.3 16 7.5V11"/>',
        key: '<circle cx="8" cy="15" r="4"/><path d="M11 12L20 3"/><path d="M17 6L19.5 8.5"/><path d="M15 8L17 10"/>',
        message: '<path d="M4 5H20C20.55 5 21 5.45 21 6V16C21 16.55 20.55 17 20 17H9L5 20.5V17H4C3.45 17 3 16.55 3 16V6C3 5.45 3.45 5 4 5Z"/>',
        x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
        refresh: '<path d="M20 11A8 8 0 0 0 5.6 6.4L4 8"/><polyline points="4 3 4 8 9 8"/><path d="M4 13A8 8 0 0 0 18.4 17.6L20 16"/><polyline points="20 21 20 16 15 16"/>',
        eye: '<path d="M2 12C4.5 7 8 5 12 5C16 5 19.5 7 22 12C19.5 17 16 19 12 19C8 19 4.5 17 2 12Z"/><circle cx="12" cy="12" r="3"/>',
        alert: '<path d="M12 3L22 20H2L12 3Z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17.01"/>'
    };

    const svg = Object.entries(symbols)
        .map(([name, body]) => `<symbol id="icon-${name}" viewBox="0 0 24 24">${body}</symbol>`)
        .join("");

    const holder = document.createElement("div");
    holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="visually-hidden" aria-hidden="true"><defs>${svg}</defs></svg>`;
    document.body.prepend(holder.firstChild);
})();

function icon(name, extraClass) {
    return `<svg class="icon${extraClass ? " " + extraClass : ""}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}
