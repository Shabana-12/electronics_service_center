/* SLA/KPI reports, exports, bills and technician statements. */

/* =========================================================================
   SLA & KPI REPORT — non-financial, visible to everyone
   ========================================================================= */
function slaKpiRange() {
  return { from: document.getElementById('slaFrom')?.value || '', to: document.getElementById('slaTo')?.value || '' };
}
function renderSlaKpi() {
  const { from, to } = slaKpiRange();
  const calls = DB.calls.filter(c => inRange(c.date, from, to));
  const target = DB.settings.slaTargetDays || 3;
  document.getElementById('slaTargetDisplay').textContent = target;

  const rows = computeTechKpiRows(calls).map(r => {
    const met = r.turnarounds.filter(d => d <= target).length;
    const breaches = r.turnarounds.length - met;
    const compliance = r.turnarounds.length ? Math.round((met / r.turnarounds.length) * 100) : null;
    return { ...r, met, breaches, compliance };
  });

  const totalAssigned = calls.length;
  const totalCompleted = rows.reduce((s, r) => s + r.completed, 0);
  const allTurn = rows.flatMap(r => r.turnarounds);
  const avgTurnaround = allTurn.length ? (allTurn.reduce((a, b) => a + b, 0) / allTurn.length).toFixed(1) : '—';
  const metTotal = rows.reduce((s, r) => s + r.met, 0);
  const breachTotal = rows.reduce((s, r) => s + r.breaches, 0);
  const compliancePct = allTurn.length ? Math.round((metTotal / allTurn.length) * 100) : 0;

  document.getElementById('slaKpiTotal').textContent = totalAssigned;
  document.getElementById('slaKpiCompleted').textContent = totalCompleted;
  document.getElementById('slaKpiCompletedSub').textContent = totalAssigned ? Math.round((totalCompleted / totalAssigned) * 100) + '% completion rate' : '—';
  document.getElementById('slaKpiAvgTurn').textContent = avgTurnaround + (allTurn.length ? ' d' : '');
  document.getElementById('slaKpiCompliance').textContent = compliancePct + '%';
  document.getElementById('slaKpiBreach').textContent = breachTotal;

  const tbody = document.getElementById('slaKpiBody');
  if (!rows.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="9">No service calls in this date range.</td></tr>`; return; }
  tbody.innerHTML = rows.map(r => `<tr>
    <td><b>${esc(r.technician)}</b></td>
    <td class="num">${r.assigned}</td>
    <td class="num">${r.completed}</td>
    <td class="num">${r.pending}</td>
    <td class="num">${r.cancelled}</td>
    <td class="num">${r.completionPct}%</td>
    <td class="num">${r.avgTurnaround != null ? r.avgTurnaround.toFixed(1) : '—'}</td>
    <td class="num">${r.compliance != null ? r.compliance + '%' : '—'}</td>
    <td class="num">${r.breaches}</td>
  </tr>`).join('');
}
function downloadSlaKpiCSV() {
  const { from, to } = slaKpiRange();
  const calls = DB.calls.filter(c => inRange(c.date, from, to));
  const target = DB.settings.slaTargetDays || 3;
  const rows = computeTechKpiRows(calls).map(r => {
    const met = r.turnarounds.filter(d => d <= target).length;
    const breaches = r.turnarounds.length - met;
    const compliance = r.turnarounds.length ? Math.round((met / r.turnarounds.length) * 100) : '';
    return [r.technician, r.assigned, r.completed, r.pending, r.cancelled, r.completionPct + '%', r.avgTurnaround != null ? r.avgTurnaround.toFixed(1) : '', compliance, breaches];
  });
  if (!rows.length) { toast('Nothing to export in this date range'); return; }
  const header = ['Technician', 'Assigned', 'Completed', 'Pending', 'Cancelled', 'Completion %', 'Avg Turnaround (days)', 'SLA Compliance %', 'SLA Breaches'];
  const lines = [header.join(','), ...rows.map(r => r.map(csvCell).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `SLA_KPI_Report_${from || 'all'}_to_${to || 'all'}.csv`);
  toast('SLA & KPI report downloaded');
}

/* =========================================================================
   REPORTS — raw dataset export (Call Data / Purchase / Inventory) + statement
   ========================================================================= */
function reportRange() {
  return { from: document.getElementById('repFrom')?.value || '', to: document.getElementById('repTo')?.value || '' };
}
function getReportData(dataset) {
  const { from, to } = reportRange();
  const src = dataset === 'calls' ? DB.calls : dataset === 'purchases' ? DB.purchases : dataset === 'cashbook' ? DB.cashbook : DB.inventory;
  return src.filter(r => inRange(r.date, from, to)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}
const REPORT_NUMERIC_KEYS = ['srNo', 'qty', 'rate', 'debit', 'credit', 'salesPrice', 'discount', 'amount', 'bracketCharges', 'callCharges', 'billAmount', 'materialCost', 'netAmount'];
const REPORT_DATE_KEYS = ['date', 'dateOfPurchase', 'completedDate'];
function reportColumns(dataset) {
  const fields = dataset === 'calls' ? CALL_FIELDS : dataset === 'purchases' ? PURCHASE_FIELDS : dataset === 'cashbook' ? CASHBOOK_FIELDS : INVENTORY_FIELDS;
  const adminOnlyKeys = ['materialCost', 'netAmount', 'settlementStatus'];
  return fields
    .filter(([, key]) => key !== 'id')
    .filter(([, key]) => isAdmin() || !adminOnlyKeys.includes(key))
    .map(([label, key]) => ({
      key, label,
      num: REPORT_NUMERIC_KEYS.includes(key),
      fmt: REPORT_DATE_KEYS.includes(key) ? fmtDate : null
    }));
}
const AUDIT_TABLE_LABELS = { calls: 'Call Data', purchases: 'Purchase Ledger', inventory: 'Inventory / Sales', cashbook: 'Daily Cash Book' };
const AUDIT_ACTION_BADGE = { create: 'green', update: 'blue', delete: 'red', approve: 'green' };
function renderAuditLog() {
  const tbody = document.getElementById('auditLogTbody');
  if (!tbody) return;
  if (!DB.auditLog.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No changes recorded yet for this filter.</td></tr>`;
    return;
  }
  tbody.innerHTML = DB.auditLog.map(a => {
    let whatChanged = '';
    if (a.action === 'create') {
      whatChanged = '<span style="color:var(--text-dim);">New record created</span>';
    } else if (a.action === 'delete') {
      whatChanged = '<span style="color:var(--red);">Record deleted</span>';
    } else if (a.action === 'approve') {
      whatChanged = '<span style="color:var(--accent);">Marked as Approved</span>';
    } else if (a.action === 'update' && a.new_values) {
      const fields = Object.keys(a.new_values);
      whatChanged = fields.map(f => {
        const oldV = a.old_values ? a.old_values[f] : null;
        const newV = a.new_values[f];
        return `<div><b>${esc(f)}</b>: <span style="color:var(--text-dim);">${esc(oldV == null ? '—' : String(oldV))}</span> → <span>${esc(newV == null ? '—' : String(newV))}</span></div>`;
      }).join('');
    }
    return `
      <tr>
        <td style="font-size:12px;color:var(--text-dim);white-space:nowrap;">${fmtDateTime(a.changed_at)}</td>
        <td>${esc(a.username || '—')}</td>
        <td>${esc(AUDIT_TABLE_LABELS[a.table_name] || a.table_name)}</td>
        <td class="mono" style="font-size:11px;">${esc(a.record_id)}</td>
        <td><span class="badge ${AUDIT_ACTION_BADGE[a.action] || 'gray'}">${esc(a.action)}</span></td>
        <td style="font-size:12px;">${whatChanged}</td>
      </tr>`;
  }).join('');
}
function renderReportsPreview() {
  const techSel = document.getElementById('stmtTechnician');
  if (techSel && !techSel.dataset.filled) {
    techSel.innerHTML = opts(DB.lists.employees);
    techSel.dataset.filled = '1';
  }
  renderAuditLog();
  const datasetSel = document.getElementById('repDataset');
  if (!datasetSel) return;
  if (!isAdmin()) {
    const cashOpt = datasetSel.querySelector('.admin-only-option');
    if (cashOpt) cashOpt.remove();
    if (datasetSel.value === 'cashbook') datasetSel.value = 'calls';
  }
  const dataset = datasetSel.value;
  const rows = getReportData(dataset);
  const cols = reportColumns(dataset);
  const thead = document.getElementById('reportThead');
  const tbody = document.getElementById('reportTbody');
  thead.innerHTML = '<tr>' + cols.map(c => `<th>${esc(c.label)}</th>`).join('') + '</tr>';
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols.length}">No records in the selected date range.</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(r => '<tr>' + cols.map(c => `<td class="${c.num ? 'num' : ''}">${esc(c.fmt ? c.fmt(r[c.key]) : r[c.key])}</td>`).join('') + '</tr>').join('');
  }
  document.getElementById('reportCount').textContent = rows.length + ' record(s)';
}
function downloadCSV() {
  const dataset = document.getElementById('repDataset').value;
  const rows = getReportData(dataset);
  const cols = reportColumns(dataset);
  if (!rows.length) { toast('Nothing to export in this date range'); return; }
  const lines = [cols.map(c => c.label).join(',')];
  rows.forEach(r => lines.push(cols.map(c => csvCell(c.fmt ? c.fmt(r[c.key]) : r[c.key])).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const { from, to } = reportRange();
  triggerDownload(blob, `${dataset}_${from || 'all'}_to_${to || 'all'}.csv`);
  toast('CSV downloaded');
}
function downloadXLSX(mode) {
  if (typeof XLSX === 'undefined') { toast('Excel export library did not load'); return; }
  const wb = XLSX.utils.book_new();
  const { from, to } = reportRange();
  const build = (dataset, sheetName) => {
    const rows = getReportData(dataset);
    const cols = reportColumns(dataset);
    const aoa = [cols.map(c => c.label)];
    rows.forEach(r => aoa.push(cols.map(c => c.fmt ? c.fmt(r[c.key]) : r[c.key])));
    if (rows.length === 0) aoa.push(['No records in range']);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  };
  if (mode === 'all') { build('calls', 'Call Data'); build('purchases', 'Purchase Ledger'); build('inventory', 'Inventory Ledger'); build('cashbook', 'Cash Book'); }
  else build(mode, mode === 'calls' ? 'Call Data' : mode === 'purchases' ? 'Purchase Ledger' : mode === 'cashbook' ? 'Cash Book' : 'Inventory Ledger');
  XLSX.writeFile(wb, `Electronics_Service_Center_Report_${from || 'all'}_to_${to || 'all'}.xlsx`);
  toast('Excel file downloaded');
}
function csvCell(v) {
  v = v == null ? '' : String(v);
  if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
  return v;
}
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* =========================================================================
   EXCEL FILE AS DATABASE — build / parse / live connect / import / export
   ========================================================================= */
function rowsFromCollection(collection, fields) {
  return collection.map(rec => fields.map(([, key]) => rec[key] ?? ''));
}
// Excel-file persistence removed — all data now lives in the real database.
// Kept as a no-op so existing call sites elsewhere don't need to change.
async function syncExcelFile() { /* no-op: replaced by the live API */ }


/* =========================================================================
   BILL generation
   ========================================================================= */
function buildTechShareText(c) {
  const lines = [];
  lines.push(`*Service Ticket ${callLogNo(c)}*`);
  if (c.ticketNumber) lines.push(`Ticket #: ${c.ticketNumber}`);
  lines.push(`Date: ${fmtDate(c.date)}`);
  lines.push('');
  lines.push(`*Customer:* ${c.customerName || '-'}`);
  if (c.mobile) lines.push(`Mobile: ${c.mobile}`);
  if (c.address) lines.push(`Address: ${c.address}`);
  lines.push('');
  lines.push(`*Product:* ${c.product || '-'}`);
  lines.push(`*Brand/Model:* ${[c.brand, c.model].filter(Boolean).join(' ') || '-'}`);
  if (c.serial) lines.push(`Serial: ${c.serial}`);
  if (c.size) lines.push(`Size: ${c.size}`);
  lines.push(`Warranty: ${c.warranty || '-'}`);
  lines.push('');
  lines.push(`*Issue:* ${c.actualIssue || '-'}`);
  if (c.workDone) lines.push(`Work to be done: ${c.workDone}`);
  if (c.dependency && c.dependency !== '-') lines.push(`Dependency: ${c.dependency}`);
  if (c.bracketUsed) lines.push(`Bracket used of: ${c.bracketUsed}`);
  lines.push('');
  lines.push(`Assigned to: ${c.technician || '-'} (${c.techType || '-'})`);
  lines.push(`Status: ${c.status || '-'}`);
  lines.push('');
  lines.push(`_${COMPANY_NAME}_`);
  return lines.join('\n');
}
async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e2) { return false; }
  }
}
async function shareTicketWhatsApp(id) {
  const c = DB.calls.find(x => x.id === id);
  if (!c) return;
  const text = buildTechShareText(c);
  const copied = await copyTextToClipboard(text);
  toast(copied ? 'Ticket details copied — paste into WhatsApp to send.' : 'Copy failed — select and copy the ticket text manually.');
}
function openBill(id) {
  const c = DB.calls.find(x => x.id === id);
  if (!c) return;
  if (c.status === 'Pending') {
    toast('Update the ticket status before generating a bill — it can\'t be Pending');
    return;
  }
  document.getElementById('billModalTitle').textContent = 'Service bill';
  const partsTotal = 0; // parts are tracked via inventory ledger, not itemised on the call
  const total = (c.bracketCharges || 0) + (c.callCharges || 0);
  const billAmt = c.billAmount || total;
  document.getElementById('billPrintArea').innerHTML = `
    <div class="bill">
      <div class="bill-head">
        <div class="bill-co">
          <div class="bill-logo brand-mark bill-mark" aria-hidden="true"><span>ES</span></div>
          <div>
            <h1>${esc(COMPANY_NAME)}</h1>
            <div class="co-sub">Electronics Service &amp; Repair Operations</div>
            <div class="co-sub">${esc(COMPANY_SUBTITLE)}</div>
          </div>
        </div>
        <div class="bill-tag">
          <div style="font-size:10.5px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;">Service Bill</div>
          <div class="no">${esc(callLogNo(c))}</div>
          <div style="font-size:12px;color:var(--text-dim);margin-top:2px;">${c.ticketNumber ? 'Ticket ' + esc(c.ticketNumber) + ' · ' : ''}${fmtDate(c.date)}</div>
        </div>
      </div>
      <div class="bill-grid">
        <div class="bill-box">
          <h4>Bill to</h4>
          <div class="row"><span>Customer</span><span><b>${esc(c.customerName)}</b></span></div>
          <div class="row"><span>Mobile</span><span>${esc(c.mobile || '—')}</span></div>
          <div class="row"><span>Address</span><span style="text-align:right;max-width:220px;">${esc(c.address || '—')}</span></div>
        </div>
        <div class="bill-box">
          <h4>Product</h4>
          <div class="row"><span>Product</span><span>${esc(c.product || '—')}</span></div>
          <div class="row"><span>Brand / Model</span><span>${esc(c.brand)} ${esc(c.model || '')}</span></div>
          <div class="row"><span>Serial no.</span><span>${esc(c.serial || '—')}</span></div>
          <div class="row"><span>Warranty</span><span>${esc(c.warranty)}</span></div>
        </div>
      </div>
      <div class="bill-box" style="margin-bottom:16px;">
        <h4>Service details</h4>
        <div class="row"><span>Issue reported</span><span style="text-align:right;max-width:320px;">${esc(c.actualIssue || '—')}</span></div>
        <div class="row"><span>Work done</span><span style="text-align:right;max-width:320px;">${esc(c.workDone || '—')}</span></div>
        <div class="row"><span>Technician</span><span>${esc(c.technician || '—')} (${esc(c.techType || '—')})</span></div>
        <div class="row"><span>Status</span><span>${esc(c.status || '—')}</span></div>
        <div class="row"><span>Bracket used of</span><span>${esc(c.bracketUsed || '—')}</span></div>
      </div>
      <table>
        <thead><tr><th>Description</th><th class="num">Amount (₹)</th></tr></thead>
        <tbody>
          <tr><td>Call/Part Charges</td><td class="num">${money((c.bracketCharges || 0) + (c.callCharges || 0))}</td></tr>
          <tr class="charge-total"><td>Total service center bill amount</td><td class="num">${money(billAmt)}</td></tr>
        </tbody>
      </table>
      <div class="bill-foot">
       
        <div class="bill-sign"><div class="line">Authorised signatory</div></div>
      </div>
      <div style="text-align:center;margin-top:22px;font-size:10.5px;color:var(--text-dim);">Thank you for choosing ${esc(COMPANY_NAME)}. This is a system-generated bill.</div>
    </div>`;
  document.getElementById('billModal').classList.add('open');
}
function closeBillModal() { document.getElementById('billModal').classList.remove('open'); }
async function printInNewWindow(areaId, docTitle){
  const area = document.getElementById(areaId);
  if(!area) return;
  // The app's CSS is loaded as an external stylesheet (<link>), not an
  // inline <style> block — a print/download window is a blank document
  // with none of that CSS by default, so it has to be fetched and copied
  // in explicitly, or things like the bill logo's size (and everything
  // else styled by style.css) render at raw, uncontrolled browser
  // defaults instead of how the in-app preview actually looks.
  const linkEl = document.querySelector('link[rel="stylesheet"]');
  let css = '';
  if (linkEl) {
    try {
      css = await fetch(linkEl.href).then(r => r.text());
    } catch (e) {
      css = '';
    }
  }
  // Strip the app's own @media print rule (it hides everything except
  // #billPrintArea/#statementPrintArea by id, which don't exist in this
  // popup — copying it verbatim would blank out the whole print).
  css = css.replace(/@media\s+print\s*\{[\s\S]*?\n\}\n/, '');
  const w = window.open('', '_blank');
  if(!w){ toast('Please allow pop-ups to print'); return; }
  w.document.write('<!DOCTYPE html><html><head><title>' + docTitle + '</title><style>' + css + '\n@media print{ body{margin:0;} }</style></head><body>' + area.innerHTML + '</body></html>');
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 300);
}
function printBill() { printInNewWindow('billPrintArea', 'Bill'); }

