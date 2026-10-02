/* Shared UI state, authentication, formatting, pagination and record actions. */

/* Electronics Service Center CRM — UI, forms, reports and page interactions. */

let currentUser = null;
// Which page we're on, e.g. 'dashboard', 'calls', 'login' — set server-side
// in base.html/login.html as a data attribute, so JS never has to guess.
const currentPage = document.body.dataset.page || '';
const ADMIN_ONLY_PAGES = ['income-expenditure', 'settings'];
let editingCallId = null;
// Shared pagination system for every long transactional table (Calls,
// Purchases, Inventory, Cash Book). One page size, one state object, one
// set of render/step functions — instead of duplicating this per table.
const PAGE_SIZE = 50;
const paginationState = { calls: 1, purchases: 1, inventory: 1, cashbook: 1 };
// Function declarations are hoisted, so this works even though renderCalls/
// renderPurchases/renderInventory/renderCashbook are defined further down.
const PAGINATION_RENDER_FN = {
  calls: () => renderCalls(),
  purchases: () => renderPurchases(),
  inventory: () => renderInventory(),
  cashbook: () => renderCashbook(),
};

function paginateRows(rows, key) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (paginationState[key] > totalPages) paginationState[key] = totalPages;
  if (paginationState[key] < 1) paginationState[key] = 1;
  const start = (paginationState[key] - 1) * PAGE_SIZE;
  return { pageRows: rows.slice(start, start + PAGE_SIZE), totalPages, start };
}
function renderPaginationBar(elId, key, totalFiltered, totalPages, start) {
  const el = document.getElementById(elId);
  if (!el) return; // a table that hasn't opted into pagination UI yet — fine, paginateRows() still works without it
  if (totalFiltered <= PAGE_SIZE) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const shownFrom = start + 1;
  const shownTo = Math.min(start + PAGE_SIZE, totalFiltered);
  el.innerHTML = `
    <span style="color:var(--text-dim);font-size:12px;">Showing ${shownFrom}–${shownTo} of ${totalFiltered}</span>
    <div style="display:flex;gap:6px;align-items:center;">
      <button type="button" class="btn sm" ${paginationState[key] <= 1 ? 'disabled' : ''} onclick="changePage('${key}',-1)">‹ Prev</button>
      <span style="font-size:12px;color:var(--text-dim);">Page ${paginationState[key]} of ${totalPages}</span>
      <button type="button" class="btn sm" ${paginationState[key] >= totalPages ? 'disabled' : ''} onclick="changePage('${key}',1)">Next ›</button>
    </div>`;
}
function changePage(key, delta) {
  paginationState[key] += delta;
  PAGINATION_RENDER_FN[key]();
  document.getElementById(key + 'Tbody')?.closest('.table-wrap')?.scrollTo({ top: 0, behavior: 'smooth' });
}
function resetPageAndRender(key) {
  paginationState[key] = 1;
  PAGINATION_RENDER_FN[key]();
}
let editingPurchaseId = null;
let editingInventoryId = null;
// Set only while the "Service Center Bracket" auto-credit flow is active
// (the New Entry form was opened automatically from Call Data, not by the
// user clicking "+ New Entry" themselves). Cleared whenever the inventory
// modal closes, for any reason — see closeInventoryForm().
let bracketCreditActiveContext = null;
function isAdmin() { return !!(currentUser && currentUser.role === 'Admin'); }

