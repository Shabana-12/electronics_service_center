/* Purchase ledger UI and purchase entry forms. */

/* =========================================================================
   PURCHASES (Client / Purchase ledger)
   ========================================================================= */
function purchaseFilters() {
  const from = document.getElementById('purFrom')?.value || '';
  const to = document.getElementById('purTo')?.value || '';
  const supplier = document.getElementById('purSupplierFilter')?.value || '';
  return DB.purchases.filter(p => {
    if (from && p.date < from) return false;
    if (to && p.date > to) return false;
    if (supplier && p.supplierBrand !== supplier) return false;
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.srNo - a.srNo);
}
function renderPurchases() {
  const supSel = document.getElementById('purSupplierFilter');
  if (supSel && !supSel.dataset.filled) {
    supSel.innerHTML = '<option value="">All suppliers</option>' + opts(DB.lists.brands);
    supSel.dataset.filled = '1';
  }
  const allRows = purchaseFilters();
  const { pageRows: rows, totalPages, start } = paginateRows(allRows, 'purchases');
  const tbody = document.getElementById('purchasesTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="12">No purchase entries in this range yet.</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(p => `
      <tr>
        <td class="mono">${esc(purchLogNo(p))}</td>
        <td>${fmtDate(p.date)}</td>
        <td>${esc(p.supplierBrand)}</td>
        <td class="mono">${esc(p.invoiceNo || '—')}</td>
        <td>${esc(p.material)}${p.size ? ' <span style="color:var(--text-dim)">(' + esc(p.size) + ')</span>' : ''}</td>
        <td class="num">${p.qty}</td>
        <td class="num">${money(p.rate)}</td>
        <td class="num">${p.salesPrice ? money(p.salesPrice) : '—'}</td>
        <td class="num" style="color:${p.type === 'Purchase' ? 'var(--accent)' : 'var(--red)'}">${p.type === 'Purchase' ? money(p.debit) : '—'}</td>
        <td class="num" style="color:${p.type === 'Return' ? 'var(--red)' : 'inherit'}">${p.type === 'Return' ? money(p.credit) : '—'}</td>
        <td>${approvalBadgeHTML(p.approvalStatus)} ${approveActionHTML('purchases', p.id, p.approvalStatus)}</td>
        <td class="center">
          <div class="rowbtns">
            ${isLockedForCurrentUser(p.approvalStatus) ? '' : `
            <button class="btn icon" onclick="openPurchaseForm('${p.id}')" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>`}
            <button class="btn icon danger admin-only" onclick="deleteRecord('purchases','${p.id}')" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6"/></svg>
            </button>
          </div>
        </td>
      </tr>`).join('');
  }
  document.getElementById('purchasesCount').textContent = allRows.length + ' of ' + DB.purchases.length;
  renderPaginationBar('purchasesPagination', 'purchases', allRows.length, totalPages, start);
  // Summary totals are computed from ALL filtered rows, not just the visible
  // page — otherwise "Purchases/Returns/Net" would silently only reflect
  // whatever happens to be on the current page, which would be wrong.
  const totD = allRows.filter(r => r.type === 'Purchase').reduce((s, r) => s + r.debit, 0);
  const totC = allRows.filter(r => r.type === 'Return').reduce((s, r) => s + r.credit, 0);
  document.getElementById('purchasesSummary').textContent = `Purchases ${money(totD)} · Returns ${money(totC)} · Net ${money(totD - totC)}`;
}
let purchaseLines = [];
function newLineId() { return 'ln_' + Math.random().toString(36).slice(2, 9); }

function purchaseFormFieldsHTML(p) {
  if (p && p.id) return purchaseSingleLineFieldsHTML(p);
  return purchaseMultiLineFieldsHTML();
}
function purchaseSingleLineFieldsHTML(p) {
  return `
  <div class="grid-3">
    <div class="field"><label>Log No.</label><input value="${esc(purchLogNo(p))}" disabled style="color:var(--text-dim)"></div>
    <div class="field"><label class="req">Entry date</label><input type="date" id="pf_date" value="${p.date || todayISO()}" required></div>
    <div class="field"><label class="req">Supplier / Brand</label><select id="pf_supplier" required>${(p.supplierBrand ? '' : '<option value="">— Select —</option>') + opts(DB.lists.brands, p.supplierBrand)}</select></div>
  </div>
  <div class="grid-3">
    <div class="field"><label class="req">Invoice / Debit / CN note no.</label><input id="pf_invoice" value="${esc(p.invoiceNo || '')}" required></div>
    <div class="field"><label class="req">Material / goods</label><select id="pf_material" required onchange="fillExistingSalesPrice()">${(p.material ? '' : '<option value="">— Select —</option>') + opts(DB.lists.parts, p.material)}</select></div>
    <div class="field"><label class="req">Part code</label><input id="pf_partCode" value="${esc(p.partCode || '')}" required></div>
  </div>
  <div class="grid-3">
    <div class="field"><label class="req">Serial number</label><input id="pf_serial" value="${esc(p.serial || '')}" required></div>
    <div class="field"><label class="req">Size</label><input id="pf_size" value="${esc(p.size || '')}" required></div>
    <div class="field"><label class="req">Entry type</label><select id="pf_type" required>
      <option value="Purchase" ${(!p.type || p.type === 'Purchase') ? 'selected' : ''}>Purchase (stock in)</option>
      <option value="Return" ${p.type === 'Return' ? 'selected' : ''}>Return to supplier (stock out)</option>
    </select></div>
  </div>
  <div class="grid-3">
    <div class="field"><label class="req">Quantity</label><input type="number" min="0" step="1" id="pf_qty" value="${p.qty ?? 1}" required></div>
    <div class="field"><label class="req">Rate per qty (₹)</label><input type="number" min="0" step="0.01" id="pf_rate" value="${p.rate ?? 0}" required></div>
    <div class="field"><label class="req">Sales price per unit (₹)</label><input type="number" min="0" step="0.01" id="pf_salesPrice" value="${p.salesPrice ?? (DB.priceList[p.material] ?? 0)}" required></div>
  </div>
  <div class="hint" style="margin-top:-8px;margin-bottom:14px;">Sets the price this material sells for — it will auto-fill the rate when this part is later issued/sold in the Inventory ledger.</div>
  <div class="field"><label class="req">Comments</label><input id="pf_comments" value="${esc(p.comments || '')}" required></div>
  `;
}
function fillExistingSalesPrice() {
  const mat = document.getElementById('pf_material')?.value;
  const input = document.getElementById('pf_salesPrice');
  if (mat && input && !editingPurchaseId) input.value = DB.priceList[mat] ?? input.value;
}
function purchaseMultiLineFieldsHTML() {
  if (!purchaseLines.length) purchaseLines = [{ id: newLineId(), material: '', partCode: '', serial: '', size: '', qty: 1, rate: 0, salesPrice: 0 }];
  return `
  <div class="grid-3">
    <div class="field"><label>Log No.</label><input value="Auto-generated when saved" disabled style="color:var(--text-dim)"></div>
    <div class="field"><label class="req">Entry date</label><input type="date" id="pf_date" value="${todayISO()}" required></div>
    <div class="field"><label class="req">Supplier / Brand</label><select id="pf_supplier" required>${'<option value="">— Select —</option>' + opts(DB.lists.brands, '')}</select></div>
  </div>
  <div class="grid-2">
    <div class="field"><label class="req">Invoice / Debit / CN note no.</label><input id="pf_invoice" placeholder="One invoice can cover every part below" required></div>
    <div class="field"><label class="req">Entry type</label><select id="pf_type" required>
      <option value="Purchase" selected>Purchase (stock in)</option>
      <option value="Return">Return to supplier (stock out)</option>
    </select></div>
  </div>
  <div style="margin-top:14px;">
    <label class="req" style="display:block;margin-bottom:6px;">Parts on this bill</label>
    ${purchaseLinesTableHTML()}
    <button type="button" class="btn sm" onclick="addPurchaseLine()">+ Add another part</button>
  </div>
  <div class="field" style="margin-top:14px;"><label class="req">Comments</label><input id="pf_comments" required></div>
  `;
}
function purchaseLinesTableHTML() {
  const total = purchaseLines.reduce((s, l) => s + (l.qty || 0) * (l.rate || 0), 0);
  return `
  <table class="lineitem-table">
    <thead><tr><th>Material / goods</th><th>Part code</th><th>Serial no.</th><th>Size</th><th class="num">Qty</th><th class="num">Rate (₹)</th><th class="num">Sales price (₹)</th><th class="num">Amount</th><th></th></tr></thead>
    <tbody id="purchaseLinesBody">${purchaseLinesRowsHTML()}</tbody>
    <tfoot><tr><td colspan="7" style="text-align:right;font-weight:600;">Bill total</td><td class="num" id="purchaseLinesTotal" style="font-weight:700;">${money(total)}</td><td></td></tr></tfoot>
  </table>
  <div class="hint">Sales price sets what this material sells for — it auto-fills the rate when issued/sold later in the Inventory ledger.</div>`;
}
function purchaseLinesRowsHTML() {
  return purchaseLines.map(l => `
    <tr data-line="${l.id}">
      <td><select id="pln_material_${l.id}" required onchange="onPurchaseLineMaterialChange('${l.id}')">${(l.material ? '' : '<option value="">— Select —</option>') + opts(DB.lists.parts, l.material)}</select></td>
      <td><input id="pln_partCode_${l.id}" value="${esc(l.partCode)}" required></td>
      <td><input id="pln_serial_${l.id}" value="${esc(l.serial)}" required></td>
      <td><input id="pln_size_${l.id}" value="${esc(l.size)}" required></td>
      <td><input type="number" min="1" step="1" id="pln_qty_${l.id}" value="${l.qty}" oninput="updatePurchaseLineAmount('${l.id}')" required></td>
      <td><input type="number" min="0" step="0.01" id="pln_rate_${l.id}" value="${l.rate}" oninput="updatePurchaseLineAmount('${l.id}')" required></td>
      <td><input type="number" min="0" step="0.01" id="pln_salesPrice_${l.id}" value="${l.salesPrice ?? (DB.priceList[l.material] ?? 0)}" required></td>
      <td class="num lineitem-amount" id="pln_amt_${l.id}">${money((l.qty || 0) * (l.rate || 0))}</td>
      <td>${purchaseLines.length > 1 ? `<button type="button" class="lineitem-remove" onclick="removePurchaseLine('${l.id}')" title="Remove">✕</button>` : ''}</td>
    </tr>`).join('');
}
function onPurchaseLineMaterialChange(id) {
  const matSel = document.getElementById('pln_material_' + id);
  const spInput = document.getElementById('pln_salesPrice_' + id);
  if (matSel && spInput) spInput.value = DB.priceList[matSel.value] ?? 0;
}
function syncPurchaseLinesFromDOM() {
  purchaseLines = purchaseLines.map(l => ({
    id: l.id,
    material: document.getElementById('pln_material_' + l.id)?.value ?? l.material,
    partCode: document.getElementById('pln_partCode_' + l.id)?.value ?? l.partCode,
    serial: document.getElementById('pln_serial_' + l.id)?.value ?? l.serial,
    size: document.getElementById('pln_size_' + l.id)?.value ?? l.size,
    qty: Number(document.getElementById('pln_qty_' + l.id)?.value) || 0,
    rate: Number(document.getElementById('pln_rate_' + l.id)?.value) || 0,
    salesPrice: Number(document.getElementById('pln_salesPrice_' + l.id)?.value) || 0,
  }));
  return purchaseLines;
}
function addPurchaseLine() {
  syncPurchaseLinesFromDOM();
  purchaseLines.push({ id: newLineId(), material: '', partCode: '', serial: '', size: '', qty: 1, rate: 0, salesPrice: 0 });
  document.getElementById('purchaseLinesBody').innerHTML = purchaseLinesRowsHTML();
  updatePurchaseLinesTotal();
}
function removePurchaseLine(id) {
  syncPurchaseLinesFromDOM();
  purchaseLines = purchaseLines.filter(l => l.id !== id);
  if (!purchaseLines.length) purchaseLines.push({ id: newLineId(), material: '', partCode: '', serial: '', size: '', qty: 1, rate: 0, salesPrice: 0 });
  document.getElementById('purchaseLinesBody').innerHTML = purchaseLinesRowsHTML();
  updatePurchaseLinesTotal();
}
function updatePurchaseLineAmount(id) {
  const qty = Number(document.getElementById('pln_qty_' + id).value) || 0;
  const rate = Number(document.getElementById('pln_rate_' + id).value) || 0;
  document.getElementById('pln_amt_' + id).textContent = money(qty * rate);
  updatePurchaseLinesTotal();
}
function updatePurchaseLinesTotal() {
  let total = 0;
  purchaseLines.forEach(l => {
    const qty = Number(document.getElementById('pln_qty_' + l.id)?.value) || 0;
    const rate = Number(document.getElementById('pln_rate_' + l.id)?.value) || 0;
    total += qty * rate;
  });
  const el = document.getElementById('purchaseLinesTotal');
  if (el) el.textContent = money(total);
}
function openPurchaseForm(id) {
  editingPurchaseId = id || null;
  const record = id ? DB.purchases.find(x => x.id === id) : null;
  if (!record) purchaseLines = [{ id: newLineId(), material: '', partCode: '', serial: '', size: '', qty: 1, rate: 0, salesPrice: 0 }];
  document.getElementById('purchaseModalTitle').textContent = record ? 'Edit purchase entry' : 'New purchase entry';
  document.getElementById('purchaseModalBody').innerHTML = purchaseFormFieldsHTML(record);
  document.getElementById('purchaseModal').classList.add('open');
}
function closePurchaseForm() { document.getElementById('purchaseModal').classList.remove('open'); editingPurchaseId = null; }
async function savePurchaseForm(e) {
  e.preventDefault();
  const val = id => document.getElementById(id).value;

  if (editingPurchaseId) {
    const qty = Number(val('pf_qty')) || 0;
    const rate = Number(val('pf_rate')) || 0;
    const type = val('pf_type');
    const material = val('pf_material');
    const salesPrice = Number(val('pf_salesPrice')) || 0;
    const rec = {
      date: val('pf_date'), supplierBrand: val('pf_supplier'), invoiceNo: val('pf_invoice'),
      material, partCode: val('pf_partCode'), serial: val('pf_serial'), size: val('pf_size'),
      qty, rate, type, salesPrice, comments: val('pf_comments'),
    };
    try {
      await apiFetch('/purchases/' + editingPurchaseId, { method: 'PUT', body: rec });
      if (salesPrice > 0) DB.priceList[material] = salesPrice;
      closePurchaseForm();
      toast('Purchase entry updated');
      await renderAsync();
    } catch (err) {
      toast(err.message);
    }
    return;
  }

  syncPurchaseLinesFromDOM();
  const date = val('pf_date'), supplierBrand = val('pf_supplier'), invoiceNo = val('pf_invoice'), type = val('pf_type'), comments = val('pf_comments');
  const validLines = purchaseLines.filter(l => l.material && l.qty > 0);
  if (!validLines.length) { toast('Add at least one part with a quantity'); return; }
  try {
    for (const l of validLines) {
      if (l.salesPrice > 0) DB.priceList[l.material] = l.salesPrice;
      await apiFetch('/purchases', {
        method: 'POST',
        body: {
          date, supplierBrand, invoiceNo, type, comments,
          material: l.material, partCode: l.partCode, serial: l.serial, size: l.size,
          qty: l.qty, rate: l.rate, salesPrice: l.salesPrice || 0,
        },
      });
    }
    purchaseLines = [];
    closePurchaseForm();
    toast(`${validLines.length} part${validLines.length > 1 ? 's' : ''} added to the purchase ledger`);
    await renderAsync();
  } catch (err) {
    toast(err.message);
  }
}
