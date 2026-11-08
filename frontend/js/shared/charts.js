/* ---------------------------------------------------------------------------
   Small charts (inline SVG, single series)
--------------------------------------------------------------------------- */

/* points: [{ label, value }]; options: { max, min, format, height } */
function renderLineChart(container, points, options) {
    options = options || {};
    const width = 520;
    const height = options.height || 200;
    const pad = { top: 16, right: 16, bottom: 28, left: 34 };
    const min = options.min !== undefined ? options.min : 0;
    const max = options.max !== undefined ? options.max : Math.max(...points.map(p => p.value), 1);
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const x = i => pad.left + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1));
    const y = v => pad.top + plotH - ((v - min) / (max - min)) * plotH;
    const fmt = options.format || (v => v);
    const ticks = options.ticks || [min, (min + max) / 2, max];

    const grid = ticks.map(t => `
        <line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${y(t)}" y2="${y(t)}"></line>
        <text class="axis-label" x="${pad.left - 6}" y="${y(t) + 4}" text-anchor="end">${escapeHtml(fmt(t))}</text>`).join("");

    const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
    const last = points[points.length - 1];

    container.innerHTML = `
        <div class="chart">
            <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.ariaLabel || "")}">
                ${grid}
                ${points.length > 1 ? `<path class="series-line" d="${path}"></path>` : ""}
                ${points.map((p, i) => `<circle class="series-dot" cx="${x(i)}" cy="${y(p.value)}" r="5"></circle>`).join("")}
                ${points.map((p, i) => `<text class="axis-label" x="${x(i)}" y="${height - 8}" text-anchor="middle">${escapeHtml(p.label)}</text>`).join("")}
                <text class="value-label" x="${x(points.length - 1)}" y="${y(last.value) - 10}" text-anchor="middle">${escapeHtml(fmt(last.value))}</text>
                ${points.map((p, i) => `<rect class="hit" data-tip="${escapeHtml(p.label + ": " + fmt(p.value))}" x="${x(i) - 22}" y="${pad.top}" width="44" height="${plotH}"></rect>`).join("")}
            </svg>
        </div>`;
    attachChartTooltips(container);
}

/* bars: [{ label, value }] */
function renderBarChart(container, bars, options) {
    options = options || {};
    const width = 520;
    const height = options.height || 200;
    const pad = { top: 22, right: 8, bottom: 28, left: 8 };
    const max = Math.max(...bars.map(b => b.value), 1);
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const slot = plotW / bars.length;
    const barW = Math.min(36, slot - 6);
    const baseline = pad.top + plotH;

    const marks = bars.map((b, i) => {
        const h = b.value ? Math.max(4, (b.value / max) * plotH) : 0;
        const cx = pad.left + slot * i + slot / 2;
        const xLeft = cx - barW / 2;
        const top = baseline - h;
        const r = Math.min(4, h);
        // Rounded top corners, square at the baseline.
        const d = h ? `M${xLeft},${baseline} V${top + r} Q${xLeft},${top} ${xLeft + r},${top} H${xLeft + barW - r} Q${xLeft + barW},${top} ${xLeft + barW},${top + r} V${baseline} Z` : "";
        return `
            ${d ? `<path class="series-bar" d="${d}"></path>` : ""}
            ${b.value ? `<text class="value-label" x="${cx}" y="${top - 6}" text-anchor="middle">${b.value}</text>` : ""}
            <text class="axis-label" x="${cx}" y="${height - 8}" text-anchor="middle">${escapeHtml(b.label)}</text>
            <rect class="hit" data-tip="${escapeHtml(b.label + ": " + b.value + (options.unit ? " " + options.unit : ""))}" x="${cx - slot / 2}" y="${pad.top}" width="${slot}" height="${plotH}"></rect>`;
    }).join("");

    container.innerHTML = `
        <div class="chart">
            <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.ariaLabel || "")}">
                <line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${baseline}" y2="${baseline}"></line>
                ${marks}
            </svg>
        </div>`;
    attachChartTooltips(container);
}

function attachChartTooltips(container) {
    const chart = container.querySelector(".chart");
    const tip = document.createElement("div");
    tip.className = "chart-tooltip hidden";
    chart.appendChild(tip);
    chart.addEventListener("mousemove", (e) => {
        const hit = e.target.closest("[data-tip]");
        if (!hit) { tip.classList.add("hidden"); return; }
        const box = chart.getBoundingClientRect();
        tip.textContent = hit.dataset.tip;
        tip.style.left = (e.clientX - box.left) + "px";
        tip.style.top = (e.clientY - box.top) + "px";
        tip.classList.remove("hidden");
    });
    chart.addEventListener("mouseleave", () => tip.classList.add("hidden"));
}
