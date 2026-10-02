/* Electronics Service Center CRM — API client and data adapters. */

const COMPANY_NAME = "Electronics Service Center";
const COMPANY_SUBTITLE = "Service & Repair Operations";

let DB = {
  users: [],
  calls: [],
  purchases: [],
  inventory: [],
  cashbook: [],
  cashCategories: [],
  lists: { parts: [], brands: [], brackets: [], employees: [], statuses: [], products: [] },
  seq: { call: 0, purchase: 0, inventory: 0, cash: 0 },
  settings: { slaTargetDays: 3, openingCashBalance: 0 },
  priceList: {},
  auditLog: []
};

/* API adapter: same-origin Flask REST endpoints. */
// Relative path — works automatically whether this is served from
// localhost, your AWS server, or any other domain, since the frontend
// and API now live on the same origin.
const API_BASE = '/api';
// sessionStorage (not localStorage): survives a page refresh in the same
// tab, but is cleared automatically when the browser/tab is closed —
// closing out requires signing in again next time, on purpose.
let authToken = sessionStorage.getItem('crm_token') || null;

async function apiFetch(path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  if (opts.body && typeof opts.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    opts = { ...opts, body: JSON.stringify(opts.body) };
  }
  let res;
  try {
    res = await fetch(API_BASE + path, { ...opts, headers });
  } catch (netErr) {
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  if (res.status === 401 && path !== '/login') {
    doLogout();
    throw new Error('Session expired — please log in again.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body is fine */ }
  if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
  return data;
}

/* ---- API <-> frontend field-name mapping for Calls ---- */
function mapCallFromApi(r) {
  return {
    id: r.id, srNo: r.sr_no, logNo: r.log_no, date: r.entry_date, ticketNumber: r.ticket_number,
    customerName: r.customer_name, mobile: r.mobile, address: r.address, product: r.product, brand: r.brand,
    model: r.model_number, serial: r.serial_number, size: r.size, dateOfPurchase: r.date_of_purchase,
    actualIssue: r.actual_issue, workDone: r.work_done, warranty: r.warranty, status: r.status,
    technician: r.technician, techType: r.tech_type, bracketUsed: r.bracket_used,
    beforeImageUrl: r.before_image_url, afterImageUrl: r.after_image_url,
    bracketCharges: Number(r.bracket_charges) || 0, callCharges: Number(r.call_charges) || 0,
    defectivePartReturned: r.defective_part_returned, billAmount: Number(r.service_center_bill_amount) || 0,
    dependency: r.dependency, completedDate: r.completed_date,
    materialCost: r.material_cost != null ? Number(r.material_cost) : null,
    netAmount: (Number(r.service_center_bill_amount) || 0) - (r.material_cost != null ? Number(r.material_cost) : 0),
    approvalStatus: r.approval_status || 'Pending',
    settlementStatus: r.settlement_status || 'Unsettled',
    settlementVoucherNo: r.settlement_voucher_no,
    settlementVoucherDate: r.settlement_voucher_date,
    settlementComment: r.settlement_comment,
  };
}

async function loadCallsFromServer() {
  try {
    const rows = await apiFetch('/calls');
    DB.calls = rows.map(mapCallFromApi);
  } catch (e) {
    toast(e.message);
  }
}

const LIST_TYPES = ['parts', 'brands', 'brackets', 'employees', 'statuses', 'products'];

async function loadListsFromServer() {
  try {
    const results = await Promise.all(LIST_TYPES.map(t => apiFetch('/lists/' + t)));
    LIST_TYPES.forEach((t, i) => { DB.lists[t] = results[i]; });
  } catch (e) {
    toast(e.message);
  }
}

function mapCashCategoryFromApi(r) {
  return { id: r.id, type: r.tran_type, group: r.cash_group, category: r.category, desc: r.description || '' };
}
async function loadCashCategoriesFromServer() {
  try {
    const rows = await apiFetch('/cashbook/categories');
    DB.cashCategories = rows.map(mapCashCategoryFromApi);
  } catch (e) {
    toast(e.message);
  }
}

async function loadSettingsFromServer() {
  try {
    const s = await apiFetch('/settings');
    if (s.slaTargetDays !== undefined) DB.settings.slaTargetDays = Number(s.slaTargetDays);
    if (s.openingCashBalance !== undefined) DB.settings.openingCashBalance = Number(s.openingCashBalance);
  } catch (e) {
    toast(e.message);
  }
}

async function loadUsersFromServer() {
  try {
    DB.users = await apiFetch('/users');
  } catch (e) {
    toast(e.message);
  }
}

async function loadAuditLogFromServer() {
  try {
    const params = new URLSearchParams();
    const table = document.getElementById('auditTableFilter')?.value;
    const action = document.getElementById('auditActionFilter')?.value;
    const from = document.getElementById('auditFrom')?.value;
    const to = document.getElementById('auditTo')?.value;
    if (table) params.set('table', table);
    if (action) params.set('action', action);
    if (from) params.set('from', from + ' 00:00:00');
    if (to) params.set('to', to + ' 23:59:59');
    DB.auditLog = await apiFetch('/audit-log' + (params.toString() ? '?' + params.toString() : ''));
  } catch (e) {
    toast(e.message);
  }
}

/* ---- Purchases ---- */
function mapPurchaseFromApi(r) {
  const rate = Number(r.rate) || 0;
  const amount = (Number(r.qty) || 0) * rate;
  return {
    id: r.id, srNo: r.sr_no, logNo: r.log_no, date: r.entry_date, supplierBrand: r.supplier_brand,
    invoiceNo: r.invoice_no, material: r.material, partCode: r.part_code, serial: r.serial_number,
    size: r.size, qty: Number(r.qty) || 0, rate,
    type: r.type, debit: r.type === 'Purchase' ? amount : 0, credit: r.type === 'Return' ? amount : 0,
    salesPrice: Number(r.sales_price) || 0, comments: r.comments,
    approvalStatus: r.approval_status || 'Pending',
  };
}
async function loadPurchasesFromServer() {
  try {
    const rows = await apiFetch('/purchases');
    DB.purchases = rows.map(mapPurchaseFromApi);
    // The Rate field on a new Inventory issue auto-fills from the most
    // recent sales price set on a Purchase for that material — but that
    // only works if DB.priceList actually has real data in it, not just
    // whatever happened to be set earlier in this same browser session.
    // Rebuild it here from real purchase history every time Purchases load.
    DB.purchases
      .filter(p => p.type === 'Purchase' && p.material)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.srNo || 0) - (b.srNo || 0))
      .forEach(p => { if (p.salesPrice != null) DB.priceList[p.material] = p.salesPrice; });
  } catch (e) {
    toast(e.message);
  }
}

/* ---- Inventory ---- */
function mapInventoryFromApi(r) {
  return {
    id: r.id, srNo: r.sr_no, logNo: r.log_no, date: r.entry_date, clientBrand: r.client_brand,
    issuedTo: r.issued_to, invoiceNo: r.invoice_no, material: r.material, partCode: r.part_code,
    serial: r.serial_number, size: r.size, qty: Number(r.qty) || 0, rate: Number(r.rate) || 0,
    type: r.type, discount: Number(r.discount) || 0, amount: Number(r.amount) || 0,
    linkedTicket: r.linked_ticket, comments: r.comments,
    approvalStatus: r.approval_status || 'Pending',
  };
}
async function loadInventoryFromServer() {
  try {
    const rows = await apiFetch('/inventory');
    DB.inventory = rows.map(mapInventoryFromApi);
  } catch (e) {
    toast(e.message);
  }
}

/* ---- Cash Book ---- */
function mapCashFromApi(r) {
  return {
    id: r.id, srNo: r.sr_no, voucherNo: r.voucher_no, date: r.entry_date, tranType: r.tran_type,
    category: r.category, group: r.cash_group, particulars: r.particulars, stakeholder: r.stakeholder,
    mode: r.mode, amount: Number(r.amount) || 0, comments: r.comments,
    createdAt: r.created_at || null,
    approvalStatus: r.approval_status || 'Pending',
  };
}
async function loadCashbookFromServer() {
  try {
    const resp = await apiFetch('/cashbook');
    DB.cashbook = resp.entries.map(mapCashFromApi);
    // Staff gets entries but no opening_balance (server omits it for them) —
    // only overwrite DB.settings.openingCashBalance when we actually got one.
    if (resp.opening_balance != null) {
      DB.settings.openingCashBalance = Number(resp.opening_balance) || 0;
    }
  } catch (e) {
    toast(e.message);
  }
}
