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
  sort: { key: null, dir: "asc" },
  page: 1,
  pageSize: 5,
};
let nextId = 1;
let nextRowId = 1;

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
function applySort(rows) {
  const { key, dir } = state.sort;
  if (!key) return rows;
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * m);
}

/* ===== Table header with sort arrows ===== */
function renderHead() {
  $("headRow").innerHTML = COLUMNS.map(c => {
    const sorted = state.sort.key === c.key;
    const aria = sorted ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none";
    return `<th class="${c.type === "number" ? "num" : ""}" aria-sort="${aria}">
      <button class="sort-btn" data-key="${c.key}" type="button">
        ${c.label}
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
  if (state.sort.key === key) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
  else state.sort = { key, dir: "asc" };
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

  $("tbody").innerHTML = pageRows.length
    ? pageRows.map(r => `<tr>
        <td class="ref">${esc(r.ref)}</td>
        <td class="desc">${esc(r.description)}</td>
        <td class="date">${fmtDate(r.date)}</td>
        <td class="num in">${money(r.moneyIn)}</td>
        <td class="num out">${money(r.moneyOut)}</td>
      </tr>`).join("")
    : `<tr class="empty"><td colspan="${COLUMNS.length}">No transactions match these filters. Remove a filter below to see more.</td></tr>`;

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
  }).join("") + (state.filters.length > 1 ? `<button type="button" class="clear-all" data-clear>Clear all</button>` : "");

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
  if (e.target.closest("[data-clear]")) {
    state.filters = []; state.filterRows = []; ensureEmptyRow();
    state.page = 1; render();
  }
});

$("firstBtn").onclick = () => { state.page = 1; render(); };
$("prevBtn").onclick  = () => { state.page--; render(); };
$("nextBtn").onclick  = () => { state.page++; render(); };
$("lastBtn").onclick  = () => { state.page = render.totalPages; render(); };
$("pageSize").onchange = e => { state.pageSize = Number(e.target.value); state.page = 1; render(); };

initSearchBar();
ensureEmptyRow();
render();