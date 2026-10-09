/* ===== Column definitions — add a column here and everything else follows ===== */
const COLUMNS = [
  { key: "ref",         label: "Ref",         type: "text"   },
  { key: "description", label: "Description", type: "text"   },
  { key: "date",        label: "Date",        type: "date"   },
  { key: "moneyIn",     label: "Money In",    type: "number" },
  { key: "moneyOut",    label: "Money Out",   type: "number" },
];

/* Relationships offered per column type */
const RELATIONS = {
  text:   [["contains","contains"],["startsWith","starts with"],["endsWith","ends with"],["equals","equals"],["notContains","does not contain"]],
  number: [["eq","equal to"],["gt","more than"],["lt","less than"],["gte","at least"],["lte","at most"]],
  date:   [["on","on"],["before","before"],["after","after"]],
};

const TESTS = {
  contains:    (v, q) => v.toLowerCase().includes(q.toLowerCase()),
  notContains: (v, q) => !v.toLowerCase().includes(q.toLowerCase()),
  startsWith:  (v, q) => v.toLowerCase().startsWith(q.toLowerCase()),
  endsWith:    (v, q) => v.toLowerCase().endsWith(q.toLowerCase()),
  equals:      (v, q) => v.toLowerCase() === q.toLowerCase(),
  eq: (v, q) => v === q, gt: (v, q) => v > q, lt: (v, q) => v < q,
  gte: (v, q) => v >= q, lte: (v, q) => v <= q,
  on: (v, q) => v === q, before: (v, q) => v < q, after: (v, q) => v > q,
};

/* ===== Sample data (5 rows). Money fields use 0 when empty. ===== */
const DATA = [
  { ref: "TXN-240901", description: "Salary deposit – Sky World Ltd",  date: "2026-09-01", moneyIn: 85000, moneyOut: 0 },
  { ref: "TXN-240905", description: "Loan repayment – Development loan", date: "2026-09-05", moneyIn: 0,     moneyOut: 12500 },
  { ref: "TXN-240912", description: "Share capital contribution",       date: "2026-09-12", moneyIn: 0,     moneyOut: 5000 },
  { ref: "TXN-240918", description: "Dividend payout 2025",             date: "2026-09-18", moneyIn: 7320,  moneyOut: 0 },
  { ref: "TXN-240925", description: "Agent withdrawal – Kasarani",      date: "2026-09-25", moneyIn: 0,     moneyOut: 3000 },
];

/* ===== State ===== */
const state = {
  filters: [],           // active conditions: [{ id, col, rel, value, source: "search" | "filter" }]
  filterRows: [],        // filter builder rows: [{ id, col, rel, value, filterId }] — filterId set once applied
  sortRows: [],          // sort builder rows: [{ id, col, dir, applied }] — applied rows, top to bottom, are the sort order
    hiddenCols: new Set(), // keys of columns the user has hidden
    page: 1,
  pageSize: 5,
};
let nextId = 1;
let nextRowId = 1;
let nextSortRowId = 1;



/* ===== Helpers ===== */
const $ = id => document.getElementById(id);
const colOf = key => COLUMNS.find(c => c.key === key);
const relLabel = (type, rel) => RELATIONS[type].find(r => r[0] === rel)[1];
const money = n => n ? n.toLocaleString("en-KE", { minimumFractionDigits: 2 }) : "";
const fmtDate = iso => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

/* ===== Search bar ===== */
function initSearchBar() {
  $("colSelect").innerHTML = COLUMNS.map(c => `<option value="${c.key}">${c.label}</option>`).join("");
  $("colSelect").addEventListener("change", syncRelationOptions);
  syncRelationOptions();

  $("searchForm").addEventListener("submit", e => {
    e.preventDefault();
    const col = colOf($("colSelect").value);
    const rel = $("relSelect").value;
    const raw = $("valInput").value.trim();

    if (!raw) return showHint("Enter a value to search for.");
    if (col.type === "number" && isNaN(Number(raw.replace(/,/g, ""))))
      return showHint(`${col.label} needs a number, like 5000.`);

    hideHint();
        state.filters.push({ id: nextId++, col: col.key, rel, value: raw, source: "search" });
    state.page = 1;
    $("valInput").value = "";
    render();
  });
}

