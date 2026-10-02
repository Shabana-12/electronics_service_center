/* Cash book and Income & Expenditure UI. */

/* =========================================================================
   DAILY CASH BOOK — Income & Expenditure, admin-only module
   ========================================================================= */
let editingCashId = null;
let cashChartInstance = null;
let cashTrendChartInstance = null;

function cashCategoryOptions(type, selectedCategory) {
  const list = DB.cashCategories.filter(c => c.type === type);
  return list.map(c => `<option value="${esc(c.category)}" data-group="${esc(c.group)}" data-desc="${esc(c.desc || '')}" ${c.category === selectedCategory ? 'selected' : ''}>${esc(c.category)}</option>`).join('');
}
function cashFormFieldsHTML(e) {
  e = e || {};
  const type = e.tranType || 'Payment';
  return `
  <div class="grid-3">
    <div class="field"><label class="req">Date</label><input type="date" id="cf_date" value="${e.date || todayISO()}" required></div>
    <div class="field"><label class="req">Transaction type</label><select id="cf_type" required onchange="onCashTypeChange()">
      <option value="Receipt" ${type === 'Receipt' ? 'selected' : ''}>Receipt (money in)</option>
      <option value="Payment" ${type !== 'Receipt' ? 'selected' : ''}>Payment (money out)</option>
    </select></div>
    <div class="field"><label class="req">Amount (₹)</label><input type="number" min="0" step="0.01" id="cf_amount" value="${e.amount ?? 0}" required></div>
  </div>
  <div class="grid-2">
    <div class="field"><label class="req">Category</label><select id="cf_category" required onchange="onCashCategoryChange()">${cashCategoryOptions(type, e.category)}</select></div>
    <div class="field"><label>Group</label><input id="cf_group" value="${esc(e.group || '')}" disabled style="color:var(--text-dim)"></div>
  </div>
  <div class="field"><label>Particulars / description</label><input id="cf_particulars" value="${esc(e.particulars || '')}" placeholder="What is this for?"></div>
  <div class="grid-2">
    <div class="field"><label>Stakeholder name</label><input id="cf_stakeholder" value="${esc(e.stakeholder || '')}" placeholder="Customer, vendor, technician…"></div>
    <div class="field"><label>Payment mode</label><select id="cf_mode">
      <option ${(!e.mode || e.mode === 'Cash') ? 'selected' : ''}>Cash</option>
      <option ${e.mode === 'UPI' ? 'selected' : ''}>UPI</option>
      <option ${e.mode === 'Card' ? 'selected' : ''}>Card</option>
      <option ${e.mode === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
    </select></div>
  </div>
  <div class="field"><label>Voucher / reference no.</label><input value="${esc(e.voucherNo || 'Auto-generated (INC-/EXP- + number)')}" disabled style="color:var(--text-dim)"></div>
  <div class="field"><label>Comments</label><input id="cf_comments" value="${esc(e.comments || '')}"></div>`;
}
function onCashTypeChange() {
  const type = document.getElementById('cf_type').value;
  document.getElementById('cf_category').innerHTML = cashCategoryOptions(type, '');
  onCashCategoryChange();
}
function onCashCategoryChange() {
  const sel = document.getElementById('cf_category');
  const opt = sel.options[sel.selectedIndex];
  document.getElementById('cf_group').value = opt ? (opt.dataset.group || '') : '';
  const particularsField = document.getElementById('cf_particulars');
  if (particularsField && !particularsField.value && opt && opt.dataset.desc) particularsField.value = opt.dataset.desc;
}
function openCashForm(id) {
  editingCashId = id || null;
  const record = id ? DB.cashbook.find(x => x.id === id) : null;
  document.getElementById('cashModalTitle').textContent = record ? 'Edit cash book entry' : 'New cash book entry';
  document.getElementById('cashModalBody').innerHTML = cashFormFieldsHTML(record);
  document.getElementById('cashModal').classList.add('open');
}
function closeCashForm() { document.getElementById('cashModal').classList.remove('open'); editingCashId = null; }
async function saveCashForm(ev) {
  ev.preventDefault();
  const val = id => document.getElementById(id).value;
  const type = val('cf_type');
  const amount = Number(val('cf_amount')) || 0;
  const rec = {
    date: val('cf_date'), tranType: type, category: val('cf_category'), group: val('cf_group'),
    particulars: val('cf_particulars'), stakeholder: val('cf_stakeholder'), mode: val('cf_mode'),
    amount, comments: val('cf_comments')
  };
  try {
    if (editingCashId) {
      await apiFetch('/cashbook/' + editingCashId, { method: 'PUT', body: rec });
    } else {
      await apiFetch('/cashbook', { method: 'POST', body: rec });
    }
    closeCashForm();
    toast('Cash book entry saved');
    await renderAsync();
  } catch (err) {
    toast(err.message);
  }
}