// ---- Parts bill (Consumption/Sales) — for parts issued to or returned by a technician/customer ----
function findBillSiblings(rec) {
  if (!rec.invoiceNo) return [rec];
  return DB.inventory.filter(v => v.invoiceNo === rec.invoiceNo && v.date === rec.date && v.issuedTo === rec.issuedTo && v.type === rec.type);
}
function openInventoryBill(id) {
  const rec = DB.inventory.find(x => x.id === id);
  if (!rec) return;
  const lines = findBillSiblings(rec).sort((a, b) => a.srNo - b.srNo);
  const isReturn = rec.type === 'Credit';
  const linkedCall = rec.linkedTicket ? DB.calls.find(c => (c.ticketNumber || c.id) === rec.linkedTicket) : null;
  const grossTotal = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const discountTotal = lines.reduce((s, l) => s + (l.discount || 0) * l.qty, 0);
  const netTotal = lines.reduce((s, l) => s + l.amount, 0);
  document.getElementById('billModalTitle').textContent = isReturn ? 'Parts return bill' : 'Parts issue bill';
  document.getElementById('billPrintArea').innerHTML = `
    <div class="bill">
      <div class="bill-head">
        <div class="bill-co">
          <div class="bill-logo brand-mark bill-mark" aria-hidden="true"><span>ES</span></div>
          <div>
            <h1>${esc(COMPANY_NAME)}</h1>
            <div class="co-sub">Electronics Service &amp; Repair Operations</div>
            <div class="co-sub">${esc(COMPANY_SUBTITLE)}</div>
          </div>
        </div>
        <div class="bill-tag">
          <div style="font-size:10.5px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;">${isReturn ? 'Parts Return Bill' : 'Parts Issue Bill'}</div>
          <div class="no">${esc(rec.invoiceNo || invLogNo(rec))}</div>
          <div style="font-size:12px;color:var(--text-dim);margin-top:2px;">${fmtDate(rec.date)}</div>
        </div>
      </div>
      <div class="bill-grid">
        <div class="bill-box">
          <h4>${isReturn ? 'Returned by' : 'Issued to'}</h4>
          <div class="row"><span>Technician / customer</span><span><b>${esc(rec.issuedTo)}</b></span></div>
          <div class="row"><span>Brand</span><span>${esc(rec.clientBrand || '—')}</span></div>
        </div>
        <div class="bill-box">
          <h4>Linked service call</h4>
          <div class="row"><span>Ticket</span><span>${esc(rec.linkedTicket || '—')}</span></div>
          <div class="row"><span>Customer</span><span>${linkedCall ? esc(linkedCall.customerName) : '—'}</span></div>
        </div>
      </div>
      <table>
        <thead><tr><th>Material / specification</th><th class="num">Qty</th><th class="num">Rate (₹)</th><th class="num">Discount (₹)</th><th class="num">Amount (₹)</th></tr></thead>
        <tbody>
          ${lines.map(l => {
    const specBits = [l.partCode, l.serial, l.size].filter(Boolean);
    return `<tr>
              <td><b>${esc(l.material)}</b>${specBits.length ? `<br><span style="color:var(--text-dim);font-size:11px">${esc(specBits.join(' · '))}</span>` : ''}</td>
              <td class="num">${l.qty}</td><td class="num">${money(l.rate)}</td>
              <td class="num">${l.discount ? money(l.discount * l.qty) : '—'}</td>
              <td class="num">${money(l.amount)}</td>
            </tr>`;
  }).join('')}
          ${discountTotal > 0 ? `<tr><td colspan="4" style="text-align:right;color:var(--text-dim);">Gross total</td><td class="num" style="color:var(--text-dim);">${money(grossTotal)}</td></tr>
          <tr><td colspan="4" style="text-align:right;color:var(--red);">Total discount</td><td class="num" style="color:var(--red);">−${money(discountTotal)}</td></tr>` : ''}
          <tr class="charge-total"><td colspan="4">${isReturn ? 'Total value returned' : 'Total value issued'}</td><td class="num">${money(netTotal)}</td></tr>
        </tbody>
      </table>
      <div class="bill-foot">
        <div>Generated from the service operations CRM.</div>
        <div class="bill-sign"><div class="line">Authorised signatory</div></div>
      </div>
      <div style="text-align:center;margin-top:22px;font-size:10.5px;color:var(--text-dim);">Thank you for choosing ${esc(COMPANY_NAME)}. This is a system-generated bill.</div>
    </div>`;
  document.getElementById('billModal').classList.add('open');
}