function syncRelationOptions() {
  const col = colOf($("colSelect").value);
  $("relSelect").innerHTML = RELATIONS[col.type].map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  const input = $("valInput");
  input.value = "";
  input.type = col.type === "date" ? "date" : "text";
  input.inputMode = col.type === "number" ? "decimal" : "text";
  input.placeholder = col.type === "number" ? "e.g. 5000" : col.type === "text" ? `e.g. ${col.key === "ref" ? "TXN-24" : "loan"}` : "";
  hideHint();
}
function showHint(msg) { $("hint").textContent = msg; $("hint").hidden = false; $("valInput").setAttribute("aria-invalid", "true"); $("valInput").focus(); }
function hideHint() { $("hint").hidden = true; $("valInput").removeAttribute("aria-invalid"); }


/* Shared validation for a condition. Returns an error message, or "" when valid. */
function validateCondition(col, raw) {
  if (!raw) return "Enter a value.";
  if (col.type === "number" && isNaN(Number(raw.replace(/,/g, "")))) return `${col.label} needs a number, like 5000.`;
  return "";
}

/* ===== Filter builder rows ===== */
function newFilterRow() {
  const col = COLUMNS[0];
  return { id: nextRowId++, col: col.key, rel: RELATIONS[col.type][0][0], value: "", filterId: null, error: "" };
}
function ensureEmptyRow() {
  if (!state.filterRows.some(r => r.filterId === null)) state.filterRows.push(newFilterRow());
}