const CALL_FIELDS = [
  ['Sr No', 'srNo'], ['Log No', 'logNo'], ['Entry Date', 'date'], ['Ticket Number', 'ticketNumber'], ['Customer Name', 'customerName'],
  ['Mobile', 'mobile'], ['Address', 'address'], ['Product', 'product'], ['Brand', 'brand'], ['Model Number', 'model'], ['Serial Number', 'serial'],
  ['Size', 'size'], ['Date Of Purchase', 'dateOfPurchase'], ['Actual Issue', 'actualIssue'], ['Work Done', 'workDone'],
  ['Warranty', 'warranty'], ['Status', 'status'], ['Technician', 'technician'], ['Tech Type', 'techType'],
  ['Bracket Used', 'bracketUsed'], ['Bracket Charges', 'bracketCharges'], ['Call Charges', 'callCharges'],
  ['Defective Part Returned', 'defectivePartReturned'], ['Service Center Bill Amount', 'billAmount'],
  ['Dependency', 'dependency'], ['Completed Date', 'completedDate'],
  ['Invoice Photo URL', 'beforeImageUrl'], ['After Service Photo URL', 'afterImageUrl'],
  ['Material Cost', 'materialCost'], ['Net Amount', 'netAmount'],  // Admin-only — filtered out in reportColumns() for Staff
  ['Approval Status', 'approvalStatus'], ['Settlement Status', 'settlementStatus'],  // Settlement Status is Admin-only, same filtering as above
  ['Record Id', 'id']
];
const PURCHASE_FIELDS = [
  ['Sr No', 'srNo'], ['Log No', 'logNo'], ['Entry Date', 'date'], ['Supplier Brand', 'supplierBrand'], ['Invoice No', 'invoiceNo'],
  ['Material', 'material'], ['Part Code', 'partCode'], ['Serial Number', 'serial'], ['Size', 'size'],
  ['Qty', 'qty'], ['Rate Per Qty', 'rate'], ['Type', 'type'], ['Debit', 'debit'], ['Credit', 'credit'],
  ['Sales Price Per Unit', 'salesPrice'], ['Comments', 'comments'], ['Record Id', 'id']
];
const INVENTORY_FIELDS = [
  ['Sr No', 'srNo'], ['Log No', 'logNo'], ['Entry Date', 'date'], ['Client Brand', 'clientBrand'], ['Debited To Sold To', 'issuedTo'],
  ['Invoice No', 'invoiceNo'], ['Material', 'material'], ['Part Code', 'partCode'], ['Serial Number', 'serial'],
  ['Size', 'size'], ['Qty', 'qty'], ['Rate Per Qty', 'rate'], ['Type', 'type'], ['Discount Per Unit', 'discount'], ['Amount', 'amount'],
  ['Linked Service Call', 'linkedTicket'], ['Comments', 'comments'], ['Record Id', 'id']
];
const CASHBOOK_FIELDS = [
  ['Sr No', 'srNo'], ['Voucher No', 'voucherNo'], ['Date', 'date'], ['TranType', 'tranType'], ['Category', 'category'],
  ['Main Group', 'group'], ['Particulars', 'particulars'], ['Stakeholder Name', 'stakeholder'], ['Payment Mode', 'mode'],
  ['Amount', 'amount'], ['Comments', 'comments'], ['Record Id', 'id']
];

function padNo(prefix, n) { return prefix + String(n).padStart(5, '0'); }
function callLogNo(c) { return (c && c.logNo) || padNo('SRV', (c && c.srNo) || 0); }
function purchLogNo(p) { return (p && p.logNo) || padNo('PUR', (p && p.srNo) || 0); }
function invLogNo(v) { return (v && v.logNo) || padNo('INV', (v && v.srNo) || 0); }