/* =========================================================================
   TECHNICIAN MONTHLY STATEMENT — jobs done + debit/credit, admin-only
   ========================================================================= */
function monthYearLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
function buildMaterialBalancePivot(allTimeLedger, periodFrom) {
  const groups = {};
  allTimeLedger.forEach(v => {
    const key = [v.material || 'Unknown', v.clientBrand || '—', v.partCode || '—', v.serial || '—', v.size || '—'].join('||');
    if (!groups[key]) groups[key] = {
      material: v.material || 'Unknown', clientBrand: v.clientBrand || '—',
      partCode: v.partCode || '—', serial: v.serial || '—', size: v.size || '—',
      debQty: 0, debAmt: 0, credQty: 0, credAmt: 0, issuedDate: null, tickets: new Set()
    };
    if (v.type === 'Debit') {
      groups[key].debQty += v.qty; groups[key].debAmt += v.amount;
      if (v.linkedTicket) groups[key].tickets.add(v.linkedTicket);
      if (!groups[key].issuedDate || v.date < groups[key].issuedDate) groups[key].issuedDate = v.date;
    } else {
      groups[key].credQty += v.qty; groups[key].credAmt += v.amount;
    }
  });
  return Object.values(groups)
    .map(r => {
      const balQty = r.debQty - r.credQty, balAmt = r.debAmt - r.credAmt;
      const comment = (r.issuedDate && periodFrom && r.issuedDate < periodFrom)
        ? `Balance c/f from ${monthYearLabel(r.issuedDate)}` : '';
      return { ...r, balQty, balAmt, comment, ticketLabel: Array.from(r.tickets).join(', ') || '—' };
    })
    .filter(r => r.balQty > 0) // balance-item summary — only material still outstanding with the technician
    .sort((a, b) => (a.issuedDate || '').localeCompare(b.issuedDate || '') || a.material.localeCompare(b.material));
}
function openTechnicianStatement() {
  const tech = document.getElementById('stmtTechnician').value;
  const from = document.getElementById('stmtFrom').value;
  const to = document.getElementById('stmtTo').value;
  if (!tech) { toast('Choose a technician first'); return; }

  // Monthly estimate must only count actually-closed jobs — a Pending or
  // Cancelled ticket has no settled charge yet, so including it here would
  // inflate what's owed to (or by) the technician before the job is done.
  const CLOSED_STATUSES = ['Installation Done', 'Repair Done'];
  const calls = DB.calls.filter(c => c.technician === tech && inRange(c.date, from, to) && CLOSED_STATUSES.includes(c.status)).sort((a, b) => a.date.localeCompare(b.date));
  const ledger = DB.inventory.filter(v => v.issuedTo === tech && inRange(v.date, from, to)).sort((a, b) => a.date.localeCompare(b.date));
  const ledgerAllTime = DB.inventory.filter(v => v.issuedTo === tech && (!to || v.date <= to));
  const totalDebit = ledger.filter(v => v.type === 'Debit').reduce((s, v) => s + v.amount, 0);
  const totalCredit = ledger.filter(v => v.type === 'Credit').reduce((s, v) => s + v.amount, 0);
  const creditRows = ledger.filter(v => v.type === 'Credit');
  const net = totalDebit - totalCredit;
  const totalCallCharges = calls.reduce((s, c) => s + (c.callCharges || 0) + (c.bracketCharges || 0), 0);
  const partsUsed = totalDebit; // parts issued/debited to the technician for the period (reference figure only)
  const settlement = totalCallCharges - totalCredit;
  const balRows = buildMaterialBalancePivot(ledgerAllTime, from);
  const balQtyTotal = balRows.reduce((s, r) => s + r.balQty, 0);
  const balAmtTotal = balRows.reduce((s, r) => s + r.balAmt, 0);

  const periodLabel = (from ? fmtDate(from) : 'Start') + ' — ' + (to ? fmtDate(to) : 'Today');

  document.getElementById('statementPrintArea').innerHTML = `
    <div class="bill">
      <div class="bill-head">
        <div class="bill-co"><div class="bill-logo brand-mark bill-mark" aria-hidden="true"><span>ES</span></div><div><h1>${esc(COMPANY_NAME)}</h1><div class="co-sub">Technician Monthly Statement</div><div class="co-sub">${esc(COMPANY_SUBTITLE)}</div></div></div>
        <div class="bill-tag">
          <div style="font-size:10.5px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;">Statement for</div>
          <div class="no">${esc(tech)}</div>
          <div style="font-size:12px;color:var(--text-dim);margin-top:2px;">${esc(periodLabel)}</div>
        </div>
      </div>

      <h4 style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin:0 0 8px;">Jobs completed / handled (${calls.length}) — closed jobs only (Installation Done / Repair Done); Pending and Cancelled tickets are excluded from this estimate</h4>
      <table style="margin-bottom:8px;">
        <thead><tr><th>Date</th><th>Ticket #</th><th>Customer</th><th>Brand / Model</th><th>Work done</th><th>Work done date</th><th class="num">Days taken</th><th>Status</th><th>SLA</th><th class="num">Call/Part Charges (₹)</th></tr></thead>
        <tbody>
          ${calls.length ? calls.map(c => {
    const days = callTurnaroundDays(c);
    const target = DB.settings.slaTargetDays || 3;
    let slaCell = days == null ? '<span class="badge gray">No work done date</span>' : (days <= target ? '<span class="badge green">Achieved</span>' : '<span class="badge red">Not achieved</span>');
    return `<tr><td>${fmtDate(c.date)}</td><td class="mono">${esc(c.ticketNumber || '—')}</td><td>${esc(c.customerName)}</td><td>${esc(c.brand)} ${esc(c.model || '')}</td><td>${esc(c.workDone || c.actualIssue || '—')}</td><td>${c.completedDate ? fmtDate(c.completedDate) : '—'}</td><td class="num">${days != null ? days : '—'}</td><td>${esc(c.status)}</td><td>${slaCell}</td><td class="num">${money((c.callCharges || 0) + (c.bracketCharges || 0))}</td></tr>`;
  }).join('') : `<tr><td colspan="10" style="text-align:center;color:var(--text-dim);">No closed tickets in this period.</td></tr>`}
        </tbody>
        ${calls.length ? `<tfoot><tr class="charge-total"><td colspan="9">Total Call/Part Charges</td><td class="num">${money(totalCallCharges)}</td></tr></tfoot>` : ''}
      </table>

      <table style="margin-bottom:20px;">
        <tbody>
          <tr><td style="width:70%;">Total Call/Part Charges — jobs above</td><td class="num">${money(totalCallCharges)}</td></tr>
          <tr><td>Total credited (returned by technician) — full period</td><td class="num">${money(totalCredit)}</td></tr>
          <tr class="charge-total"><td>Balance — ${settlement >= 0 ? 'payable to technician' : 'receivable from technician'}</td><td class="num">${money(Math.abs(settlement))}</td></tr>
        </tbody>
      </table>

      <h4 style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin:0 0 8px;">Parts balance — outstanding items only (${balRows.length})</h4>
      <table style="margin-bottom:8px;">
        <thead>
          <tr>
            <th>Ticket #</th><th>Material/goods</th><th>Brand</th><th>Part code</th><th>Serial number</th><th>Size</th>
            <th>Issued date</th><th class="num">Debit Qty</th><th class="num">Credit Qty</th><th class="num">Balance Qty</th><th class="num">Balance Amount</th>
          </tr>
        </thead>
        <tbody>
          ${balRows.length ? balRows.map(r => `<tr>
            <td class="mono">${esc(r.ticketLabel)}</td><td>${esc(r.material)}</td><td>${esc(r.clientBrand)}</td><td>${esc(r.partCode)}</td><td>${esc(r.serial)}</td><td>${esc(r.size)}</td>
            <td>${r.issuedDate ? fmtDate(r.issuedDate) : '—'}</td>
            <td class="num">${r.debQty}</td><td class="num">${r.credQty}</td>
            <td class="num"><b>${r.balQty}</b></td><td class="num"><b>${money(r.balAmt)}</b></td>
          </tr>`).join('') : `<tr><td colspan="11" style="text-align:center;color:var(--text-dim);">Nothing outstanding — every part issued has been returned or fully accounted for.</td></tr>`}
        </tbody>
        <tfoot>
          <tr class="charge-total"><td colspan="7">Balance Total</td><td class="num">${balRows.reduce((s, r) => s + r.debQty, 0)}</td><td class="num">${balRows.reduce((s, r) => s + r.credQty, 0)}</td><td class="num">${balQtyTotal}</td><td class="num">${money(balAmtTotal)}</td></tr>
        </tfoot>
      </table>

      <div class="bill-foot">
        <div>Generated ${fmtDate(todayISO())}. Figures reflect the app's records for the stated period only.</div>
        <div class="bill-sign"><div class="line">Authorized signature</div></div>
      </div>
    </div>`;
  window._lastStatement = { tech, from, to, calls, ledger, balRows, creditRows, totalDebit, totalCredit, net, totalCallCharges, partsUsed, settlement };
}
function printStatement() {
  if (!window._lastStatement) { toast('Preview a statement first'); return; }
  printInNewWindow('statementPrintArea', 'Technician Statement');
}
function exportStatementXLSX() {
  const s = window._lastStatement;
  if (!s) { toast('Preview a statement first'); return; }
  const wb = XLSX.utils.book_new();
  const callsAOA = [['Date', 'Ticket #', 'Customer', 'Brand', 'Model', 'Work Done', 'Work Done Date', 'Days Taken', 'Status', 'SLA', 'Call/Part Charges'],
    ...s.calls.map(c => {
      const days = callTurnaroundDays(c);
      const target = DB.settings.slaTargetDays || 3;
      const sla = days == null ? 'No work done date' : (days <= target ? 'Achieved' : 'Not achieved');
      return [fmtDate(c.date), c.ticketNumber || '', c.customerName, c.brand, c.model || '', c.workDone || c.actualIssue || '', c.completedDate ? fmtDate(c.completedDate) : '', days != null ? days : '', c.status, sla, (c.callCharges || 0) + (c.bracketCharges || 0)];
    }),
    [], ['', '', '', '', '', '', '', '', '', 'Total Call/Part Charges', s.totalCallCharges],
    ['', '', '', '', '', '', '', '', '', 'Total Credited (returned by technician)', s.totalCredit],
    ['', '', '', '', '', '', '', '', '', s.settlement >= 0 ? 'Balance Payable to Technician' : 'Balance Receivable from Technician', Math.abs(s.settlement)]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(callsAOA), 'Jobs');
  const balAOA = [['Ticket #', 'Material/goods', 'Brand', 'Part Code', 'Serial Number', 'Size', 'Issued Date', 'Debit Qty', 'Credit Qty', 'Balance Qty', 'Balance Amount'],
    ...s.balRows.map(r => [r.ticketLabel, r.material, r.clientBrand, r.partCode, r.serial, r.size, r.issuedDate ? fmtDate(r.issuedDate) : '', r.debQty, r.credQty, r.balQty, r.balAmt])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(balAOA), 'Balance Summary');
  const creditAOA = [['Date', 'Ticket #', 'Material/goods', 'Brand', 'Part Code', 'Serial Number', 'Size', 'Qty', 'Rate', 'Amount'],
    ...s.creditRows.map(v => [fmtDate(v.date), v.linkedTicket || '', v.material, v.clientBrand || '', v.partCode || '', v.serial || '', v.size || '', v.qty, v.rate, v.amount])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(creditAOA), 'Credited Materials');
  const ledgerAOA = [['Date', 'Ticket #', 'Material', 'Qty', 'Rate', 'Type', 'Amount'],
    ...s.ledger.map(v => [fmtDate(v.date), v.linkedTicket || '', v.material, v.qty, v.rate, v.type === 'Debit' ? 'Issued' : 'Returned', v.amount]),
    [], ['', '', '', '', '', 'Total Debit', s.totalDebit], ['', '', '', '', '', 'Total Credit', s.totalCredit], ['', '', '', '', '', 'Net', s.net]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ledgerAOA), 'Full Ledger');
  XLSX.writeFile(wb, `Statement_${s.tech.replace(/[^a-z0-9]+/gi, '_')}_${s.from || 'all'}_to_${s.to || 'all'}.xlsx`);
  toast('Statement exported');
}