function renderFilterRows() {
  $("filterRows").innerHTML = state.filterRows.map(r => {
    const col = colOf(r.col);
    const applied = r.filterId !== null;
    const dis = applied ? "disabled" : "";
    const inputType = col.type === "date" ? "date" : "text";
    const placeholder = col.type === "number" ? "e.g. 30" : col.type === "text" ? "e.g. loan" : "";
    return `<div class="filter-row${applied ? " applied" : ""}" data-row="${r.id}">
      <div class="field">
        <label for="fcol-${r.id}">Column</label>
        <select id="fcol-${r.id}" data-field="col" ${dis}>
          ${COLUMNS.map(c => `<option value="${c.key}" ${c.key === r.col ? "selected" : ""}>${c.label}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="frel-${r.id}">Rel</label>
        <select id="frel-${r.id}" data-field="rel" ${dis}>
          ${RELATIONS[col.type].map(([v, l]) => `<option value="${v}" ${v === r.rel ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="fval-${r.id}">Value</label>
        <input id="fval-${r.id}" data-field="value" type="${inputType}" inputmode="${col.type === "number" ? "decimal" : "text"}"
          placeholder="${placeholder}" value="${esc(r.value)}" autocomplete="off" ${dis}
          ${r.error ? `aria-invalid="true" aria-describedby="ferr-${r.id}"` : ""}>
      </div>
      <div class="row-actions">
        <button type="button" class="icon-btn add" data-action="add" ${dis}
          aria-label="${applied ? "Filter applied" : "Add filter"}" title="${applied ? "Applied" : "Add filter"}">
          ${applied
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`}
        </button>
        <button type="button" class="icon-btn bin" data-action="delete" aria-label="Remove filter" title="Remove filter">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>
        </button>
      </div>
      ${r.error ? `<p class="hint row-hint" id="ferr-${r.id}">${esc(r.error)}</p>` : ""}
    </div>`;
  }).join("");
}

// Keep typed values in state so re-rendering never loses them
$("filterRows").addEventListener("input", e => {
  const rowEl = e.target.closest("[data-row]");
  const row = rowEl && state.filterRows.find(r => r.id === Number(rowEl.dataset.row));
  if (!row || e.target.dataset.field !== "value") return;
  row.value = e.target.value;
  if (row.error) { row.error = ""; e.target.removeAttribute("aria-invalid"); rowEl.querySelector(".row-hint")?.remove(); }
});

// Column change resets Rel and Value to fit the new column's type
$("filterRows").addEventListener("change", e => {
  const rowEl = e.target.closest("[data-row]");
  const row = rowEl && state.filterRows.find(r => r.id === Number(rowEl.dataset.row));
  if (!row) return;
  if (e.target.dataset.field === "col") {
    row.col = e.target.value;
    row.rel = RELATIONS[colOf(row.col).type][0][0];
    row.value = ""; row.error = "";
    renderFilterRows();
    $(`fval-${row.id}`).focus();
  } else if (e.target.dataset.field === "rel") {
    row.rel = e.target.value;
  }
});

// Enter in a value box acts like the + button
$("filterRows").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.dataset.field === "value") {
    e.preventDefault();
    e.target.closest("[data-row]").querySelector('[data-action="add"]').click();
  }
});

$("filterRows").addEventListener("click", e => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const rowEl = btn.closest("[data-row]");
  const row = state.filterRows.find(r => r.id === Number(rowEl.dataset.row));

  if (btn.dataset.action === "add") {
    const col = colOf(row.col);
    const raw = row.value.trim();
    const err = validateCondition(col, raw);
    if (err) { row.error = err; renderFilterRows(); $(`fval-${row.id}`).focus(); return; }

    const filter = { id: nextId++, col: row.col, rel: row.rel, value: raw, source: "filter" };
    state.filters.push(filter);
    row.value = raw; row.filterId = filter.id; row.error = "";
    state.filterRows.push(newFilterRow());   // fresh row for the next condition
    state.page = 1;
    render();
    $(`fval-${state.filterRows.at(-1).id}`).focus();
  }

  if (btn.dataset.action === "delete") {
    removeFilterRow(row.id);
    state.page = 1;
    render();
  }
});

function removeFilterRow(rowId) {
  const row = state.filterRows.find(r => r.id === rowId);
  if (!row) return;
  if (row.filterId !== null) state.filters = state.filters.filter(f => f.id !== row.filterId);
  // The last blank row is cleared rather than removed, so there is always one row to type into
  const blanks = state.filterRows.filter(r => r.filterId === null);
  if (row.filterId === null && blanks.length === 1) Object.assign(row, newFilterRow(), { id: row.id });
  else state.filterRows = state.filterRows.filter(r => r.id !== rowId);
  ensureEmptyRow();
}

/* ===== Filtering + sorting ===== */
function applyFilters(rows) {
  return rows.filter(row => state.filters.every(f => {
    const col = colOf(f.col);
    let v = row[f.col], q = f.value;
    if (col.type === "number") q = Number(q.replace(/,/g, ""));
    if (col.type === "text") v = String(v);
    return TESTS[f.rel](v, q);
  }));
}

/* ===== Sort builder rows ===== */
const SORT_ORDERS = [["asc", "Ascending"], ["desc", "Descending"]];

function newSortRow() {
  return { id: nextSortRowId++, col: COLUMNS[0].key, dir: "asc", applied: false, error: "" };
}
function ensureEmptySortRow() {
  if (!state.sortRows.some(r => !r.applied)) state.sortRows.push(newSortRow());
}

function renderSortRows() {
  let level = 0;
  $("sortRows").innerHTML = state.sortRows.map(r => {
    const dis = r.applied ? "disabled" : "";
    const lead = r.applied ? (level++ === 0 ? "Sort by" : "Then by") : (level === 0 ? "Sort by" : "Then by");
    return `<div class="filter-row sort-row${r.applied ? " applied" : ""}" data-sortrow="${r.id}">
      <span class="sort-lead">${lead}</span>
      <div class="field">
        <label for="scol-${r.id}">Column</label>
        <select id="scol-${r.id}" data-field="col" ${dis}>
          ${COLUMNS.map(c => `<option value="${c.key}" ${c.key === r.col ? "selected" : ""}>${c.label}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="sdir-${r.id}">Order</label>
        <select id="sdir-${r.id}" data-field="dir" ${dis}
          ${r.error ? `aria-invalid="true" aria-describedby="serr-${r.id}"` : ""}>
          ${SORT_ORDERS.map(([v, l]) => `<option value="${v}" ${v === r.dir ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </div>
      <div class="row-actions">
        <button type="button" class="icon-btn add" data-action="add" ${dis}
          aria-label="${r.applied ? "Sort applied" : "Add sort"}" title="${r.applied ? "Applied" : "Add sort"}">
          ${r.applied
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`}
        </button>
        <button type="button" class="icon-btn bin" data-action="delete" aria-label="Remove sort" title="Remove sort">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>
        </button>
      </div>
      ${r.error ? `<p class="hint row-hint" id="serr-${r.id}">${esc(r.error)}</p>` : ""}
    </div>`;
  }).join("");
}

$("sortRows").addEventListener("change", e => {
  const rowEl = e.target.closest("[data-sortrow]");
  const row = rowEl && state.sortRows.find(r => r.id === Number(rowEl.dataset.sortrow));
  if (!row) return;
  const field = e.target.dataset.field;
  if (field === "col" || field === "dir") {
    row[field] = e.target.value;
    if (row.error) { row.error = ""; renderSortRows(); }
  }
});

$("sortRows").addEventListener("click", e => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const row = state.sortRows.find(r => r.id === Number(btn.closest("[data-sortrow]").dataset.sortrow));

  if (btn.dataset.action === "add") {
    // A column can only be sorted once; sorting it twice would be ignored anyway
    if (sortRules().some(r => r.col === row.col)) {
      row.error = `Already sorting by ${colOf(row.col).label}. Pick another column, or remove that sort first.`;
      renderSortRows();
      return;
    }
    row.applied = true; row.error = "";
    state.sortRows.push(newSortRow());
    render();
  }

  if (btn.dataset.action === "delete") {
    removeSortRow(row.id);
    render();
  }
});

function removeSortRow(rowId) {
  const row = state.sortRows.find(r => r.id === rowId);
  if (!row) return;
  const blanks = state.sortRows.filter(r => !r.applied);
  if (!row.applied && blanks.length === 1) Object.assign(row, newSortRow(), { id: row.id });   // keep one blank row
  else state.sortRows = state.sortRows.filter(r => r.id !== rowId);
  ensureEmptySortRow();
}

/* Applied sort rows, in priority order. The header arrows and the sort rows both read and write this. */
const sortRules = () => state.sortRows.filter(r => r.applied);

function applySort(rows) {
  const rules = sortRules();
  if (!rules.length) return rows;
  return [...rows].sort((a, b) => {
    for (const { col, dir } of rules) {           // first rule decides; later rules break ties
      const m = dir === "asc" ? 1 : -1;
      if (a[col] > b[col]) return m;
      if (a[col] < b[col]) return -m;
    }
    return 0;
  });
}

/* ===== Table header with sort arrows ===== */
function renderHead() {
  const rules = sortRules();
  $("headRow").innerHTML = visibleColumns().map(c => {
    const i = rules.findIndex(r => r.col === c.key);
    const aria = i === -1 ? "none" : rules[i].dir === "asc" ? "ascending" : "descending";
    const priority = i !== -1 && rules.length > 1 ? `<span class="sort-priority" title="Sort level ${i + 1}">${i + 1}</span>` : "";
    return `<th class="${c.type === "number" ? "num" : ""}" aria-sort="${aria}">
      <button class="sort-btn" data-key="${c.key}" type="button">
        ${c.label}${priority}
        <span class="arrows" aria-hidden="true">
          <svg class="up" viewBox="0 0 10 6"><path d="M5 0 10 6H0z"/></svg>
          <svg class="down" viewBox="0 0 10 6"><path d="M0 0h10L5 6z"/></svg>
        </span>
      </button></th>`;
  }).join("");
}
$("headRow").addEventListener("click", e => {
  const btn = e.target.closest(".sort-btn");
  if (!btn) return;
  const key = btn.dataset.key;
  const existing = sortRules().find(r => r.col === key);
  if (existing) {
    existing.dir = existing.dir === "asc" ? "desc" : "asc";   // already sorted: flip its direction, keep other levels
  } else {
    // Quick sort: a header click on a new column replaces all sort rows with that one column
    state.sortRows = [{ id: nextSortRowId++, col: key, dir: "asc", applied: true }];
    ensureEmptySortRow();
  }
  render();
});

/* ===== Main render ===== */
function render() {
  const filtered = applySort(applyFilters(DATA));
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const pageRows = filtered.slice(start, start + state.pageSize);

    renderHead();
    renderFilterRows();
    renderSortRows();

  $("tbody").innerHTML = pageRows.length
        ? pageRows.map(r => `<tr>${visibleColumns().map(c => CELL[c.key](r)).join("")}</tr>`).join("")
    : `<tr class="empty"><td colspan="${visibleColumns().length}">No transactions match these filters. Remove a filter below to see more.</td></tr>`;

  renderColumnMenu();

  // Status message
  $("status").innerHTML = state.filters.length
    ? `Showing <strong>${filtered.length}</strong> of ${DATA.length} transactions matching ${state.filters.length === 1 ? "this filter" : `all ${state.filters.length} filters`}:`
    : `Showing all <strong>${DATA.length}</strong> transactions. Use the search bar or filters to narrow them down.`;

  // Filter chips: Column · Relationship · Value — each segment has ✕ that removes the filter
  $("chips").innerHTML = state.filters.map(f => {
    const col = colOf(f.col);
    const shownVal = col.type === "date" ? fmtDate(f.value) : f.value;
    const seg = (k, v) => `<button type="button" data-remove="${f.id}" aria-label="Remove filter ${esc(col.label)} ${esc(relLabel(col.type, f.rel))} ${esc(shownVal)}">
        <span class="k">${k}</span>${esc(v)}<span class="x" aria-hidden="true">×</span></button>`;
        const tag = `<span class="chip-tag" title="${f.source === "search" ? "From the search bar" : "From the filters"}">${f.source === "search" ? "Search" : "Filter"}</span>`;
    return `<span class="chip">${tag}${seg("Column", col.label)}${seg("Relationship", relLabel(col.type, f.rel))}${seg("Value", shownVal)}</span>`;
      }).join("") + sortChipsHtml() + hiddenChipsHtml() +
    (state.filters.length + sortRules().length + state.hiddenCols.size > 1 ? `<button type="button" class="clear-all" data-clear>Clear all</button>` : "");

  // Sort summary, after the filter status
  const rules = sortRules();
  if (rules.length) {
    const words = rules.map(r => `${colOf(r.col).label} (${r.dir === "asc" ? "ascending" : "descending"})`);
    $("status").insertAdjacentHTML("beforeend", ` Sorted by <strong>${words.join("</strong>, then <strong>")}</strong>.`);
  }

  // Pagination
  $("pageLabel").textContent = `Page ${state.page} of ${totalPages}`;
  $("firstBtn").disabled = $("prevBtn").disabled = state.page === 1;
  $("nextBtn").disabled = $("lastBtn").disabled = state.page === totalPages;
  render.totalPages = totalPages;
}

$("chips").addEventListener("click", e => {
  const rm = e.target.closest("[data-remove]");
  if (rm) {
    const id = Number(rm.dataset.remove);
    const row = state.filterRows.find(r => r.filterId === id);
    if (row) removeFilterRow(row.id);                       // chip came from a filter row: remove that row too
    else state.filters = state.filters.filter(f => f.id !== id);
    state.page = 1; render();
  }
  const rmSort = e.target.closest("[data-remove-sort]");
    if (rmSort) { removeSortRow(Number(rmSort.dataset.removeSort)); render(); }
      const showCol = e.target.closest("[data-show-col]");
  if (showCol) { state.hiddenCols.delete(showCol.dataset.showCol); render(); }
  if (e.target.closest("[data-clear]")) {
    state.filters = []; state.filterRows = []; ensureEmptyRow();
      state.sortRows = []; ensureEmptySortRow();
    state.hiddenCols.clear();
    state.page = 1; render();
  }
});

$("firstBtn").onclick = () => { state.page = 1; render(); };
$("prevBtn").onclick  = () => { state.page--; render(); };
$("nextBtn").onclick  = () => { state.page++; render(); };
$("lastBtn").onclick  = () => { state.page = render.totalPages; render(); };
$("pageSize").onchange = e => { state.pageSize = Number(e.target.value); state.page = 1; render(); };

/* Bottom chips for applied sorts: Column · Order, each with × that removes that sort level */
function sortChipsHtml() {
  return sortRules().map(r => {
    const label = colOf(r.col).label;
    const order = r.dir === "asc" ? "Ascending" : "Descending";
    const seg = (k, v) => `<button type="button" data-remove-sort="${r.id}" aria-label="Remove sort ${esc(label)} ${order}">
        <span class="k">${k}</span>${esc(v)}<span class="x" aria-hidden="true">×</span></button>`;
    return `<span class="chip chip-sort"><span class="chip-tag">Sort</span>${seg("Column", label)}${seg("Order", order)}</span>`;
  }).join("");
}
/* ===== Show / hide columns ===== */
const visibleColumns = () => COLUMNS.filter(c => !state.hiddenCols.has(c.key));

/* How each column's cell is drawn. Add an entry here when you add a column to COLUMNS. */
const CELL = {
  ref:         r => `<td class="ref">${esc(r.ref)}</td>`,
  description: r => `<td class="desc">${esc(r.description)}</td>`,
  date:        r => `<td class="date">${fmtDate(r.date)}</td>`,
  moneyIn:     r => `<td class="num in">${money(r.moneyIn)}</td>`,
  moneyOut:    r => `<td class="num out">${money(r.moneyOut)}</td>`,
};

function renderColumnMenu() {
  const shown = visibleColumns().length;
  $("colCount").textContent = `${shown} of ${COLUMNS.length}`;
  $("colChecks").innerHTML = COLUMNS.map(c => {
    const visible = !state.hiddenCols.has(c.key);
    const isLast = visible && shown === 1;              // keep at least one column on screen
    return `<label class="col-check${isLast ? " locked" : ""}" ${isLast ? 'title="At least one column must stay visible"' : ""}>
      <input type="checkbox" id="colvis-${c.key}" data-col="${c.key}" ${visible ? "checked" : ""} ${isLast ? "disabled" : ""}>
      ${c.label}
    </label>`;
  }).join("");
  $("showAllCols").hidden = state.hiddenCols.size === 0;
}

function setColMenu(open) {
  $("colMenu").hidden = !open;
  $("colMenuBtn").setAttribute("aria-expanded", String(open));
}
$("colMenuBtn").addEventListener("click", () => setColMenu($("colMenu").hidden));
$("colChecks").addEventListener("change", e => {
  const key = e.target.dataset.col;
  if (!key) return;
  e.target.checked ? state.hiddenCols.delete(key) : state.hiddenCols.add(key);
  render();
  $(`colvis-${key}`).focus();                           // keep focus in the menu after it re-renders
});
$("showAllCols").addEventListener("click", () => { state.hiddenCols.clear(); render(); $("colMenuBtn").focus(); });
// Close the menu on outside click or Escape
document.addEventListener("click", e => { if (!$("colMenuWrap").contains(e.target)) setColMenu(false); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("colMenu").hidden) { setColMenu(false); $("colMenuBtn").focus(); } });

/* Bottom chips for hidden columns: × shows the column again */
function hiddenChipsHtml() {
  return COLUMNS.filter(c => state.hiddenCols.has(c.key)).map(c =>
    `<span class="chip chip-hidden"><span class="chip-tag">Hidden</span><button type="button" data-show-col="${c.key}" aria-label="Show column ${esc(c.label)}">
      <span class="k">Column</span>${esc(c.label)}<span class="x" aria-hidden="true">×</span></button></span>`
  ).join("");
}
initSearchBar();
ensureEmptyRow();
ensureEmptySortRow();
render();