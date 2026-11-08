
/* ---------------------------------------------------------------------------
   Modal dialogs
--------------------------------------------------------------------------- */

function openModal(options) {
    closeModal();
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.id = "modalBackdrop";
    backdrop.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <h3 id="modalTitle">${escapeHtml(options.title)}</h3>
            <div class="modal-body">${options.bodyHtml || ""}</div>
            <div class="form-actions">
                ${options.hideCancel ? "" : `<button class="btn btn-ghost" data-modal="cancel">${escapeHtml(options.cancelText || "Cancel")}</button>`}
                ${options.confirmText ? `<button class="btn ${options.danger ? "btn-danger" : "btn-primary"}" data-modal="confirm">${escapeHtml(options.confirmText)}</button>` : ""}
            </div>
        </div>`;
    document.body.appendChild(backdrop);

    const previousFocus = document.activeElement;
    const modal = backdrop.querySelector(".modal");
    const first = modal.querySelector("input, select, textarea, button");
    if (first) first.focus();

    function finish(result) {
        closeModal();
        if (previousFocus && previousFocus.focus) previousFocus.focus();
        if (options.onClose) options.onClose(result);
    }

    backdrop.addEventListener("click", async (e) => {
        if (e.target === backdrop) return finish(false);
        const role = e.target.closest("[data-modal]");
        if (!role) return;
        if (role.dataset.modal === "cancel") return finish(false);
        if (role.dataset.modal === "confirm") {
            if (options.onConfirm) {
                const keepOpen = await withBusy(role, () => options.onConfirm(modal));
                if (keepOpen === false) return;
            }
            finish(true);
        }
    });

    backdrop.addEventListener("keydown", (e) => {
        if (e.key === "Escape") finish(false);
    });

    return modal;
}

function closeModal() {
    const existing = document.getElementById("modalBackdrop");
    if (existing) existing.remove();
}

function confirmDialog(title, bodyHtml, confirmText, danger) {
    return new Promise((resolve) => {
        openModal({ title, bodyHtml, confirmText: confirmText || "Confirm", danger, onClose: resolve });
    });
}


/* ---------------------------------------------------------------------------
   Page routing inside a portal
--------------------------------------------------------------------------- */

const PAGE_LOADERS = {};   // pageName -> function called every time the page opens
const ACTIONS = {};        // data-action name -> handler(element, event)
let currentPage = null;

function registerActions(map) {
    Object.assign(ACTIONS, map);
}

function registerPages(map) {
    Object.assign(PAGE_LOADERS, map);
}

function setHeader(title, subtitle) {
    const titleEl = document.querySelector(".page-title");
    const subtitleEl = document.querySelector(".welcome-text");
    if (titleEl) titleEl.textContent = title || "";
    if (subtitleEl) subtitleEl.textContent = subtitle || "";
}

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}

function showPage(pageName, options) {
    options = options || {};
    currentPage = pageName;

    document.querySelectorAll(".page").forEach(page => page.classList.add("hidden"));
    const target = document.querySelector(`.page[data-page="${pageName}"]`);
    if (target) target.classList.remove("hidden");

    const navItems = document.querySelectorAll(".nav-item[data-page]");
    const navTarget = options.nav || pageName;
    if (Array.from(navItems).some(btn => btn.dataset.page === navTarget)) {
        navItems.forEach(btn => {
            const active = btn.dataset.page === navTarget;
            btn.classList.toggle("active", active);
            if (active) btn.setAttribute("aria-current", "page");
            else btn.removeAttribute("aria-current");
        });
    }

    if (pageName === "dashboard" && !options.title) {
        const firstName = (currentAccount && currentAccount.full_name || "").split(" ")[0];
        setHeader(`${getGreeting()}${firstName ? ", " + firstName : ""}`, "Here's what's happening today.");
    } else {
        const navItem = document.querySelector(`.nav-item[data-page="${pageName}"]`);
        setHeader(options.title || (navItem ? navItem.dataset.title : ""), options.subtitle || "");
    }

    if (!options.skipLoad && PAGE_LOADERS[pageName]) PAGE_LOADERS[pageName](options);
    window.scrollTo(0, 0);
}

function switchTab(btn) {
    const wrapper = btn.closest(".tabs-wrapper");
    wrapper.querySelectorAll('[data-action="switchTab"]').forEach(b => {
        const active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
    });
    wrapper.querySelectorAll("[data-tab-content]").forEach(content => {
        content.classList.toggle("hidden", content.dataset.tabContent !== btn.dataset.tab);
    });
    if (ACTIONS["tab:" + btn.dataset.tab]) ACTIONS["tab:" + btn.dataset.tab](btn);
}

document.addEventListener("click", (e) => {
    const navBtn = e.target.closest(".nav-item[data-page]");
    if (navBtn) {
        showPage(navBtn.dataset.page);
        return;
    }
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    const name = actionEl.dataset.action;
    if (name === "switchTab") return switchTab(actionEl);
    if (ACTIONS[name]) {
        e.preventDefault();
        ACTIONS[name](actionEl, e);
    }
});

document.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-submit]");
    if (!form) return;
    e.preventDefault();
    const handler = ACTIONS[form.dataset.submit];
    if (handler) handler(form, e);
});