function uid() { return 'x' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateDMY(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return d;
  const p = n => String(n).padStart(2, '0');
  return `${p(dt.getDate())}-${p(dt.getMonth() + 1)}-${dt.getFullYear()}`;
}
function fmtDateTime(d) {
  if (!d) return '—';
  // MySQL DATETIME comes back as "YYYY-MM-DD HH:MM:SS" — Safari/some
  // browsers won't parse that directly, so normalize to ISO first.
  const dt = new Date(String(d).replace(' ', 'T'));
  if (isNaN(dt)) return d;
  return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function money(n) {
  n = Number(n) || 0;
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Live stock map: material -> net qty available (purchased − consumed, all time) ----
function getStockMap(excludeId) {
  const byMaterial = {};
  DB.purchases.forEach(p => {
    if (!byMaterial[p.material]) byMaterial[p.material] = 0;
    byMaterial[p.material] += p.type === 'Purchase' ? p.qty : -p.qty;
  });
  DB.inventory.forEach(v => {
    if (excludeId && v.id === excludeId) return; // treat the record being edited as if it hadn't happened yet
    if (!byMaterial[v.material]) byMaterial[v.material] = 0;
    byMaterial[v.material] += v.type === 'Debit' ? -v.qty : v.qty;
  });
  return byMaterial;
}
function availableStock(material, excludeId) {
  const stock = getStockMap(excludeId);
  return stock[material] || 0;
}

// ---- Specification facets: Brand / Part Code / Serial / Size, drawn only from what's really on record ----
// For an "Issued" (Debit) entry, the pool is limited to specific brand+code+serial+size combinations
// that still have stock on hand. For a "Returned" (Credit) entry, the pool is every combination ever
// recorded for that material, since a return isn't stock-constrained.
function getBatchesForMaterial(material, excludeId) {
  const map = {};
  const key = (b, pc, sn, sz) => [b || '', pc || '', sn || '', sz || ''].join('|||');
  DB.purchases.forEach(p => {
    if (p.material !== material) return;
    const k = key(p.supplierBrand, p.partCode, p.serial, p.size);
    if (!map[k]) map[k] = { brand: p.supplierBrand || '', partCode: p.partCode || '', serial: p.serial || '', size: p.size || '', qty: 0 };
    map[k].qty += p.type === 'Purchase' ? p.qty : -p.qty;
  });
  DB.inventory.forEach(v => {
    if (v.material !== material) return;
    if (excludeId && v.id === excludeId) return;
    const k = key(v.clientBrand, v.partCode, v.serial, v.size);
    if (!map[k]) map[k] = { brand: v.clientBrand || '', partCode: v.partCode || '', serial: v.serial || '', size: v.size || '', qty: 0 };
    map[k].qty += v.type === 'Debit' ? -v.qty : v.qty;
  });
  return Object.values(map).filter(b => b.qty > 0);
}
function allSpecRowsForMaterial(material) {
  const rows = [];
  DB.purchases.forEach(p => { if (p.material === material) rows.push({ brand: p.supplierBrand || '', partCode: p.partCode || '', serial: p.serial || '', size: p.size || '' }); });
  DB.inventory.forEach(v => { if (v.material === material) rows.push({ brand: v.clientBrand || '', partCode: v.partCode || '', serial: v.serial || '', size: v.size || '' }); });
  const seen = {}; const out = [];
  rows.forEach(r => { const k = [r.brand, r.partCode, r.serial, r.size].join('|||'); if (!seen[k]) { seen[k] = 1; out.push(r); } });
  return out;
}
// The exact rate for one specific, fully-specified batch — not just "the
// most recent price for this material name" (DB.priceList), which can be
// wrong if the same material was bought from different brands/batches at
// different prices. Only usable once every spec field is actually chosen.
function exactBatchSalesPrice(material, brand, partCode, serial, size) {
  const matches = DB.purchases.filter(p =>
    p.type === 'Purchase' && p.material === material &&
    (p.supplierBrand || '') === (brand || '') &&
    (p.partCode || '') === (partCode || '') &&
    (p.serial || '') === (serial || '') &&
    (p.size || '') === (size || '')
  );
  if (!matches.length) return null;
  matches.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.srNo || 0) - (b.srNo || 0));
  const price = matches[matches.length - 1].salesPrice;
  return price != null ? price : null;
}
// ---- What a specific technician currently holds (Debit − Credit, only their own entries) ----
// Used to limit "Returned (Credit)" entries to material that technician was actually issued and hasn't returned yet.
function getTechnicianOutstandingBatches(technician, material, excludeId) {
  const map = {};
  const key = (b, pc, sn, sz) => [b || '', pc || '', sn || '', sz || ''].join('|||');
  DB.inventory.forEach(v => {
    if (v.material !== material) return;
    if (v.issuedTo !== technician) return;
    if (excludeId && v.id === excludeId) return;
    const k = key(v.clientBrand, v.partCode, v.serial, v.size);
    if (!map[k]) map[k] = { brand: v.clientBrand || '', partCode: v.partCode || '', serial: v.serial || '', size: v.size || '', qty: 0 };
    map[k].qty += v.type === 'Debit' ? v.qty : -v.qty;
  });
  return Object.values(map).filter(b => b.qty > 0);
}
function technicianOutstandingMaterialsMap(technician, excludeId) {
  const map = {};
  if (!technician) return map;
  DB.inventory.forEach(v => {
    if (v.issuedTo !== technician) return;
    if (excludeId && v.id === excludeId) return;
    map[v.material] = (map[v.material] || 0) + (v.type === 'Debit' ? v.qty : -v.qty);
  });
  return map;
}
function specPool(material, type, excludeId, technician) {
  if (!material) return [];
  if (type === 'Debit') return getBatchesForMaterial(material, excludeId);
  return getTechnicianOutstandingBatches(technician, material, excludeId); // Credit — only this technician's outstanding stock
}
function rowMatchesFilter(r, filt) {
  return (!filt.brand || r.brand === filt.brand)
    && (!filt.partCode || r.partCode === filt.partCode)
    && (!filt.serial || r.serial === filt.serial)
    && (!filt.size || r.size === filt.size);
}
let lastMatchedSpecAvail = null; // qty available for the exact combo currently selected (Debit only)

function nextSeq(kind) {
  DB.seq[kind] = (DB.seq[kind] || 0) + 1;
  return DB.seq[kind];

}

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.querySelector('.toast-msg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------------- login / auth guard ----------------
   Multi-page app: every protected page checks for a valid session on load
   and redirects to /login if there isn't one. The login page itself
   redirects TO /dashboard on success — no more show/hide of a single DOM. */
function applyUserToChrome(user) {
  currentUser = user;
  document.body.classList.toggle('role-staff', user.role !== 'Admin');
  document.body.classList.toggle('role-admin', user.role === 'Admin');
  const nameEl = document.getElementById('userChipName');
  const roleEl = document.getElementById('userChipRole');
  const avatarEl = document.getElementById('userAvatar');
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.role;
  if (avatarEl) {
    // A recognisable role icon instead of a plain initial letter — a
    // shield for Admin, a person outline for Staff — so who's logged in
    // is obvious at a glance, not just readable on close inspection.
    // Admin: a shield with a small settings gear — the same visual idea
    // as the "admin panel / admin settings" icons on react-icons (e.g.
    // MdAdminPanelSettings). Staff: a circular profile silhouette, same
    // idea as react-icons' "profile" results (e.g. FaUserCircle). Both
    // use an identical square 24x24 viewBox, so neither ever stretches
    // into an oval inside the round avatar — always a clean circle.
    const adminIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3Z"/><circle cx="12" cy="10.5" r="2.3"/><path d="M12 12.8v2M12 6.7v1M9.9 7.6l.7.7M14.1 7.6l-.7.7M9.9 13.4l.7-.7M14.1 13.4l-.7-.7M8.7 10.5h1M14.3 10.5h1"/></svg>`;
    const staffIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="9.8" r="3.3"/><path d="M5.5 19c1.2-2.9 3.7-4.4 6.5-4.4s5.3 1.5 6.5 4.4"/></svg>`;
    avatarEl.innerHTML = user.role === 'Admin' ? adminIcon : staffIcon;
    avatarEl.title = user.role === 'Admin' ? 'Admin' : 'Staff';
  }
}

function requireAuth() {
  const savedUser = sessionStorage.getItem('crm_user');
  if (!authToken || !savedUser) {
    window.location.href = '/login';
    return false;
  }
  let user;
  try { user = JSON.parse(savedUser); } catch (e) { doLogout(); return false; }
  applyUserToChrome(user);
  if (ADMIN_ONLY_PAGES.includes(currentPage) && !isAdmin()) {
    window.location.href = '/dashboard';
    return false;
  }
  return true;
}

function doLogout() {
  authToken = null;
  currentUser = null;
  sessionStorage.removeItem('crm_token');
  sessionStorage.removeItem('crm_user');
  window.location.href = '/login';
}

function initPasswordToggle() {
  const btn = document.getElementById('passwordToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const pass = document.getElementById('loginPass');
    const showing = pass.type === 'text';
    pass.type = showing ? 'password' : 'text';
    btn.classList.toggle('showing', !showing);
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });
}

// Generic version for modals with one or more password fields (e.g. the
// Reset/Change Password modal) — wires up every eye-icon button inside
// the given container via its data-toggle-for attribute, so any number of
// password fields can reuse this without a dedicated function each.
function initGenericPasswordToggles(container) {
  container.querySelectorAll('.password-toggle[data-toggle-for]').forEach(btn => {
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', () => {
      const pass = document.getElementById(btn.dataset.toggleFor);
      const showing = pass.type === 'text';
      pass.type = showing ? 'password' : 'text';
      btn.classList.toggle('showing', !showing);
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  });
}

function initLoginPage() {
  initPasswordToggle();
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('loginUser').value.trim();
    const p = document.getElementById('loginPass').value;
    const err = document.getElementById('loginErr');
    const submitBtn = form.querySelector('button[type="submit"]');
    err.style.display = 'none';
    if (submitBtn) submitBtn.disabled = true;
    try {
      const resp = await apiFetch('/login', { method: 'POST', body: { username: u, password: p } });
      authToken = resp.token;
      const user = { username: u, name: resp.name, role: resp.role };
      sessionStorage.setItem('crm_token', authToken);
      sessionStorage.setItem('crm_user', JSON.stringify(user));
      window.location.href = '/dashboard';
    } catch (e2) {
      err.style.display = 'block';
      err.textContent = e2.message || 'Invalid username or password.';
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Already logged in (e.g. opened /login directly in a second tab)?
  // Skip straight to the app instead of asking again.
  if (authToken && sessionStorage.getItem('crm_user')) {
    window.location.href = '/dashboard';
  }
}

/* ---------------- mobile menu (small screens only; purely visual, no data logic) ---------------- */
function openMobileMenu() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarBackdrop').classList.add('open');
}
function closeMobileMenu() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('open');
}
function initMobileMenu() {
  document.getElementById('menuToggle').addEventListener('click', openMobileMenu);
  document.getElementById('sidebarBackdrop').addEventListener('click', closeMobileMenu);
}

/* ---------------- render dispatch for the CURRENT page only ---------------- */
async function renderCurrentPage() {
  // Calls live in the database — refresh the local cache before any page
  // that displays call data actually renders.
  if (['calls', 'dashboard', 'slakpi', 'reports', 'inventory'].includes(currentPage)) {
    await loadCallsFromServer();
  }
  // Dropdown lists (technician, brand, part name, etc.) — needed wherever
  // a form uses them: Calls/Purchases/Inventory forms, Settings to manage
  // them, and Reports for the Technician Statement's technician picker.
  if (['calls', 'purchases', 'inventory', 'settings', 'reports'].includes(currentPage)) {
    await loadListsFromServer();
  }
  // Purchases and Inventory feed the Dashboard's stock/purchase KPIs too,
  // and Inventory's own stock-availability calculation needs Purchases
  // data loaded to know what's actually in stock — not just its own page.
  if (['purchases', 'dashboard', 'reports', 'inventory'].includes(currentPage)) {
    await loadPurchasesFromServer();
  }
  if (['inventory', 'dashboard', 'reports'].includes(currentPage)) {
    await loadInventoryFromServer();
  }
  // Cash book ledger: Staff can now view it too (with amounts stripped
  // server-side) — but the Dashboard's cash SUMMARY card and the Reports
  // page's Cash Book export both stay Admin-only.
  if (currentPage === 'cashbook') {
    await loadCashbookFromServer();
  }
  if (['dashboard', 'reports'].includes(currentPage) && isAdmin()) {
    await loadCashbookFromServer();
  }
  // The Settlement modal on Call Data links to a real Cash Book Receipt
  // voucher, so that data has to actually be loaded here too — Admin
  // only, same as everywhere else this data is Admin-gated.
  if (currentPage === 'calls' && isAdmin()) {
    await loadCashbookFromServer();
  }
  if (currentPage === 'income-expenditure' && isAdmin()) {
    await loadCashbookFromServer();
  }
  if (currentPage === 'reports' && isAdmin()) {
    await loadAuditLogFromServer();
  }
  // Categories are needed by anyone adding a cash book entry, admin or staff.
  if (['cashbook', 'settings'].includes(currentPage)) {
    await loadCashCategoriesFromServer();
  }
  // SLA target / opening balance — used on Settings (to edit), SLA/KPI
  // report (to compute compliance), and Dashboard/Cash Book/Reports (the
  // opening balance for cash calculations). Loaded explicitly everywhere
  // it's needed, rather than relying on it arriving as a side effect of
  // some other page's data load.
  if (['settings', 'slakpi', 'dashboard', 'cashbook', 'reports', 'income-expenditure'].includes(currentPage)) {
    await loadSettingsFromServer();
  }
  if (currentPage === 'settings' && isAdmin()) {
    await loadUsersFromServer();
  }

  if (currentPage === 'dashboard') renderDashboard();
  else if (currentPage === 'calls') renderCalls();
  else if (currentPage === 'purchases') renderPurchases();
  else if (currentPage === 'inventory') renderInventory();
  else if (currentPage === 'cashbook') renderCashbook();
  else if (currentPage === 'income-expenditure') renderIncomeExpenditure();
  else if (currentPage === 'settings') renderSettings();
  else if (currentPage === 'reports') renderReportsPreview();
  else if (currentPage === 'slakpi') renderSlaKpi();
}
// Kept as an alias — many existing call sites elsewhere in this file call
// render()/renderAsync() after saving or deleting a record; both now just
// re-render whichever single page we're actually on.
function render() { renderCurrentPage(); }
async function renderAsync() { await renderCurrentPage(); }

/* =========================================================================
   OPTIONS builders
   ========================================================================= */
function opts(list, selected) {
  return list.map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

/* ---------------- shared record actions ---------------- */
const API_WIRED_COLLECTIONS = { calls: '/calls', purchases: '/purchases', inventory: '/inventory', cashbook: '/cashbook' };

// ---- Approval workflow: shared across Calls, Purchases, Inventory, Cash Book ----
// Visible to every user (Admin and Staff both need to see what's locked),
// but only Admin can actually approve — enforced server-side too, this is
// just the matching UI.
function approvalBadgeHTML(status) {
  return status === 'Approved'
    ? '<span class="approval-badge approved" title="Approved by Admin">✓ Approved</span>'
    : '<span class="approval-badge pending" title="Not yet approved">● Not approved</span>';
}
function approveActionHTML(collection, id, status) {
  if (status === 'Approved') return '';
  if (!isAdmin()) return '';
  return `<button class="btn icon sm approve-btn" onclick="approveRecord('${collection}','${id}')" title="Approve this record">✓</button>`;
}

async function approveRecord(collection, id) {
  if (!confirm('Approve this record? Once approved, Staff can no longer edit or delete it — only Admin can.')) return;
  try {
    await apiFetch(API_WIRED_COLLECTIONS[collection] + '/' + id + '/approve', { method: 'PUT' });
    toast('Record approved');
    await renderAsync();
  } catch (e) {
    toast(e.message);
  }
}
// A Staff user should never even see a working Edit/Delete button on an
// already-approved record — the server blocks it anyway, but hiding it
// here avoids a confusing "click it, then get an error" experience.
function isLockedForCurrentUser(status) {
  return status === 'Approved' && !isAdmin();
}

async function deleteRecord(collection, id) {
  if (!confirm('Delete this record? This cannot be undone.')) return;
  if (API_WIRED_COLLECTIONS[collection]) {
    try {
      await apiFetch(API_WIRED_COLLECTIONS[collection] + '/' + id, { method: 'DELETE' });
      toast('Record deleted');
      await renderAsync();
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  DB[collection] = DB[collection].filter(x => x.id !== id);
  await syncExcelFile();
  toast('Record deleted');
  render();
}