function cashFilters() {
  const from = document.getElementById('cashFrom')?.value || '';
  const to = document.getElementById('cashTo')?.value || '';
  const type = document.getElementById('cashTypeFilter')?.value || '';
  const q = (document.getElementById('cashSearch')?.value || '').toLowerCase();
  return DB.cashbook.filter(e => {
    if (from && e.date < from) return false;
    if (to && e.date > to) return false;
    if (type && e.tranType !== type) return false;
    if (q && !(`${e.category} ${e.particulars} ${e.stakeholder} ${e.voucherNo}`.toLowerCase().includes(q))) return false;
    return true;
  });
}
function cashRunningLedger(rows) {
  // running balance always follows chronological order, regardless of how rows are later sorted for display
  const chrono = rows.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.srNo - b.srNo);
  let bal = DB.settings.openingCashBalance || 0;
  const balanceById = {};
  chrono.forEach(e => { bal += (e.tranType === 'Receipt' ? e.amount : -e.amount); balanceById[e.id] = bal; });
  return balanceById;
}
function renderCashbook() {
  const typeSel = document.getElementById('cashTypeFilter');
  if (typeSel && !typeSel.dataset.filled) { typeSel.innerHTML = '<option value="">All types</option><option value="Receipt">Receipt</option><option value="Payment">Payment</option>'; typeSel.dataset.filled = '1'; }

  const filtered = cashFilters();
  const balanceMap = cashRunningLedger(DB.cashbook); // balance computed over the FULL ledger, not just the filtered slice
  const allRows = filtered.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.srNo - a.srNo);
  const { pageRows: rows, totalPages, start } = paginateRows(allRows, 'cashbook');

  const tbody = document.getElementById('cashTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="13">No cash book entries match these filters.</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(e => `
      <tr>
        <td class="mono">${esc(e.voucherNo)}</td>
        <td>${fmtDateDMY(e.date)}</td>
        <td><span class="badge ${e.tranType === 'Receipt' ? 'green' : 'red'}">${esc(e.tranType)}</span></td>
        <td>${esc(e.category)}<br><span style="color:var(--text-dim);font-size:11px">${esc(e.group || '')}</span></td>
        <td>${esc(e.particulars || '—')}</td>
        <td>${esc(e.stakeholder || '—')}</td>
        <td>${esc(e.mode || 'Cash')}</td>
        <td class="num admin-only" style="color:var(--accent)">${e.tranType === 'Receipt' ? money(e.amount) : '—'}</td>
        <td class="num admin-only" style="color:var(--red)">${e.tranType === 'Payment' ? money(e.amount) : '—'}</td>
        <td class="num admin-only"><b>${money(balanceMap[e.id])}</b></td>
        <td style="color:var(--text-dim);font-size:12px;">${e.createdAt ? fmtDateTime(e.createdAt) : '—'}</td>
        <td>${approvalBadgeHTML(e.approvalStatus)} ${approveActionHTML('cashbook', e.id, e.approvalStatus)}</td>
        <td class="center">
          <div class="rowbtns">
            ${isLockedForCurrentUser(e.approvalStatus) ? '' : `<button class="btn icon" onclick="openCashForm('${e.id}')" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>`}
            <button class="btn icon danger admin-only" onclick="deleteRecord('cashbook','${e.id}')" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6"/></svg></button>
          </div>
        </td>
      </tr>`).join('');
  }
  document.getElementById('cashCount').textContent = allRows.length + ' of ' + DB.cashbook.length;
  renderPaginationBar('cashbookPagination', 'cashbook', allRows.length, totalPages, start);

  const totalReceipt = filtered.filter(e => e.tranType === 'Receipt').reduce((s, e) => s + e.amount, 0);
  const totalPayment = filtered.filter(e => e.tranType === 'Payment').reduce((s, e) => s + e.amount, 0);
  const allBal = cashRunningLedger(DB.cashbook);
  const latestEntry = DB.cashbook.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.srNo - b.srNo).pop();
  const closingBalance = latestEntry ? allBal[latestEntry.id] : (DB.settings.openingCashBalance || 0);

  document.getElementById('cashKpiOpening').textContent = money(DB.settings.openingCashBalance || 0);
  document.getElementById('cashKpiReceipt').textContent = money(totalReceipt);
  document.getElementById('cashKpiReceiptSub').textContent = `${filtered.filter(e => e.tranType === 'Receipt').length} entries in range`;
  document.getElementById('cashKpiPayment').textContent = money(totalPayment);
  document.getElementById('cashKpiPaymentSub').textContent = `${filtered.filter(e => e.tranType === 'Payment').length} entries in range`;
  document.getElementById('cashKpiClosing').textContent = money(closingBalance);
  document.getElementById('cashKpiClosingSub').textContent = 'As of latest entry';

  renderCashCategoryChart(filtered);
  renderCashTrendChart(filtered);
}

/* ---------------- Income & Expenditure Statement — Admin only ----------------
   Built entirely from real Cash Book data: Approved entries only, within
   the chosen date range, grouped by each entry's real group/category —
   never invented figures, and never the sample layout's placeholder
   categories (Interest Received, Bank Charges, etc.) that don't actually
   exist in this system's real Cash Book categories. */
function incomeExpenditureData() {
  const from = document.getElementById('iesFrom')?.value || '';
  const to = document.getElementById('iesTo')?.value || '';
  const rows = DB.cashbook.filter(e => e.approvalStatus === 'Approved' && inRange(e.date, from, to));

  function grouped(tranType) {
    const byCategory = {};
    rows.filter(e => e.tranType === tranType).forEach(e => {
      const key = e.category || 'Uncategorised';
      byCategory[key] = (byCategory[key] || 0) + (e.amount || 0);
    });
    return Object.keys(byCategory).sort().map(cat => ({ category: cat, amount: byCategory[cat] }));
  }

  const income = grouped('Receipt');
  const expenditure = grouped('Payment');
  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpenditure = expenditure.reduce((s, r) => s + r.amount, 0);

  const openingBalance = Number(DB.settings.openingCashBalance) || 0;
  // Opening balance for THIS period specifically — everything approved
  // before the "from" date, same logic the Cash Book's own running
  // balance already uses, just evaluated up to the period start instead
  // of "now".
  const beforePeriod = DB.cashbook.filter(e => e.approvalStatus === 'Approved' && (!from || e.date < from));
  const periodOpening = openingBalance + beforePeriod.reduce((s, e) => s + (e.tranType === 'Receipt' ? e.amount : -e.amount), 0);
  const periodClosing = periodOpening + totalIncome - totalExpenditure;

  return { from, to, income, expenditure, totalIncome, totalExpenditure, netSurplus: totalIncome - totalExpenditure, periodOpening, periodClosing };
}
function incomeExpenditurePreviewHTML(d) {
  const rowsHTML = (list) => list.length
    ? list.map((r, i) => `<tr><td class="num">${i + 1}</td><td>${esc(r.category)}</td><td class="num">${money(r.amount)}</td></tr>`).join('')
    : `<tr class="empty-row"><td colspan="3">No entries in this period</td></tr>`;
  return `
    <div class="kpi-row" style="grid-template-columns:repeat(3,1fr);">
      <div class="kpi"><div class="lbl">Total income</div><div class="val">${money(d.totalIncome)}</div></div>
      <div class="kpi red"><div class="lbl">Total expenditure</div><div class="val">${money(d.totalExpenditure)}</div></div>
      <div class="kpi blue"><div class="lbl">Net surplus</div><div class="val">${money(d.netSurplus)}</div></div>
    </div>
    <div class="grid-2">
      <div>
        <h3 style="font-size:13px;margin:0 0 8px;">A. Income</h3>
        <table class="pivot"><thead><tr><th>Sr</th><th>Income head</th><th class="num">Amount (₹)</th></tr></thead>
        <tbody>${rowsHTML(d.income)}</tbody>
        <tfoot><tr class="total-row"><td colspan="2">Total Income (A)</td><td class="num">${money(d.totalIncome)}</td></tr></tfoot></table>
      </div>
      <div>
        <h3 style="font-size:13px;margin:0 0 8px;">B. Expenditure</h3>
        <table class="pivot"><thead><tr><th>Sr</th><th>Expense head</th><th class="num">Amount (₹)</th></tr></thead>
        <tbody>${rowsHTML(d.expenditure)}</tbody>
        <tfoot><tr class="total-row"><td colspan="2">Total Expenditure (B)</td><td class="num">${money(d.totalExpenditure)}</td></tr></tfoot></table>
      </div>
    </div>
    <div class="card" style="margin-top:16px;background:var(--brand-dim);border-color:#f6d2b8;">
      <div class="card-pad" style="display:flex;justify-content:space-between;align-items:center;">
        <b>Net Surplus (A − B)</b><b style="font-size:18px;color:var(--brand);">${money(d.netSurplus)}</b>
      </div>
    </div>
    <div class="grid-2" style="margin-top:16px;">
      <div class="bill-box">
        <h4>Cash Book summary (for period)</h4>
        <div class="row"><span>Opening balance${d.from ? ' (' + fmtDate(d.from) + ')' : ''}</span><span>${money(d.periodOpening)}</span></div>
        <div class="row"><span>Total receipts</span><span>${money(d.totalIncome)}</span></div>
        <div class="row"><span>Total payments</span><span>${money(d.totalExpenditure)}</span></div>
        <div class="row"><span>Closing balance${d.to ? ' (' + fmtDate(d.to) + ')' : ''}</span><span>${money(d.periodClosing)}</span></div>
      </div>
      <div class="bill-box">
        <h4>Notes</h4>
        <div style="font-size:12px;color:var(--text-dim);line-height:1.6;">
          This statement is generated from Approved Daily Cash Book entries only.<br>
          It includes all Receipts (Income) and Payments (Expenditure) recorded between the selected dates.<br>
          This report is auto-generated from live records and cannot be edited manually.
        </div>
      </div>
    </div>`;
}
function renderIncomeExpenditure() {
  if (!isAdmin()) return;
  const area = document.getElementById('iesPreviewArea');
  if (!area) return;
  const fromEl = document.getElementById('iesFrom');
  const toEl = document.getElementById('iesTo');
  if (fromEl && !fromEl.value && !fromEl.dataset.defaulted) {
    const today = new Date();
    fromEl.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    fromEl.dataset.defaulted = '1';
  }
  if (toEl && !toEl.value && !toEl.dataset.defaulted) {
    toEl.value = todayISO();
    toEl.dataset.defaulted = '1';
  }
  area.innerHTML = incomeExpenditurePreviewHTML(incomeExpenditureData());
}
function exportIncomeExpenditureXLSX() {
  const d = incomeExpenditureData();
  const rows = [];
  rows.push(['Electronics Service Center — Income & Expenditure Statement']);
  rows.push(['Period', `${d.from || 'All'} to ${d.to || 'All'}`]);
  rows.push([]);
  rows.push(['A. INCOME', '', '']);
  rows.push(['Sr', 'Income head', 'Amount']);
  d.income.forEach((r, i) => rows.push([i + 1, r.category, r.amount]));
  rows.push(['', 'Total Income (A)', d.totalIncome]);
  rows.push([]);
  rows.push(['B. EXPENDITURE', '', '']);
  rows.push(['Sr', 'Expense head', 'Amount']);
  d.expenditure.forEach((r, i) => rows.push([i + 1, r.category, r.amount]));
  rows.push(['', 'Total Expenditure (B)', d.totalExpenditure]);
  rows.push([]);
  rows.push(['Net Surplus (A - B)', '', d.netSurplus]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Income-Expenditure');
  XLSX.writeFile(wb, `Income_Expenditure_${d.from || 'all'}_to_${d.to || 'all'}.xlsx`);
}
function printIncomeExpenditure() {
  const d = incomeExpenditureData();
  const el = document.getElementById('incexpPrintArea');
  el.innerHTML = `
    <div class="bill">
      <div class="bill-head">
        <div class="bill-co">
          <div class="bill-logo brand-mark bill-mark" aria-hidden="true"><span>ES</span></div>
          <div>
            <h1>${esc(COMPANY_NAME)}</h1>
            <div class="co-sub">Income &amp; Expenditure Statement</div>
            <div class="co-sub">${esc(COMPANY_SUBTITLE)}</div>
          </div>
        </div>
        <div class="bill-tag">
          <div style="font-size:10.5px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;">Period</div>
          <div class="no">${d.from ? fmtDate(d.from) : 'All'} — ${d.to ? fmtDate(d.to) : 'Today'}</div>
        </div>
      </div>
      ${incomeExpenditurePreviewHTML(d)}
      <div class="bill-sign" style="margin-top:26px;"><div class="line">Authorised signatory</div></div>
    </div>`;
  printInNewWindow('incexpPrintArea', 'Income & Expenditure Statement');
}
function renderCashCategoryChart(filtered) {
  const canvas = document.getElementById('cashCategoryChart');
  if (!canvas || typeof Chart === 'undefined') return;
  const byCat = {};
  filtered.forEach(e => {
    const key = `${e.tranType}: ${e.category}`;
    byCat[key] = (byCat[key] || 0) + e.amount;
  });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (cashChartInstance) { cashChartInstance.destroy(); cashChartInstance = null; }
  if (!entries.length) return;
  cashChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([k]) => k.startsWith('Receipt') ? '#1f9d55' : '#c0392b') }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => money(ctx.raw) } } },
      scales: { x: { ticks: { callback: v => '₹' + v } } }
    }
  });
}
function renderCashTrendChart(filtered) {
  const canvas = document.getElementById('cashTrendChart');
  if (!canvas || typeof Chart === 'undefined') return;
  const byDate = {};
  filtered.forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = { receipt: 0, payment: 0 };
    byDate[e.date][e.tranType === 'Receipt' ? 'receipt' : 'payment'] += e.amount;
  });
  const dates = Object.keys(byDate).sort();
  if (cashTrendChartInstance) { cashTrendChartInstance.destroy(); cashTrendChartInstance = null; }
  if (!dates.length) return;
  cashTrendChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: dates.map(fmtDate),
      datasets: [
        { label: 'Receipts', data: dates.map(d => byDate[d].receipt), borderColor: '#1f9d55', backgroundColor: 'rgba(31,157,85,.12)', fill: true, tension: .25 },
        { label: 'Payments', data: dates.map(d => byDate[d].payment), borderColor: '#c0392b', backgroundColor: 'rgba(192,57,43,.12)', fill: true, tension: .25 }
      ]
    },
    options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, scales: { y: { ticks: { callback: v => '₹' + v } } } }
  });
}
async function saveOpeningBalance() {
  const v = Number(document.getElementById('openingBalanceInput').value) || 0;
  try {
    await apiFetch('/settings/openingCashBalance', { method: 'PUT', body: { value: v } });
    DB.settings.openingCashBalance = v;
    toast('Opening balance saved');
  } catch (e) {
    toast(e.message);
  }
}
function renderCashCategoryEditor() {
  const wrap = document.getElementById('cashCategoryList');
  if (!wrap) return;
  const groups = {};
  DB.cashCategories.forEach(c => { const k = c.type + '||' + c.group; if (!groups[k]) groups[k] = []; groups[k].push(c); });
  wrap.innerHTML = Object.keys(groups).sort().map(k => {
    const [type, group] = k.split('||');
    return `<div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">${esc(type)} — ${esc(group)}</div>
      <div class="table-wrap short">
        <table>
          <tbody>
            ${groups[k].map(c => `
              <tr>
                <td>${esc(c.category)}</td>
                <td class="center" style="width:70px;">
                  <button class="btn icon danger" onclick="removeCashCategory(${c.id})" title="Remove">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6"/></svg>
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}
async function addCashCategory() {
  const type = document.getElementById('newCatType').value;
  const group = document.getElementById('newCatGroup').value.trim();
  const category = document.getElementById('newCatName').value.trim();
  if (!group || !category) { toast('Enter both a group and a category name'); return; }
  if (DB.cashCategories.find(c => c.category === category && c.type === type)) { toast('That category already exists'); return; }
  try {
    await apiFetch('/cashbook/categories', { method: 'POST', body: { type, group, category } });
    await loadCashCategoriesFromServer();
    document.getElementById('newCatName').value = '';
    renderCashCategoryEditor();
    toast('Category added');
  } catch (e) {
    toast(e.message);
  }
}
async function removeCashCategory(id) {
  if (!confirm('Remove this category? This cannot be undone.')) return;
  try {
    await apiFetch('/cashbook/categories/' + id, { method: 'DELETE' });
    await loadCashCategoriesFromServer();
    renderCashCategoryEditor();
    toast('Category removed');
  } catch (e) {
    toast(e.message);
  }
}
