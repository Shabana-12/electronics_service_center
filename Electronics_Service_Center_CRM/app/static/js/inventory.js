/* Inventory / consumption ledger UI and stock-aware entry forms. */

/* =========================================================================
   INVENTORY (Consumption / Sales ledger)
   ========================================================================= */
function inventoryFilters() {
  const from = document.getElementById('invFrom')?.value || '';
  const to = document.getElementById('invTo')?.value || '';
  const who = document.getElementById('invWhoFilter')?.value || '';
  return DB.inventory.filter(v => {
    if (from && v.date < from) return false;
    if (to && v.date > to) return false;
    if (who && v.issuedTo !== who) return false;
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.srNo - a.srNo);
}
function renderInventory() {
  const whoSel = document.getElementById('invWhoFilter');
  if (whoSel && !whoSel.dataset.filled) {
    whoSel.innerHTML = '<option value="">Everyone</option>' + opts(DB.lists.employees);
    whoSel.dataset.filled = '1';
  }
  const allRows = inventoryFilters();
  const { pageRows: rows, totalPages, start } = paginateRows(allRows, 'inventory');
  const tbody = document.getElementById('inventoryTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10">No consumption / sales entries in this range yet.</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(v => {
      const specBits = [v.partCode, v.serial, v.size].filter(Boolean);
      return `
      <tr>
        <td class="mono">${esc(invLogNo(v))}</td>
        <td>${fmtDate(v.date)}</td>
        <td>${esc(v.issuedTo)}${v.linkedTicket ? `<br><span class="badge blue" style="margin-top:3px;">${esc(v.linkedTicket)}</span>` : ''}</td>
        <td><b>${esc(v.material)}</b>${specBits.length ? `<br><span style="color:var(--text-dim);font-size:11px">${esc(specBits.join(' · '))}</span>` : ''}</td>
        <td class="num">${v.qty}</td>
        <td class="num">${money(v.rate)}</td>
        <td><span class="badge ${v.type === 'Debit' ? 'amber' : 'green'}">${v.type === 'Debit' ? 'Issued' : 'Returned'}</span></td>
        <td class="num">${money(v.amount)}${v.discount ? `<br><span style="color:var(--red);font-size:11px">−${money(v.discount)}/unit (${money(v.discount * v.qty)} total)</span>` : ''}</td>
        <td>${approvalBadgeHTML(v.approvalStatus)} ${approveActionHTML('inventory', v.id, v.approvalStatus)}</td>
        <td class="center">
          <div class="rowbtns">
            <button class="btn icon" onclick="openInventoryBill('${v.id}')" title="Generate bill">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
            </button>
            ${isLockedForCurrentUser(v.approvalStatus) ? '' : `
            <button class="btn icon" onclick="openInventoryForm('${v.id}')" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>`}
            <button class="btn icon danger admin-only" onclick="deleteRecord('inventory','${v.id}')" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }
  document.getElementById('inventoryCount').textContent = allRows.length + ' of ' + DB.inventory.length;
  renderPaginationBar('inventoryPagination', 'inventory', allRows.length, totalPages, start);
  const issued = allRows.filter(r => r.type === 'Debit').reduce((s, r) => s + r.amount, 0);
  const returned = allRows.filter(r => r.type === 'Credit').reduce((s, r) => s + r.amount, 0);
  document.getElementById('inventorySummary').textContent = `Issued ${money(issued)} · Returned ${money(returned)} · Net ${money(issued - returned)}`;
}
function materialOptionsForType(type, current, excludeId, technician) {
  let list = DB.lists.parts;
  if (type === 'Credit') { // Returned — only materials this specific technician is actually holding
    const map = technicianOutstandingMaterialsMap(technician, excludeId);
    list = DB.lists.parts.filter(m => (map[m] || 0) > 0 || m === current);
  } else { // Debit / Issued — only materials that actually have stock on hand
    list = DB.lists.parts.filter(m => availableStock(m, excludeId) > 0 || m === current);
  }
  if (!list.length) return type === 'Credit' ? '<option value="">— technician holds nothing to return —</option>' : '<option value="">— none in stock —</option>';
  return (current ? '' : '<option value="">— Select —</option>') + opts(list, current);
}
function effectiveMaterial(type, current, excludeId, technician) {
  let list = DB.lists.parts;
  if (type === 'Credit') {
    const map = technicianOutstandingMaterialsMap(technician, excludeId);
    list = DB.lists.parts.filter(m => (map[m] || 0) > 0 || m === current);
  } else {
    list = DB.lists.parts.filter(m => availableStock(m, excludeId) > 0 || m === current);
  }
  if (current && list.includes(current)) return current;
  return list[0] || '';
}
function inventoryStockNoteHTML(material, type, excludeId, technician) {
  if (!material) {
    if (type !== 'Credit') return `<span style="color:var(--red)">⚠ Nothing available to issue right now — every tracked material is out of stock. Log a purchase entry first.</span>`;
    return `<span style="color:var(--text-dim)">${technician ? 'This technician has nothing on record to return.' : 'Pick a technician, then a material, to see what can be returned.'}</span>`;
  }
  if (type === 'Credit') {
    const map = technicianOutstandingMaterialsMap(technician, excludeId);
    const avail = map[material] || 0;
    if (avail <= 0) return `<span style="color:var(--red)">⚠ ${technician ? esc(technician) : 'This technician'} isn't holding any "${esc(material)}" to return.</span>`;
    return `<span style="color:var(--accent)">${esc(technician)} is holding ${avail} unit${avail === 1 ? '' : 's'} — eligible to return.</span>`;
  }
  const avail = availableStock(material, excludeId);
  if (avail <= 0) return `<span style="color:var(--red)">⚠ Not available — 0 units of "${esc(material)}" in stock. Purchase more before issuing.</span>`;
  return `<span style="color:${avail <= 2 ? 'var(--amber)' : 'var(--accent)'}">Available: ${avail} unit${avail === 1 ? '' : 's'} in stock overall.</span>`;
}
function inventoryFormFieldsHTML(v) {
  if (v && v.id) return inventorySingleLineFieldsHTML(v);
  return inventoryMultiLineFieldsHTML();
}
function openTicketOptions(selected, technician, forceIncludeId) {
  const openCalls = DB.calls
    .filter(c => c.status === 'Pending' || c.id === forceIncludeId)
    .filter(c => !technician || c.technician === technician)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  let html = '<option value="">— none / not linked —</option>';
  openCalls.forEach(c => {
    const key = c.ticketNumber || c.id;
    const label = `${c.ticketNumber || c.id} — ${c.customerName}${c.status ? ' (' + c.status + ')' : ''}`;
    html += `<option value="${esc(key)}" ${selected === key ? 'selected' : ''}>${esc(label)}</option>`;
  });
  return html;
}
function inventorySingleLineFieldsHTML(v) {
  v = v || {};
  const excludeId = editingInventoryId || null;
  const type = v.type || 'Debit';
  const tech = v.issuedTo || '';
  const logNoDisplay = invLogNo(v);
  return `
  <div class="grid-3">
    <div class="field"><label>Log No.</label><input value="${esc(logNoDisplay)}" disabled style="font-family:var(--mono,monospace);color:var(--text-dim)"></div>
    <div class="field"><label class="req">Entry date</label><input type="date" id="if_date" value="${v.date || todayISO()}" required></div>
    <div class="field"><label class="req">Debited to / Sold to</label><select id="if_issuedTo" required onchange="onInventoryTechChange()">${opts(DB.lists.employees, v.issuedTo)}</select></div>
  </div>
  <div class="grid-2">
    <div class="field"><label>Invoice / Debit / CN note no.</label><input id="if_invoice" value="${esc(v.invoiceNo || '')}"></div>
    <div class="field"><label class="req">Entry type</label><select id="if_type" required onchange="onInventoryTypeChange()">
      <option value="Debit" ${type === 'Debit' ? 'selected' : ''}>Issued (Debit — stock out)</option>
      <option value="Credit" ${type === 'Credit' ? 'selected' : ''}>Returned (Credit — stock in)</option>
    </select></div>
  </div>
  <div class="field"><label>Linked service call</label><select id="if_linkedTicket">${openTicketOptions(v.linkedTicket || '', tech)}</select>
    <div class="hint">Shows only Pending tickets assigned to the selected technician.</div>
  </div>
  <div class="field">
    <label class="req">Material / goods</label>
    <select id="if_material" required onchange="onInventoryMaterialChange()">${materialOptionsForType(type, v.material, excludeId, tech)}</select>
    <div id="if_stockNote" style="font-size:11.5px;margin-top:4px;">${inventoryStockNoteHTML(effectiveMaterial(type, v.material, excludeId, tech), type, excludeId, tech)}</div>
  </div>
  <div class="section-note" style="font-size:11.5px;color:var(--text-dim);margin:10px 0 4px;">Only specifications actually on record for this material are selectable below — everything else is filtered out.</div>
  <div class="grid-2">
    <div class="field"><label>Client / Brand name</label><select id="if_clientBrand" onchange="onInventorySpecChange()"><option value="">— (unspecified)</option></select></div>
    <div class="field"><label>Part code</label><select id="if_partCode" onchange="onInventorySpecChange()"><option value="">— (unspecified)</option></select></div>
  </div>
  <div class="grid-3">
    <div class="field"><label>Serial number</label><select id="if_serial" onchange="onInventorySpecChange()"><option value="">— (unspecified)</option></select></div>
    <div class="field"><label>Size</label><select id="if_size" onchange="onInventorySpecChange()"><option value="">— (unspecified)</option></select></div>
    <div class="field">
      <label class="req">Quantity</label>
      <input type="number" min="1" step="1" id="if_qty" value="${v.qty ?? 1}" required oninput="onInventoryQtyChange()">
      <div id="if_specNote" style="font-size:11.5px;margin-top:4px;"></div>
    </div>
  </div>
  <div class="grid-3">
    <div class="field"><label class="req">Rate per qty (₹)</label><input type="number" min="0" step="0.01" id="if_rate" value="${v.rate ?? 0}" required></div>
    <div class="field"><label>Discount per unit (₹)</label><input type="number" min="0" step="0.01" id="if_discount" value="${v.discount ?? 0}"></div>
    <div class="field"><label>Comments</label><input id="if_comments" value="${esc(v.comments || '')}"></div>
  </div>`;
}

/* ---- Multi-line create mode: one bill, many parts ---- */
let inventoryLines = [];
function inventoryMultiLineFieldsHTML() {
  if (!inventoryLines.length) inventoryLines = [{ id: newLineId(), material: '', clientBrand: '', partCode: '', serial: '', size: '', qty: 1, rate: 0, discount: 0 }];
  // Staff are technicians themselves — default "Debited to" to their own
  // name so their own assigned tickets show up in Linked Service Call
  // immediately, without an extra manual selection.
  const defaultTech = (!isAdmin() && DB.lists.employees.includes(currentUser.name)) ? currentUser.name : '';
  return `
  <div class="grid-3">
    <div class="field"><label>Log No.</label><input value="Auto-generated when saved" disabled style="color:var(--text-dim)"></div>
    <div class="field"><label class="req">Entry date</label><input type="date" id="ihdr_date" value="${todayISO()}" required></div>
    <div class="field"><label class="req">Debited to / Sold to</label><select id="ihdr_issuedTo" required onchange="onInventoryHeaderTechChange()">${defaultTech ? opts(DB.lists.employees, defaultTech) : '<option value="">— Select —</option>' + opts(DB.lists.employees, '')}</select></div>
  </div>
  <div class="grid-2">
    <div class="field"><label>Invoice / Debit / CN note no.</label><input id="ihdr_invoice" placeholder="One invoice can cover every part below"></div>
    <div class="field"><label class="req">Entry type</label><select id="ihdr_type" required onchange="onInventoryHeaderTypeChange()">
      <option value="Debit" selected>Issued (Debit — stock out)</option>
      <option value="Credit">Returned (Credit — stock in)</option>
    </select></div>
  </div>
  <div class="field"><label>Linked service call</label><select id="ihdr_linkedTicket">${openTicketOptions('', defaultTech)}</select>
    <div class="hint">Applies to every part on this bill. Shows only Pending tickets assigned to the selected technician.</div>
  </div>
  <div class="section-note" style="font-size:11.5px;color:var(--text-dim);margin:10px 0 4px;" id="inventoryLinesHint">Each part's Brand / Part code / Serial / Size only offers what's actually still in stock — add as many parts as this bill covers.</div>
  <div style="margin-top:6px;">
    <label class="req" style="display:block;margin-bottom:6px;">Parts on this bill</label>
    ${inventoryLinesTableHTML()}
    <button type="button" class="btn sm" onclick="addInventoryLine()">+ Add another part</button>
  </div>
  <div class="field" style="margin-top:14px;"><label>Comments</label><input id="ihdr_comments"></div>
  `;
}
function inventoryLinesTableHTML() {
  const total = inventoryLines.reduce((s, l) => s + Math.max(0, (l.qty || 0) * Math.max(0, (l.rate || 0) - (l.discount || 0))), 0);
  return `
  <table class="lineitem-table">
    <thead><tr><th>Material / goods</th><th>Brand</th><th>Part code</th><th>Serial</th><th>Size</th><th class="num">Qty</th><th class="num">Rate (₹)</th><th class="num">Discount /unit (₹)</th><th class="num">Amount</th><th></th></tr></thead>
    <tbody id="inventoryLinesBody">${inventoryLinesRowsHTML()}</tbody>
    <tfoot><tr><td colspan="8" style="text-align:right;font-weight:600;">Bill total</td><td class="num" id="inventoryLinesTotal" style="font-weight:700;">${money(total)}</td><td></td></tr></tfoot>
  </table>`;
}
function inventoryLinesRowsHTML() {
  const type = document.getElementById('ihdr_type') ? document.getElementById('ihdr_type').value : 'Debit';
  const tech = document.getElementById('ihdr_issuedTo') ? document.getElementById('ihdr_issuedTo').value : '';
  return inventoryLines.map(l => `
    <tr data-line="${l.id}">
      <td><select id="iln_material_${l.id}" required onchange="onLineMaterialChange('${l.id}')">${materialOptionsForType(type, l.material, null, tech)}</select></td>
      <td><select id="iln_clientBrand_${l.id}" onchange="onLineSpecChange('${l.id}')"><option value="">— (unspecified)</option></select></td>
      <td><select id="iln_partCode_${l.id}" onchange="onLineSpecChange('${l.id}')"><option value="">— (unspecified)</option></select></td>
      <td><select id="iln_serial_${l.id}" onchange="onLineSpecChange('${l.id}')"><option value="">— (unspecified)</option></select></td>
      <td><select id="iln_size_${l.id}" onchange="onLineSpecChange('${l.id}')"><option value="">— (unspecified)</option></select></td>
      <td><input type="number" min="1" step="1" id="iln_qty_${l.id}" value="${l.qty}" oninput="updateLineNote('${l.id}')" required></td>
      <td><input type="number" min="0" step="0.01" id="iln_rate_${l.id}" value="${l.rate}" oninput="updateLineAmount('${l.id}')" required></td>
      <td><input type="number" min="0" step="0.01" id="iln_discount_${l.id}" value="${l.discount || 0}" oninput="updateLineAmount('${l.id}')"></td>
      <td class="num lineitem-amount" id="iln_amt_${l.id}">${money(Math.max(0, (l.qty || 0) * Math.max(0, (l.rate || 0) - (l.discount || 0))))}</td>
      <td>${inventoryLines.length > 1 ? `<button type="button" class="lineitem-remove" onclick="removeInventoryLine('${l.id}')" title="Remove">✕</button>` : ''}</td>
    </tr>
    <tr class="lineitem-note-row"><td colspan="10" id="iln_note_${l.id}"></td></tr>`).join('');
}
function syncInventoryLinesFromDOM() {
  inventoryLines = inventoryLines.map(l => ({
    id: l.id,
    material: document.getElementById('iln_material_' + l.id)?.value ?? l.material,
    clientBrand: document.getElementById('iln_clientBrand_' + l.id)?.value ?? l.clientBrand,
    partCode: document.getElementById('iln_partCode_' + l.id)?.value ?? l.partCode,
    serial: document.getElementById('iln_serial_' + l.id)?.value ?? l.serial,
    size: document.getElementById('iln_size_' + l.id)?.value ?? l.size,
    qty: Number(document.getElementById('iln_qty_' + l.id)?.value) || 0,
    rate: Number(document.getElementById('iln_rate_' + l.id)?.value) || 0,
    discount: Number(document.getElementById('iln_discount_' + l.id)?.value) || 0,
  }));
  return inventoryLines;
}
function addInventoryLine() {
  syncInventoryLinesFromDOM();
  inventoryLines.push({ id: newLineId(), material: '', clientBrand: '', partCode: '', serial: '', size: '', qty: 1, rate: 0, discount: 0 });
  document.getElementById('inventoryLinesBody').innerHTML = inventoryLinesRowsHTML();
  inventoryLines.forEach(l => onLineMaterialChange(l.id, true));
  updateInventoryLinesTotal();
}
function removeInventoryLine(id) {
  syncInventoryLinesFromDOM();
  inventoryLines = inventoryLines.filter(l => l.id !== id);
  if (!inventoryLines.length) inventoryLines.push({ id: newLineId(), material: '', clientBrand: '', partCode: '', serial: '', size: '', qty: 1, rate: 0, discount: 0 });
  document.getElementById('inventoryLinesBody').innerHTML = inventoryLinesRowsHTML();
  inventoryLines.forEach(l => onLineMaterialChange(l.id, true));
  updateInventoryLinesTotal();
}
function refreshAllLineMaterialDropdowns() {
  const type = document.getElementById('ihdr_type').value;
  const tech = document.getElementById('ihdr_issuedTo').value;
  const lines = syncInventoryLinesFromDOM();
  const techMap = type === 'Credit' ? technicianOutstandingMaterialsMap(tech, null) : null;
  lines.forEach(l => {
    const sel = document.getElementById('iln_material_' + l.id);
    if (!sel) return;
    const reserved = {};
    lines.forEach(o => { if (o.id !== l.id && o.material && o.qty) reserved[o.material] = (reserved[o.material] || 0) + o.qty; });
    let list = DB.lists.parts;
    if (type === 'Credit') {
      list = DB.lists.parts.filter(m => ((techMap[m] || 0) - (reserved[m] || 0)) > 0 || m === l.material);
    } else {
      list = DB.lists.parts.filter(m => (availableStock(m) - (reserved[m] || 0)) > 0 || m === l.material);
    }
    sel.innerHTML = list.length ? opts(list, l.material) : (type === 'Credit' ? '<option value="">— technician holds nothing to return —</option>' : '<option value="">— none in stock —</option>');
  });
}
function onInventoryHeaderTechChange() {
  const tech = document.getElementById('ihdr_issuedTo').value;
  document.getElementById('ihdr_linkedTicket').innerHTML = openTicketOptions(document.getElementById('ihdr_linkedTicket').value, tech);
  inventoryLines.forEach(l => onLineMaterialChange(l.id, true));
}
function onInventoryHeaderTypeChange() {
  const type = document.getElementById('ihdr_type').value;
  const hint = document.getElementById('inventoryLinesHint');
  if (hint) hint.textContent = type === 'Credit'
    ? "Each part's Brand / Part code / Serial / Size only offers what the selected technician is actually holding — add as many parts as this bill covers."
    : "Each part's Brand / Part code / Serial / Size only offers what's actually still in stock — add as many parts as this bill covers.";
  inventoryLines.forEach(l => onLineMaterialChange(l.id, true));
}
// preserveSelection=true keeps whatever spec is already chosen for that line instead of resetting it
function onLineMaterialChange(lineId, preserveSelection) {
  const type = document.getElementById('ihdr_type').value;
  const tech = document.getElementById('ihdr_issuedTo').value;
  const materialSel = document.getElementById('iln_material_' + lineId);
  if (!materialSel) return;
  const material = materialSel.value;
  // Rate is populated once every specification field is chosen (see
  // maybeFillRateFromExactBatch, called from onLineSpecChange below) —
  // not here, since picking just the material name alone isn't enough to
  // know which batch's price actually applies.
  const pool = specPool(material, type, null, tech);
  const sel = preserveSelection ? {
    brand: document.getElementById('iln_clientBrand_' + lineId)?.value || '',
    partCode: document.getElementById('iln_partCode_' + lineId)?.value || '',
    serial: document.getElementById('iln_serial_' + lineId)?.value || '',
    size: document.getElementById('iln_size_' + lineId)?.value || '',
  } : { brand: '', partCode: '', serial: '', size: '' };
  const facetValues = field => {
    const filt = { ...sel }; delete filt[field];
    return [...new Set(pool.filter(r => rowMatchesFilter(r, filt)).map(r => r[field]))];
  };
  fillFacetSelect('iln_clientBrand_' + lineId, facetValues('brand'), sel.brand);
  fillFacetSelect('iln_partCode_' + lineId, facetValues('partCode'), sel.partCode);
  fillFacetSelect('iln_serial_' + lineId, facetValues('serial'), sel.serial);
  fillFacetSelect('iln_size_' + lineId, facetValues('size'), sel.size);
  updateLineNote(lineId);
  refreshAllLineMaterialDropdowns();
}
function onLineSpecChange(lineId) {
  const type = document.getElementById('ihdr_type').value;
  const tech = document.getElementById('ihdr_issuedTo').value;
  const material = document.getElementById('iln_material_' + lineId).value;
  const pool = specPool(material, type, null, tech);
  const sel = {
    brand: document.getElementById('iln_clientBrand_' + lineId).value,
    partCode: document.getElementById('iln_partCode_' + lineId).value,
    serial: document.getElementById('iln_serial_' + lineId).value,
    size: document.getElementById('iln_size_' + lineId).value,
  };
  const facetValues = field => {
    const filt = { ...sel }; delete filt[field];
    return [...new Set(pool.filter(r => rowMatchesFilter(r, filt)).map(r => r[field]))];
  };
  fillFacetSelect('iln_clientBrand_' + lineId, facetValues('brand'), sel.brand);
  fillFacetSelect('iln_partCode_' + lineId, facetValues('partCode'), sel.partCode);
  fillFacetSelect('iln_serial_' + lineId, facetValues('serial'), sel.serial);
  fillFacetSelect('iln_size_' + lineId, facetValues('size'), sel.size);
  maybeFillRateFromExactBatch(lineId, type, material, sel);
  updateLineNote(lineId);
}
// Populates Rate only once material + brand + part code + serial + size are
// ALL selected — i.e. the exact batch is fully identified, not just the
// material name. Falls back to the material's most recent price only if no
// exact-batch match exists, so the field still ends up with something
// reasonable rather than staying blank forever on genuinely new stock.
function maybeFillRateFromExactBatch(lineId, type, material, sel) {
  if (!material || !sel.brand || !sel.partCode || !sel.serial || !sel.size) return;
  const rateInput = document.getElementById('iln_rate_' + lineId);
  if (!rateInput) return;
  const exact = exactBatchSalesPrice(material, sel.brand, sel.partCode, sel.serial, sel.size);
  rateInput.value = exact != null ? exact : (DB.priceList[material] ?? rateInput.value);
  updateLineAmount(lineId);
}
function updateLineNote(lineId) {
  const noteEl = document.getElementById('iln_note_' + lineId);
  if (!noteEl) return;
  const type = document.getElementById('ihdr_type').value;
  const tech = document.getElementById('ihdr_issuedTo').value;
  const material = document.getElementById('iln_material_' + lineId).value;
  if (!material) {
    noteEl.innerHTML = type === 'Credit'
      ? `<span style="color:var(--text-dim)">${tech ? 'This technician has nothing on record to return.' : 'Pick a technician, then a material, to see what can be returned.'}</span>`
      : `<span style="color:var(--text-dim)">Pick a material to see available stock.</span>`;
    updateLineAmount(lineId);
    return;
  }
  const sel = {
    brand: document.getElementById('iln_clientBrand_' + lineId).value,
    partCode: document.getElementById('iln_partCode_' + lineId).value,
    serial: document.getElementById('iln_serial_' + lineId).value,
    size: document.getElementById('iln_size_' + lineId).value,
  };
  const pool = specPool(material, type, null, tech);
  const matched = pool.filter(r => rowMatchesFilter(r, sel));
  const avail = matched.reduce((s, r) => s + (r.qty || 0), 0);
  const qty = Number(document.getElementById('iln_qty_' + lineId).value) || 0;
  const combTerm = type === 'Credit' ? `${tech || 'This technician'} isn't holding this exact combination.` : `This exact combination isn't in stock.`;
  if (avail <= 0) {
    noteEl.innerHTML = `<span style="color:var(--red)">⚠ ${combTerm}</span>`;
  } else if (qty > avail) {
    noteEl.innerHTML = `<span style="color:var(--red)">⚠ Only ${avail} available for this combination.</span>`;
  } else {
    noteEl.innerHTML = `<span style="color:${avail <= 2 ? 'var(--amber)' : 'var(--accent)'}">${avail} available for this exact combination.</span>`;
  }
  updateLineAmount(lineId);
}
function updateLineAmount(lineId) {
  const qty = Number(document.getElementById('iln_qty_' + lineId)?.value) || 0;
  const rate = Number(document.getElementById('iln_rate_' + lineId)?.value) || 0;
  const discount = Number(document.getElementById('iln_discount_' + lineId)?.value) || 0;
  const el = document.getElementById('iln_amt_' + lineId);
  if (el) el.textContent = money(Math.max(0, qty * Math.max(0, rate - discount)));
  updateInventoryLinesTotal();
}
function updateInventoryLinesTotal() {
  let total = 0;
  inventoryLines.forEach(l => {
    const qty = Number(document.getElementById('iln_qty_' + l.id)?.value) || 0;
    const rate = Number(document.getElementById('iln_rate_' + l.id)?.value) || 0;
    const discount = Number(document.getElementById('iln_discount_' + l.id)?.value) || 0;
    total += Math.max(0, qty * Math.max(0, rate - discount));
  });
  const el = document.getElementById('inventoryLinesTotal');
  if (el) el.textContent = money(total);
}

function onInventoryTypeChange() {
  const type = document.getElementById('if_type').value;
  const materialSel = document.getElementById('if_material');
  const current = materialSel.value;
  const excludeId = editingInventoryId || null;
  const tech = document.getElementById('if_issuedTo').value;
  materialSel.innerHTML = materialOptionsForType(type, current, excludeId, tech);
  onInventoryMaterialChange();
}
function onInventoryTechChange() {
  const tech = document.getElementById('if_issuedTo').value;
  document.getElementById('if_linkedTicket').innerHTML = openTicketOptions(document.getElementById('if_linkedTicket').value, tech);
  onInventoryTypeChange();
}
function onInventoryMaterialChange() {
  const type = document.getElementById('if_type').value;
  const material = document.getElementById('if_material').value;
  const excludeId = editingInventoryId || null;
  const tech = document.getElementById('if_issuedTo').value;
  document.getElementById('if_stockNote').innerHTML = inventoryStockNoteHTML(material, type, excludeId, tech);
  if (type === 'Debit' && material && DB.priceList[material] != null && !editingInventoryId) {
    const rateInput = document.getElementById('if_rate');
    if (rateInput) rateInput.value = DB.priceList[material];
  }
  // material changed — spec facets reset to "nothing chosen" so the full pool for the new material shows
  refreshSpecFacets({ brand: '', partCode: '', serial: '', size: '' });
}
function onInventorySpecChange() { refreshSpecFacets(); }
function onInventoryQtyChange() { updateSpecNote(); }
function fillFacetSelect(id, values, current) {
  const el = document.getElementById(id);
  if (!el) return;
  const opts2 = ['<option value="">— (unspecified)</option>']
    .concat(values.filter(v => v !== '').map(v => `<option value="${esc(v)}">${esc(v)}</option>`));
  el.innerHTML = opts2.join('');
  el.value = values.includes(current) ? current : '';
}
function refreshSpecFacets(seed) {
  const type = document.getElementById('if_type').value;
  const material = document.getElementById('if_material').value;
  const excludeId = editingInventoryId || null;
  const tech = document.getElementById('if_issuedTo').value;
  const pool = specPool(material, type, excludeId, tech);
  const sel = seed || {
    brand: document.getElementById('if_clientBrand').value,
    partCode: document.getElementById('if_partCode').value,
    serial: document.getElementById('if_serial').value,
    size: document.getElementById('if_size').value,
  };
  const facetValues = field => {
    const filt = { ...sel }; delete filt[field];
    return [...new Set(pool.filter(r => rowMatchesFilter(r, filt)).map(r => r[field]))];
  };
  fillFacetSelect('if_clientBrand', facetValues('brand'), sel.brand);
  fillFacetSelect('if_partCode', facetValues('partCode'), sel.partCode);
  fillFacetSelect('if_serial', facetValues('serial'), sel.serial);
  fillFacetSelect('if_size', facetValues('size'), sel.size);
  updateSpecNote();
}
function updateSpecNote() {
  const noteEl = document.getElementById('if_specNote');
  if (!noteEl) return;
  const type = document.getElementById('if_type').value;
  const material = document.getElementById('if_material').value;
  const excludeId = editingInventoryId || null;
  const tech = document.getElementById('if_issuedTo').value;
  const finalSel = {
    brand: document.getElementById('if_clientBrand').value,
    partCode: document.getElementById('if_partCode').value,
    serial: document.getElementById('if_serial').value,
    size: document.getElementById('if_size').value,
  };
  const pool = specPool(material, type, excludeId, tech);
  const matched = pool.filter(r => rowMatchesFilter(r, finalSel));
  const avail = matched.reduce((s, r) => s + (r.qty || 0), 0);
  lastMatchedSpecAvail = avail;
  const qty = Number(document.getElementById('if_qty').value) || 0;
  const combTerm = type === 'Credit' ? `${tech || 'this technician'} isn't holding this exact combination.` : `This exact combination isn't in stock.`;
  if (avail <= 0) {
    noteEl.innerHTML = `<span style="color:var(--red)">⚠ ${combTerm}</span>`;
  } else if (qty > avail) {
    noteEl.innerHTML = `<span style="color:var(--red)">⚠ Only ${avail} available for this combination.</span>`;
  } else {
    noteEl.innerHTML = `<span style="color:${avail <= 2 ? 'var(--amber)' : 'var(--accent)'}">${avail} available for this exact combination.</span>`;
  }
}
function openInventoryForm(id) {
  editingInventoryId = id || null;
  const record = id ? DB.inventory.find(x => x.id === id) : null;
  if (!record) inventoryLines = [{ id: newLineId(), material: '', clientBrand: '', partCode: '', serial: '', size: '', qty: 1, rate: 0, discount: 0 }];
  document.getElementById('inventoryModalTitle').textContent = record ? 'Edit inventory entry' : 'New inventory entry';
  document.getElementById('inventoryModalBody').innerHTML = inventoryFormFieldsHTML(record);
  document.getElementById('inventoryModal').classList.add('open');
  if (record) {
    refreshSpecFacets({ brand: record.clientBrand || '', partCode: record.partCode || '', serial: record.serial || '', size: record.size || '' });
  } else {
    inventoryLines.forEach(l => onLineMaterialChange(l.id, true));
  }
}
function closeInventoryForm() { document.getElementById('inventoryModal').classList.remove('open'); editingInventoryId = null; bracketCreditActiveContext = null; }
// Called right after a ticket is saved that used a Service Center Bracket
// and is being closed — hands off to a fresh Consumption/Sales credit
// entry for the part(s) used, pre-filled and ready to just add the part.
// The technician / ticket link travel through sessionStorage because this
// is a real page navigation (server-rendered pages), not a client-side
// route change — a plain JS variable wouldn't survive it.
// A real, app-styled Yes/No dialog (not the browser's plain confirm()
// popup) — resolves true on Yes, false on No or on closing it any other
// way. Used specifically for the Service Center Bracket credit prompt.
function askBracketCreditConfirm(message) {
  return new Promise(resolve => {
    const modal = document.getElementById('bracketCreditConfirmModal');
    document.getElementById('bracketCreditConfirmMessage').textContent = message;
    const yesBtn = document.getElementById('bracketCreditConfirmYes');
    const noBtn = document.getElementById('bracketCreditConfirmNo');
    const cleanup = (result) => {
      modal.classList.remove('open');
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      resolve(result);
    };
    const onYes = () => cleanup(true);
    const onNo = () => cleanup(false);
    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    modal.classList.add('open');
  });
}
async function openBracketCreditInventoryEntry(ticketId, technician) {
  const ticket = DB.calls.find(c => c.id === ticketId);
  sessionStorage.setItem('bracketCredit_pending', JSON.stringify({
    technician: technician || '',
    ticketId: ticketId || '',
    ticketRef: (ticket && (ticket.ticketNumber || ticket.logNo)) || '',
  }));
  window.location.href = '/inventory';
}
// Picks up the handoff above once the Inventory page has actually loaded
// and rendered, and (separately) shows the "credited back" confirmation
// once we're back on Call Data afterward. Called once from init(), not on
// every re-render — see the call site near the bottom of this file.
function handleBracketCreditPageHandoff() {
  if (currentPage === 'inventory') {
    const raw = sessionStorage.getItem('bracketCredit_pending');
    if (!raw) return;
    sessionStorage.removeItem('bracketCredit_pending');
    try {
      const ctx = JSON.parse(raw);
      openInventoryForm(null);
      const techSel = document.getElementById('ihdr_issuedTo');
      const typeSel = document.getElementById('ihdr_type');
      const linkedSel = document.getElementById('ihdr_linkedTicket');
      if (techSel) { techSel.value = ctx.technician; onInventoryHeaderTechChange(); }
      if (typeSel) { typeSel.value = 'Credit'; onInventoryHeaderTypeChange(); }
      if (linkedSel) {
        const ticket = DB.calls.find(c => c.id === ctx.ticketId);
        const ticketKey = ticket ? (ticket.ticketNumber || ticket.id) : '';
        linkedSel.innerHTML = openTicketOptions(ticketKey, ctx.technician, ctx.ticketId);
      }
      bracketCreditActiveContext = ctx;
      toast(`Service Center bracket — add the part(s) to credit back to ${ctx.technician}`);
    } catch (e) { /* malformed/expired context — just skip the auto-open */ }
  } else if (currentPage === 'calls') {
    const raw = sessionStorage.getItem('bracketCredit_success');
    if (!raw) return;
    sessionStorage.removeItem('bracketCredit_success');
    try {
      const ctx = JSON.parse(raw);
      toast(`Parts returned to stock — credited to ${ctx.technician}${ctx.ticketRef ? ' (ticket ' + ctx.ticketRef + ')' : ''}`);
    } catch (e) { /* ignore */ }
  }
}
async function saveInventoryForm(e) {
  e.preventDefault();
  const val = id => document.getElementById(id).value;

  if (editingInventoryId) {
    const qty = Number(val('if_qty')) || 0;
    const rate = Number(val('if_rate')) || 0;
    const discount = Number(val('if_discount')) || 0;
    const material = val('if_material');
    const type = val('if_type');
    if (!material) {
      toast('Select a material — none available to issue right now.');
      return;
    }
    if (type === 'Debit') {
      const avail = availableStock(material, editingInventoryId || null);
      if (avail <= 0) {
        toast(`"${material}" is not available — 0 units in stock.`);
        return;
      }
      if (qty > avail) {
        toast(`Only ${avail} unit${avail === 1 ? '' : 's'} of "${material}" available — reduce the quantity.`);
        return;
      }
    } else {
      const tech = val('if_issuedTo');
      const map = technicianOutstandingMaterialsMap(tech, editingInventoryId || null);
      const avail = map[material] || 0;
      if (avail <= 0) {
        toast(`${tech || 'This technician'} isn't holding any "${material}" to return.`);
        return;
      }
      if (qty > avail) {
        toast(`${tech} is only holding ${avail} unit${avail === 1 ? '' : 's'} of "${material}" — reduce the quantity.`);
        return;
      }
    }
    updateSpecNote();
    if (lastMatchedSpecAvail !== null && lastMatchedSpecAvail <= 0) {
      toast(type === 'Debit'
        ? 'That exact brand / part code / serial / size combination isn\'t in stock — pick one from the dropdowns.'
        : 'That exact brand / part code / serial / size combination isn\'t on record for this technician — pick one from the dropdowns.');
      return;
    }
    if (lastMatchedSpecAvail !== null && qty > lastMatchedSpecAvail) {
      toast(`Only ${lastMatchedSpecAvail} available for this exact combination — reduce the quantity.`);
      return;
    }
    const rec = {
      date: val('if_date'), clientBrand: val('if_clientBrand'), issuedTo: val('if_issuedTo'),
      material, invoiceNo: val('if_invoice'), partCode: val('if_partCode'),
      serial: val('if_serial'), size: val('if_size'), qty, rate, type,
      discount, amount: Math.max(0, qty * Math.max(0, rate - discount)),
      linkedTicket: val('if_linkedTicket'), comments: val('if_comments')
    };
    try {
      await apiFetch('/inventory/' + editingInventoryId, { method: 'PUT', body: rec });
      closeInventoryForm();
      toast('Inventory entry updated');
      await renderAsync();
    } catch (err) {
      toast(err.message);
    }
    return;
  }

  // multi-line create path
  syncInventoryLinesFromDOM();
  const date = val('ihdr_date'), issuedTo = val('ihdr_issuedTo'), invoiceNo = val('ihdr_invoice'),
    type = val('ihdr_type'), linkedTicket = val('ihdr_linkedTicket'), comments = val('ihdr_comments');
  const validLines = inventoryLines.filter(l => l.material && l.qty > 0);
  if (!validLines.length) { toast('Add at least one part with a quantity'); return; }

  if (type === 'Debit') {
    const demand = {};
    validLines.forEach(l => {
      const key = [l.material, l.clientBrand || '', l.partCode || '', l.serial || '', l.size || ''].join('|||');
      demand[key] = (demand[key] || 0) + l.qty;
    });
    for (const key in demand) {
      const [material, clientBrand, partCode, serial, size] = key.split('|||');
      const batches = getBatchesForMaterial(material, null);
      const avail = batches
        .filter(b => b.brand === clientBrand && b.partCode === partCode && b.serial === serial && b.size === size)
        .reduce((s, b) => s + b.qty, 0);
      if (demand[key] > avail) {
        toast(`Not enough stock for "${material}"${clientBrand ? ' (' + clientBrand + ')' : ''} — need ${demand[key]}, only ${avail} available.`);
        return;
      }
    }
  } else {
    const demand = {};
    validLines.forEach(l => {
      const key = [l.material, l.clientBrand || '', l.partCode || '', l.serial || '', l.size || ''].join('|||');
      demand[key] = (demand[key] || 0) + l.qty;
    });
    for (const key in demand) {
      const [material, clientBrand, partCode, serial, size] = key.split('|||');
      const batches = getTechnicianOutstandingBatches(issuedTo, material, null);
      const avail = batches
        .filter(b => b.brand === clientBrand && b.partCode === partCode && b.serial === serial && b.size === size)
        .reduce((s, b) => s + b.qty, 0);
      if (demand[key] > avail) {
        toast(`${issuedTo || 'This technician'} isn't holding enough "${material}"${clientBrand ? ' (' + clientBrand + ')' : ''} to return — need ${demand[key]}, only ${avail} available.`);
        return;
      }
    }
  }

  try {
    for (const l of validLines) {
      const amount = Math.max(0, l.qty * Math.max(0, l.rate - (l.discount || 0)));
      await apiFetch('/inventory', {
        method: 'POST',
        body: {
          date, issuedTo, invoiceNo, type, linkedTicket, comments,
          clientBrand: l.clientBrand, material: l.material, partCode: l.partCode,
          serial: l.serial, size: l.size, qty: l.qty, rate: l.rate, discount: l.discount || 0, amount,
        },
      });
    }
    inventoryLines = [];
    // Capture before closeInventoryForm(), which clears this context as
    // part of its normal cleanup — see closeInventoryForm().
    const bracketCtx = bracketCreditActiveContext;
    closeInventoryForm();
    if (bracketCtx) {
      // Hand back to Call Data — the toast has to survive the real page
      // navigation, so it goes through sessionStorage, not toast() directly.
      sessionStorage.setItem('bracketCredit_success', JSON.stringify({
        technician: bracketCtx.technician, ticketRef: bracketCtx.ticketRef,
      }));
      window.location.href = '/calls';
      return;
    }
    toast(`${validLines.length} part${validLines.length > 1 ? 's' : ''} saved to the inventory ledger`);
    await renderAsync();
  } catch (err) {
    toast(err.message);
  }
}
