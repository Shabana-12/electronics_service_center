/* Service ticket UI, ticket forms, settlement and ticket-specific actions. */

/* =========================================================================
   CALLS (Service tickets / CRM)
   ========================================================================= */
function statusBadge(status) {
  const map = { 'Installation Done': 'green', 'Repair Done': 'green', 'ReSOM': 'blue', 'Revisit Required': 'blue', 'Pending': 'amber', 'Cancelled': 'red' };
  const c = map[status] || 'gray';
  return `<span class="badge ${c}"><span class="dot ${c}"></span>${esc(status || '—')}</span>`;
}

function callFilters() {
  const from = document.getElementById('callFrom')?.value || '';
  const to = document.getElementById('callTo')?.value || '';
  const tech = document.getElementById('callTechFilter')?.value || '';
  const status = document.getElementById('callStatusFilter')?.value || '';
  const approvalFilter = document.getElementById('callApprovalFilter')?.value || '';
  const q = (document.getElementById('callSearch')?.value || '').toLowerCase();
  return DB.calls.filter(c => {
    if (from && c.date < from) return false;
    if (to && c.date > to) return false;
    if (tech && c.technician !== tech) return false;
    if (status && c.status !== status) return false;
    // Approval / Settlement filter. "Unsettled" specifically means
    // "Approved, but not yet settled" — not literally every ticket
    // sitting on the database's default value, since a never-approved
    // ticket also defaults to 'Unsettled' and that's meaningless noise
    // here, not something worth filtering for.
    if (approvalFilter === 'approved' && c.approvalStatus !== 'Approved') return false;
    if (approvalFilter === 'not_approved' && c.approvalStatus === 'Approved') return false;
    if (approvalFilter === 'settled' && c.settlementStatus !== 'Settled') return false;
    if (approvalFilter === 'unsettled' && !(c.approvalStatus === 'Approved' && c.settlementStatus === 'Unsettled')) return false;
    if (approvalFilter === 'rejected' && c.settlementStatus !== 'Rejected') return false;
    if (q && !(`${c.customerName} ${c.mobile} ${c.ticketNumber} ${callLogNo(c)} ${c.product} ${c.brand} ${c.model}`.toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.srNo - a.srNo);
}

function renderCalls() {
  const techSel = document.getElementById('callTechFilter');
  const statusSel = document.getElementById('callStatusFilter');
  if (techSel && !techSel.dataset.filled) {
    techSel.innerHTML = '<option value="">All technicians</option>' + opts(DB.lists.employees);
    techSel.dataset.filled = '1';
  }
  if (statusSel && !statusSel.dataset.filled) {
    statusSel.innerHTML = '<option value="">All statuses</option>' + opts(DB.lists.statuses);
    statusSel.dataset.filled = '1';
  }
  const approvalSel = document.getElementById('callApprovalFilter');
  if (approvalSel && !approvalSel.dataset.filled) {
    // Staff never sees settlement data anywhere else in the app, so this
    // filter only offers Approved / Not Approved for them — the
    // Settled/Unsettled/Rejected options are Admin-only, matching every
    // other settlement control in Call Data.
    approvalSel.innerHTML = isAdmin()
      ? `<option value="">All</option>
         <option value="approved">Approved</option>
         <option value="not_approved">Not Approved</option>
         <option value="settled">Settled</option>
         <option value="unsettled">Unsettled</option>
         <option value="rejected">Rejected</option>`
      : `<option value="">All</option>
         <option value="approved">Approved</option>
         <option value="not_approved">Not Approved</option>`;
    approvalSel.dataset.filled = '1';
  }

  const allRows = callFilters();
  const { pageRows: rows, totalPages, start } = paginateRows(allRows, 'calls');

  const tbody = document.getElementById('callsTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="17">No service calls match these filters. Click "New Call" to log one.</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(c => `
      <tr>
        <td class="mono">${esc(callLogNo(c))}</td>
        <td class="mono">${esc(c.ticketNumber || '—')}</td>
        <td>${fmtDate(c.date)}</td>
        <td><b>${esc(c.customerName)}</b><br><span style="color:var(--text-dim)">${esc(c.mobile || '')}</span></td>
        <td>${c.product ? `<b>${esc(c.product)}</b><br>` : ''}<span style="color:var(--text-dim);font-size:11px">${esc(c.brand)} ${esc(c.model || '')}</span></td>
        <td>${esc(c.actualIssue || '')}</td>
        <td>${esc(c.technician || '—')}<br><span style="color:var(--text-dim);font-size:11px">${esc(c.techType || '')}</span></td>
        <td>${statusBadge(c.status)}</td>
        <td class="center">${photosCellHTML(c)}</td>
        <td class="num">${(() => { const d = callTurnaroundDaysForDisplay(c); return d == null ? '—' : (c.status === 'Pending' ? `${d} <span style="color:var(--text-dim);font-weight:400;">(open)</span>` : d); })()}</td>
        <td class="admin-only">${c.warranty === 'Yes' ? '<span class="badge blue">Brand Ticket</span>' : '<span class="badge gray">Direct Customer</span>'}</td>
        <td class="num">${money(c.billAmount)}</td>
        <td class="num admin-only">${c.warranty === 'No' ? money(c.materialCost || 0) : '—'}</td>
        <td class="num admin-only"><b>${money((c.billAmount || 0) - (c.materialCost || 0))}</b></td>
        <td>${approvalBadgeHTML(c.approvalStatus)} ${c.status === 'Pending' ? '<span style="color:var(--text-dim);font-size:11px;">(finish ticket first)</span>' : approveActionHTML('calls', c.id, c.approvalStatus)}</td>
        <td class="admin-only">${settlementCellHTML(c)}</td>
        <td class="center">
          <div class="rowbtns">
            <button class="btn icon whatsapp" onclick="shareTicketWhatsApp('${c.id}')" title="Copy ticket details for WhatsApp">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            </button>
            <button class="btn icon" onclick="openBill('${c.id}')" title="Generate bill">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
            </button>
            ${isLockedForCurrentUser(c.approvalStatus) ? '' : `
            <button class="btn icon" onclick="openCallForm('${c.id}')" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>`}
            <button class="btn icon danger admin-only" onclick="deleteRecord('calls','${c.id}')" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6"/></svg>
            </button>
          </div>
        </td>
      </tr>`).join('');
  }
  document.getElementById('callsCount').textContent = allRows.length + ' of ' + DB.calls.length;
  renderPaginationBar('callsPagination', 'calls', allRows.length, totalPages, start);
}

function imageUploadFieldHTML(kind, label, value, required) {
  const fileInputId = 'f_' + kind + 'ImageFile';
  const urlFieldId = 'f_' + kind + 'ImageUrl';
  const boxId = 'f_' + kind + 'ImageBox';
  return `
  <div class="field image-field">
    <label class="${required ? 'req' : ''}">${esc(label)}</label>
    <input type="hidden" id="${urlFieldId}" value="${esc(value || '')}">
    <input type="file" id="${fileInputId}" accept="image/*" style="display:none;" onchange="handleImageUpload(this,'${kind}')">
    <div class="image-upload-box" id="${boxId}">${imageUploadBoxInnerHTML(kind, value)}</div>
  </div>`;
}
function imageUploadBoxInnerHTML(kind, value) {
  const fileInputId = 'f_' + kind + 'ImageFile';
  const actionLabel = value ? 'Replace' : 'Attach photo';
  const buttons = `
    <button type="button" class="btn sm attach-btn" onclick="document.getElementById('${fileInputId}').click()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      ${actionLabel}
    </button>`;
  if (value) {
    return `
      <a href="${esc(value)}" target="_blank" rel="noopener"><img src="${esc(value)}" class="image-thumb" alt=""></a>
      ${buttons}
      <span class="image-upload-status"></span>`;
  }
  return `
    ${buttons}
    <span style="color:var(--text-dim);font-size:11px;">Max 5MB</span>
    <span class="image-upload-status"></span>`;
}
const MAX_TICKET_IMAGE_MB = 5;
async function handleImageUpload(inputEl, kind) {
  const file = inputEl.files[0];
  if (!file) return;
  if (file.size > MAX_TICKET_IMAGE_MB * 1024 * 1024) {
    toast(`That photo is too large — please keep it under ${MAX_TICKET_IMAGE_MB}MB.`);
    inputEl.value = '';
    return;
  }
  const boxId = 'f_' + kind + 'ImageBox';
  const urlFieldId = 'f_' + kind + 'ImageUrl';
  const box = document.getElementById(boxId);
  const statusEl = box.querySelector('.image-upload-status');
  if (statusEl) statusEl.textContent = 'Uploading…';
  try {
    const fd = new FormData();
    fd.append('image', file);
    const headers = {};
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
    const res = await fetch(API_BASE + '/uploads/call-image?kind=' + kind, { method: 'POST', headers, body: fd });
    let data = null;
    try { data = await res.json(); } catch (e2) { /* empty body */ }
    if (!res.ok) throw new Error((data && data.error) || 'Upload failed');
    document.getElementById(urlFieldId).value = data.url;
    box.innerHTML = imageUploadBoxInnerHTML(kind, data.url);
    // Photo just arrived, so re-check whether the form can be submitted now
    updateImageRequirementHints();
  } catch (e) {
    box.innerHTML = imageUploadBoxInnerHTML(kind, document.getElementById(urlFieldId).value);
    toast(e.message);
  } finally {
    inputEl.value = '';
  }
}
// Both photos (Invoice / MSP) are only mandatory once a ticket is being
// closed (Installation Done / Repair Done) — optional at every other
// status, including at creation. Keep this in sync with CLOSED_STATUSES
// in app/routes/calls.py.
const CLOSED_STATUSES = ['Installation Done', 'Repair Done'];
function updateImageRequirementHints() {
  const statusEl = document.getElementById('f_status');
  if (!statusEl) return;
  const closing = CLOSED_STATUSES.includes(statusEl.value);
  ['before', 'after'].forEach(kind => {
    const urlEl = document.getElementById('f_' + kind + 'ImageUrl');
    const label = document.querySelector('#f_' + kind + 'ImageBox')?.closest('.image-field')?.querySelector('label');
    if (!label) return;
    label.className = (closing && !urlEl.value) ? 'req' : '';
  });
}
function photoIconsHTML(url, label, missing, missingIsWarning) {
  const camIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>`;
  if (!url) {
    return `<span class="btn icon sm" style="opacity:${missingIsWarning ? '1' : '.3'};color:${missingIsWarning ? 'var(--red)' : 'inherit'};cursor:default;" title="${missing}">${camIcon}</span>`;
  }
  return `<a class="photo-thumb-link" href="${esc(url)}" target="_blank" rel="noopener" title="View ${esc(label)}"><img src="${esc(url)}" class="photo-thumb-icon" alt=""></a>`;
}
function photosCellHTML(c) {
  const missingOnClosed = CLOSED_STATUSES.includes(c.status);
  const before = photoIconsHTML(c.beforeImageUrl, `${c.ticketNumber || callLogNo(c)}-invoice`,
    (missingOnClosed && !c.beforeImageUrl) ? 'Missing — Invoice photo is required to close this ticket' : 'No invoice photo', missingOnClosed && !c.beforeImageUrl);
  const after = photoIconsHTML(c.afterImageUrl, `${c.ticketNumber || callLogNo(c)}-after-service`,
    (missingOnClosed && !c.afterImageUrl) ? 'Missing — after-service photo is required to close this ticket' : 'No after-service photo yet', missingOnClosed && !c.afterImageUrl);
  return `<div class="rowbtns">${before}${after}</div>`;
}

function callFormFieldsHTML(c, previewLogNo) {
  c = c || {};
  const showMaterialCost = isAdmin() && (c.warranty === 'No' || !c.id);
  const bracket = c.bracketCharges ?? 0;
  const callChg = c.callCharges ?? 0;
  const financialBlock = `
  <div class="grid-3">
    <div class="field"><label>Bracket/Part charges (₹)</label><input type="number" min="0" step="1" id="f_bracketCharges" value="${bracket}" oninput="recalcTotalBill()"></div>
    <div class="field"><label>Call charges (₹)</label><input type="number" min="0" step="1" id="f_callCharges" value="${callChg}" oninput="recalcTotalBill()"></div>
    <div class="field"><label>Total Bill (₹)</label><input type="number" id="f_billAmount" value="${(Number(bracket) || 0) + (Number(callChg) || 0)}" disabled style="color:var(--text-dim);font-weight:700;"><small style="color:var(--text-dim);">Auto-calculated: Bracket/Part charges + Call charges</small></div>
  </div>
  <div class="grid-3" id="materialCostRow" style="${showMaterialCost ? '' : 'display:none;'}">
    <div class="field">
      <label>Material / cost used (₹)</label>
      <input type="number" min="0" step="1" id="f_materialCost" value="${c.materialCost ?? 0}">
      <small style="color:var(--text-dim);">Direct-customer tickets only — deducted from the bill amount for the Net Profit figure on the Dashboard. Admin only, not shown to Staff.</small>
    </div>
  </div>`;
  return `
  <div class="grid-3">
    <div class="field"><label>Log No.</label><input value="${esc(c.id ? callLogNo(c) : (previewLogNo || 'Assigned on save'))}" disabled style="color:var(--text-dim)"></div>
    <div class="field"><label class="req">Entry date</label><input type="date" id="f_date" value="${c.date || todayISO()}" required></div>
    <div class="field"><label class="req">Ticket number</label><input id="f_ticket" value="${esc(c.ticketNumber || '')}" placeholder="e.g. from brand portal" required></div>
  </div>
  <div class="grid-3">
    <div class="field"><label class="req">Customer name</label><input id="f_customerName" value="${esc(c.customerName || '')}" required></div>
    <div class="field"><label class="req">Mobile number</label><input id="f_mobile" value="${esc(c.mobile || '')}" required pattern="[0-9+ \\-]{7,15}"></div>
    <div class="field"><label class="req">Warranty</label><select id="f_warranty" required onchange="toggleMaterialCostField()">
      <option value="Yes" ${(c.id ? c.warranty === 'Yes' : c.warranty !== 'No') ? 'selected' : ''}>Yes</option>
      <option value="No" ${(c.id ? c.warranty === 'No' : false) ? 'selected' : ''}>No</option>
    </select></div>
  </div>
  <div class="field"><label class="req">Address</label><input id="f_address" value="${esc(c.address || '')}" required></div>
  <div class="grid-3">
    <div class="field"><label class="req">Product</label><select id="f_product" required>${'<option value="">— Select —</option>' + opts(DB.lists.products, c.product)}</select></div>
    <div class="field"><label class="req">Brand</label><select id="f_brand" required>${'<option value="">— Select —</option>' + opts(DB.lists.brands, c.brand)}</select></div>
    <div class="field"><label class="req">Model number</label><input id="f_model" value="${esc(c.model || '')}" required></div>
    <div class="field"><label class="req">Serial number</label><input id="f_serial" value="${esc(c.serial || '')}" required></div>
  </div>
  <div class="grid-3">
    <div class="field"><label class="req">Size (inch/L/etc.)</label><input id="f_size" value="${esc(c.size || '')}" required></div>
    <div class="field"><label>Date of purchase</label><input type="date" id="f_dop" value="${c.dateOfPurchase || ''}"></div>
    <div class="field"><label class="req">Status</label><select id="f_status" required onchange="toggleCompletedDateRequired();updateImageRequirementHints();">${opts(DB.lists.statuses, c.status || 'Pending')}</select></div>
  </div>
  <div class="field"><label class="req">Actual issue reported</label><input id="f_issue" value="${esc(c.actualIssue || '')}" required></div>
  <div class="field"><label class="req">Work done</label><textarea id="f_workDone" rows="2" required>${esc(c.workDone || '')}</textarea></div>
  <div class="grid-2">
    ${imageUploadFieldHTML('before', 'Invoice Photo', c.beforeImageUrl, false)}
    ${imageUploadFieldHTML('after', 'After Service Photo', c.afterImageUrl, false)}
  </div>
  <div class="grid-3">
    <div class="field"><label class="req">Technician</label><select id="f_technician" required>${'<option value="">— Select —</option>' + opts(DB.lists.employees, c.technician)}</select></div>
    <div class="field"><label class="req">Tech type</label><select id="f_techType" required>
      <option ${c.techType === 'Local Tech' ? 'selected' : ''}>Local Tech</option>
      <option ${c.techType === 'Upcountry Tech' ? 'selected' : ''}>Upcountry Tech</option>
    </select></div>
    <div class="field"><label id="f_completedDateLabel">Completed date</label><input type="date" id="f_completedDate" value="${c.completedDate || ''}"></div>
  </div>
  <div class="grid-2">
    <div class="field"><label class="req">Bracket used of</label><select id="f_bracket" required>${'<option value="">— Select —</option>' + opts(DB.lists.brackets, c.bracketUsed)}</select></div>
    <div class="field"><label class="req">Defective part returned?</label><select id="f_defReturned" required>
      <option ${c.defectivePartReturned === 'Yes' ? 'selected' : ''}>Yes</option>
      <option ${c.defectivePartReturned === 'No' ? 'selected' : ''}>No</option>
      <option ${(!c.defectivePartReturned || c.defectivePartReturned === 'NA') ? 'selected' : ''}>NA</option>
    </select></div>
  </div>
  <div class="field"><label class="req">Dependency / notes</label><input id="f_dependency" value="${esc(c.dependency || '')}" required></div>
  ${financialBlock}`;
}
function toggleCompletedDateRequired() {
  const status = document.getElementById('f_status')?.value;
  const input = document.getElementById('f_completedDate');
  const label = document.getElementById('f_completedDateLabel');
  if (!input || !label) return;
  const needed = status && status !== 'Pending';
  input.required = needed;
  label.className = needed ? 'req' : '';
}

async function openCallForm(id) {
  editingCallId = id || null;
  const record = id ? DB.calls.find(x => x.id === id) : null;
  document.getElementById('callModalTitle').textContent = record ? `Edit call — ${record.ticketNumber || record.customerName}` : 'New service call';

  let previewLogNo = null;
  if (!record) {
    try { previewLogNo = (await apiFetch('/calls/next-log-no')).logNo; } catch (e) { /* falls back to "Assigned on save" */ }
  }
  document.getElementById('callModalBody').innerHTML = callFormFieldsHTML(record, previewLogNo);
  document.getElementById('callModal').classList.add('open');
  toggleCompletedDateRequired(); // sets the correct initial required-state, not just on change
  updateImageRequirementHints();

  // Always open at the top, cursor ready on Entry Date — whether it's a
  // fresh call or editing one that was scrolled down before.
  const modalBody = document.getElementById('callModalBody');
  if (modalBody) modalBody.scrollTop = 0;
  const dateField = document.getElementById('f_date');
  if (dateField) dateField.focus();
}
function closeCallForm() { document.getElementById('callModal').classList.remove('open'); editingCallId = null; }
function toggleMaterialCostField() {
  const row = document.getElementById('materialCostRow');
  const warranty = document.getElementById('f_warranty')?.value;
  if (row) row.style.display = (warranty === 'No') ? '' : 'none';
}
function recalcTotalBill() {
  const bracket = Number(document.getElementById('f_bracketCharges')?.value) || 0;
  const callChg = Number(document.getElementById('f_callCharges')?.value) || 0;
  const billField = document.getElementById('f_billAmount');
  if (billField) billField.value = bracket + callChg;
}

async function saveCallForm(e) {
  e.preventDefault();
  const val = id => document.getElementById(id).value;
  const existing = editingCallId ? DB.calls.find(x => x.id === editingCallId) : null;
  const beforeImageUrl = val('f_beforeImageUrl');
  const afterImageUrl = val('f_afterImageUrl');
  const status = val('f_status');
  const bracketUsed = val('f_bracket');
  const warranty = val('f_warranty');
  // The Service Center Bracket auto-credit flow only applies to brand /
  // warranty tickets — a direct-customer (Warranty = No) job never gets
  // this treatment, even if Service Center Bracket happens to be selected.
  const isServiceCenterBracketCredit = bracketUsed === 'Service Center' && warranty === 'Yes';
  // A job can't finish before it was even logged — same rule the server
  // enforces, checked here too for an immediate message. Plain string
  // comparison is safe: both fields are always 'YYYY-MM-DD' from a
  // standard date input, which sorts chronologically as-is.
  const entryDate = val('f_date');
  const completedDateVal = val('f_completedDate');
  if (completedDateVal && entryDate && completedDateVal < entryDate) {
    toast('Completed date cannot be before the entry date');
    return;
  }
  // Invoice + after-service photos are optional at every status except when the
  // ticket is actually being closed — same rule the server enforces,
  // checked here too so the person gets an immediate, specific message
  // instead of a failed round trip. See business_rule_error() in
  // app/routes/calls.py for the backend side.
  if (CLOSED_STATUSES.includes(status)) {
    if (!beforeImageUrl) {
      toast('Invoice photo is required before marking this ticket "' + status + '"');
      return;
    }
    if (!afterImageUrl) {
      toast('after-service photo is required before marking this ticket "' + status + '"');
      return;
    }
  }
  // Service Center Bracket, on closing: confirm, then hand off to a
  // Consumption/Sales credit entry for the parts used. See
  // shouldOfferBracketCredit below and openBracketCreditInventoryEntry().
  if (CLOSED_STATUSES.includes(status) && isServiceCenterBracketCredit) {
    const proceed = await askBracketCreditConfirm(
      'You have selected Service Center with Warranty = Yes. This part needs to be credited back to the technician\'s stock. ' +
      'Do you want to save this ticket now and open a return entry for it?'
    );
    if (!proceed) return;
  }
  const rec = {
    date: val('f_date'), ticketNumber: val('f_ticket'), warranty: val('f_warranty'),
    customerName: val('f_customerName'), mobile: val('f_mobile'), address: val('f_address'),
    product: val('f_product'), brand: val('f_brand'), model: val('f_model'), serial: val('f_serial'), size: val('f_size'),
    dateOfPurchase: val('f_dop'), status: status, actualIssue: val('f_issue'),
    workDone: val('f_workDone'), technician: val('f_technician'), techType: val('f_techType'),
    completedDate: val('f_completedDate'), beforeImageUrl, afterImageUrl,
    bracketUsed, defectivePartReturned: val('f_defReturned'), dependency: val('f_dependency')
  };
  const shouldOfferBracketCredit = CLOSED_STATUSES.includes(status) && isServiceCenterBracketCredit;
  const hasFinancialFields = document.getElementById('f_billAmount');
  if (hasFinancialFields) {
    rec.bracketCharges = Number(val('f_bracketCharges')) || 0;
    rec.callCharges = Number(val('f_callCharges')) || 0;
    rec.billAmount = Number(val('f_billAmount')) || 0;
    const materialCostEl = document.getElementById('f_materialCost');
    rec.materialCost = (materialCostEl && rec.warranty === 'No') ? (Number(materialCostEl.value) || 0) : null;
  } else {
    rec.bracketCharges = existing ? existing.bracketCharges : 0;
    rec.callCharges = existing ? existing.callCharges : 0;
    rec.billAmount = existing ? existing.billAmount : 0;
    rec.materialCost = existing ? existing.materialCost : null;
  }
  try {
    let ticketId = editingCallId;
    if (editingCallId) {
      await apiFetch('/calls/' + editingCallId, { method: 'PUT', body: rec });
    } else {
      const created = await apiFetch('/calls', { method: 'POST', body: rec });
      ticketId = created.id;
    }
    closeCallForm();
    if (shouldOfferBracketCredit) {
      await openBracketCreditInventoryEntry(ticketId, rec.technician);
    } else {
      toast('Service call saved');
      await renderAsync();
    }
  } catch (err) {
    toast(err.message);
  }
}

// ---- Settlement tracking: Admin-only, only meaningful once a ticket is
// Approved. Kept as its own small modal + dedicated endpoint, entirely
// separate from the normal ticket edit form, so it can never interfere
// with the regular Call Data save flow. ----
function settlementCellHTML(c) {
  if (c.approvalStatus !== 'Approved') return '<span style="color:var(--text-dim);font-size:11px;">—</span>';
  const badge = c.settlementStatus === 'Settled'
    ? '<span class="badge green">Settled</span>'
    : c.settlementStatus === 'Rejected'
      ? '<span class="badge red">Rejected</span>'
      : '<span class="badge amber">Unsettled</span>';
  const editBtn = isAdmin()
    ? `<button class="btn icon sm" onclick="openSettlementForm('${c.id}')" title="Update settlement">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
       </button>`
    : '';
  return `<div class="rowbtns">${badge}${editBtn}</div>`;
}
function receiptVoucherOptions(selected) {
  const receipts = DB.cashbook
    .filter(v => v.tranType === 'Receipt' && v.approvalStatus === 'Approved')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return receipts.map(v =>
    `<option value="${esc(v.voucherNo)}" data-date="${esc(v.date || '')}" data-amount="${v.amount || 0}" ${selected === v.voucherNo ? 'selected' : ''}>${esc(v.voucherNo)} — ${fmtDate(v.date)} — ${money(v.amount)}</option>`
  ).join('');
}
function openSettlementForm(callId) {
  const c = DB.calls.find(x => x.id === callId);
  if (!c) return;
  document.getElementById('st_callId').value = callId;
  document.getElementById('st_ticketLabel').textContent = c.ticketNumber || callLogNo(c);
  document.getElementById('st_status').value = c.settlementStatus || 'Unsettled';
  document.getElementById('st_voucherNo').innerHTML =
    '<option value="">— Select a Receipt voucher —</option>' + receiptVoucherOptions(c.settlementVoucherNo);
  document.getElementById('st_voucherDate').value = c.settlementVoucherDate || '';
  document.getElementById('st_comment').value = c.settlementComment || '';
  updateSettlementCommentCount();
  onSettlementStatusChange();
  onSettlementVoucherChange();
  document.getElementById('settlementModal').classList.add('open');
}
function closeSettlementForm() {
  document.getElementById('settlementModal').classList.remove('open');
}
function onSettlementStatusChange() {
  const status = document.getElementById('st_status').value;
  document.getElementById('st_settledFields').style.display = status === 'Settled' ? '' : 'none';
  const commentLabel = document.getElementById('st_commentLabel');
  commentLabel.className = status === 'Rejected' ? 'req' : '';
  document.getElementById('st_comment').closest('.field').style.display = status === 'Unsettled' ? 'none' : '';
}
function onSettlementVoucherChange() {
  const sel = document.getElementById('st_voucherNo');
  const opt = sel.options[sel.selectedIndex];
  const hint = document.getElementById('st_voucherHint');
  if (opt && opt.value) {
    hint.textContent = `This voucher was recorded on ${fmtDate(opt.dataset.date)} for ${money(Number(opt.dataset.amount))}.`;
    if (!document.getElementById('st_voucherDate').value) document.getElementById('st_voucherDate').value = opt.dataset.date;
  } else {
    hint.textContent = '';
  }
}
function updateSettlementCommentCount() {
  document.getElementById('st_commentCount').textContent = document.getElementById('st_comment').value.length;
}
async function saveSettlementForm(e) {
  e.preventDefault();
  const callId = document.getElementById('st_callId').value;
  const status = document.getElementById('st_status').value;
  const body = {
    settlementStatus: status,
    voucherNo: status === 'Settled' ? document.getElementById('st_voucherNo').value : '',
    voucherDate: status === 'Settled' ? document.getElementById('st_voucherDate').value : '',
    comment: status === 'Unsettled' ? '' : document.getElementById('st_comment').value,
  };
  if (status === 'Settled' && (!body.voucherNo || !body.voucherDate)) {
    toast('Pick a voucher — its date fills in automatically'); return;
  }
  try {
    await apiFetch('/calls/' + callId + '/settlement', { method: 'PUT', body });
    closeSettlementForm();
    toast('Settlement updated');
    await renderAsync();
  } catch (err) {
    toast(err.message);
  }
}
