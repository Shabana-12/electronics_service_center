/* Dashboard KPIs, technician metrics and stock summaries. */

/* =========================================================================
   DASHBOARD — KPIs + PivotTable2 (Service Center Billing Summary) + others
   ========================================================================= */
function dashboardRange() {
  return { from: document.getElementById('dashFrom')?.value || '', to: document.getElementById('dashTo')?.value || '' };
}
function inRange(date, from, to) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}
function renderDashboard() {
  const { from, to } = dashboardRange();
  const calls = DB.calls.filter(c => inRange(c.date, from, to));
  const purchases = DB.purchases.filter(p => inRange(p.date, from, to));
  const inv = DB.inventory.filter(v => inRange(v.date, from, to));

  // KPIs
  const totalBill = calls.reduce((s, c) => s + (c.billAmount || 0), 0);
  const pending = calls.filter(c => c.status === 'Pending').length;
  const done = calls.filter(c => c.status === 'Installation Done' || c.status === 'Repair Done').length;
  const totalPurchase = purchases.filter(p => p.type === 'Purchase').reduce((s, p) => s + p.debit, 0);
  const totalConsumed = inv.filter(v => v.type === 'Debit').reduce((s, v) => s + v.amount, 0);

  document.getElementById('kpiCalls').textContent = calls.length;
  document.getElementById('kpiCallsSub').textContent = `${done} done · ${pending} pending`;
  document.getElementById('kpiBilling').textContent = money(totalBill);
  document.getElementById('kpiBillingSub').textContent = `${calls.length} tickets in range`;
  document.getElementById('kpiPurchase').textContent = money(totalPurchase);
  document.getElementById('kpiPurchaseSub').textContent = `${purchases.length} ledger entries`;
  document.getElementById('kpiConsumed').textContent = money(totalConsumed);
  document.getElementById('kpiConsumedSub').textContent = `${inv.length} ledger entries`;
  const netStockValue = totalPurchase - totalConsumed;
  document.getElementById('kpiNet').textContent = money(netStockValue);
  document.getElementById('kpiNetSub').textContent = 'Purchases − consumption';

  // Revenue split by ticket source — admin-only visibility (staff must not see direct-customer income)
  const brandCalls = calls.filter(c => c.warranty === 'Yes');
  const directCalls = calls.filter(c => c.warranty !== 'Yes');
  const brandIncome = brandCalls.reduce((s, c) => s + (c.billAmount || 0), 0);
  const directIncome = directCalls.reduce((s, c) => s + (c.billAmount || 0), 0);
  document.getElementById('kpiBrandCount').textContent = brandCalls.length;
  document.getElementById('kpiBrandIncome').textContent = money(brandIncome);
  document.getElementById('kpiDirectCount').textContent = directCalls.length;
  document.getElementById('kpiDirectIncome').textContent = money(directIncome);
  document.getElementById('kpiSourceTotalCount').textContent = calls.length;
  document.getElementById('kpiSourceTotalIncome').textContent = money(brandIncome + directIncome);

  // Cash Book summary + Net Profit — Admin-only cards; DB.cashbook is only
  // ever loaded for Admin, so these are simply no-ops (hidden anyway) for Staff.
  if (isAdmin()) {
    const cashInRange = DB.cashbook.filter(e => inRange(e.date, from, to));
    const cashReceipts = cashInRange.filter(e => e.tranType === 'Receipt').reduce((s, e) => s + e.amount, 0);
    const cashPayments = cashInRange.filter(e => e.tranType === 'Payment').reduce((s, e) => s + e.amount, 0);
    const opening = DB.settings.openingCashBalance || 0;
    const allSorted = DB.cashbook.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.srNo - b.srNo);
    let runningBal = opening;
    allSorted.forEach(e => { runningBal += (e.tranType === 'Receipt' ? e.amount : -e.amount); });
    document.getElementById('dashCashOpening').textContent = money(opening);
    document.getElementById('dashCashReceipt').textContent = money(cashReceipts);
    document.getElementById('dashCashPayment').textContent = money(cashPayments);
    document.getElementById('dashCashClosing').textContent = money(runningBal);

    const directNoWarranty = calls.filter(c => c.warranty === 'No');
    const billedTotal = directNoWarranty.reduce((s, c) => s + (c.billAmount || 0), 0);
    const costTotal = directNoWarranty.reduce((s, c) => s + (c.materialCost || 0), 0);
    document.getElementById('dashProfitBilled').textContent = money(billedTotal);
    document.getElementById('dashProfitCost').textContent = money(costTotal);
    document.getElementById('dashProfitNet').textContent = money(billedTotal - costTotal);
  }

  renderStockSummary();
  renderPivotFullConsumption(inv);
  renderTechKpi(calls, 'techKpiBody', 'techKpiFoot');
}

// ---- Technician work KPI: tickets assigned vs completed, avg turnaround ----
function callTurnaroundDays(c) {
  if (!c.date || !c.completedDate) return null;
  const d1 = new Date(c.date + 'T00:00:00'), d2 = new Date(c.completedDate + 'T00:00:00');
  const days = Math.round((d2 - d1) / 86400000);
  return (!isNaN(days) && days >= 0) ? days : null;
}
// Display-only version for the Tickets table's TAT column: a still-Pending
// ticket shows a LIVE running count (today minus entry date) instead of a
// blank dash, so staff/admin can see how long it's actually been open.
// Deliberately separate from callTurnaroundDays() above — SLA compliance
// and average-turnaround stats must only ever count genuinely completed
// tickets, never an in-progress one.
function callTurnaroundDaysForDisplay(c) {
  const finished = callTurnaroundDays(c);
  if (finished != null) return finished;
  if (c.status === 'Pending' && c.date) {
    const d1 = new Date(c.date + 'T00:00:00'), today = new Date(todayISO() + 'T00:00:00');
    const days = Math.round((today - d1) / 86400000);
    return (!isNaN(days) && days >= 0) ? days : null;
  }
  return null;
}
function computeTechKpiRows(calls) {
  const byTech = {};
  const target = DB.settings.slaTargetDays || 3;
  calls.forEach(c => {
    const t = c.technician || 'Unassigned';
    if (!byTech[t]) byTech[t] = { assigned: 0, completed: 0, pending: 0, cancelled: 0, turnarounds: [], slaAchieved: 0, slaBreached: 0 };
    byTech[t].assigned++;
    if (c.status === 'Installation Done' || c.status === 'Repair Done') {
      byTech[t].completed++;
      const days = callTurnaroundDays(c);
      if (days != null) {
        byTech[t].turnarounds.push(days);
        if (days <= target) byTech[t].slaAchieved++; else byTech[t].slaBreached++;
      }
    } else if (c.status === 'Pending') byTech[t].pending++;
    else if (c.status === 'Cancelled') byTech[t].cancelled++;
  });
  return Object.keys(byTech).sort().map(t => {
    const r = byTech[t];
    const completionPct = r.assigned ? Math.round((r.completed / r.assigned) * 100) : 0;
    const avgTurnaround = r.turnarounds.length ? (r.turnarounds.reduce((a, b) => a + b, 0) / r.turnarounds.length) : null;
    const slaTotal = r.slaAchieved + r.slaBreached;
    const slaPct = slaTotal ? Math.round((r.slaAchieved / slaTotal) * 100) : null;
    return { technician: t, ...r, completionPct, avgTurnaround, slaPct };
  });
}
function renderTechKpi(calls, bodyId, footId) {
  const rows = computeTechKpiRows(calls);
  const tbody = document.getElementById(bodyId);
  const tfoot = document.getElementById(footId);
  if (!rows.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No service calls in this date range.</td></tr>`; tfoot.innerHTML = ''; renderTechKpiBarChart([]); return; }
  let tA = 0, tC = 0, tP = 0, tX = 0, allTurn = [];
  tbody.innerHTML = rows.map(r => {
    tA += r.assigned; tC += r.completed; tP += r.pending; tX += r.cancelled; allTurn = allTurn.concat(r.turnarounds);
    return `<tr><td><b>${esc(r.technician)}</b></td><td class="num">${r.assigned}</td><td class="num">${r.completed}</td><td class="num">${r.pending}</td><td class="num">${r.cancelled}</td><td class="num">${r.completionPct}%</td><td class="num">${r.avgTurnaround != null ? r.avgTurnaround.toFixed(1) : '—'}</td></tr>`;
  }).join('');
  const overallPct = tA ? Math.round((tC / tA) * 100) : 0;
  const overallAvg = allTurn.length ? (allTurn.reduce((a, b) => a + b, 0) / allTurn.length).toFixed(1) : '—';
  tfoot.innerHTML = `<tr class="total-row"><td>Grand Total</td><td class="num">${tA}</td><td class="num">${tC}</td><td class="num">${tP}</td><td class="num">${tX}</td><td class="num">${overallPct}%</td><td class="num">${overallAvg}</td></tr>`;
  renderTechKpiBarChart(rows);
  renderSlaAchievementChart(rows);
}
function renderTechKpiBarChart(rows) {
  const canvas = document.getElementById('techKpiBarChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (techKpiBarChartInstance) { techKpiBarChartInstance.destroy(); techKpiBarChartInstance = null; }
  const wrap = document.getElementById('techKpiBarWrap');
  if (!rows.length) { if (wrap) wrap.style.display = 'none'; return; }
  if (wrap) wrap.style.display = '';
  const labels = rows.map(r => r.technician);
  // Truly responsive: the chart always fits the card's actual width — bars
  // get thinner as more technicians are added, rather than the chart
  // itself growing wider and needing horizontal scroll.
  canvas.style.width = '100%';
  canvas.style.height = '';
  techKpiBarChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Assigned', data: rows.map(r => r.assigned), backgroundColor: CHART_PALETTE[1] },
        { label: 'Completed', data: rows.map(r => r.completed), backgroundColor: CHART_PALETTE[0] },
        { label: 'Pending', data: rows.map(r => r.pending), backgroundColor: CHART_PALETTE[2] },
        { label: 'Cancelled', data: rows.map(r => r.cancelled), backgroundColor: CHART_PALETTE[3] }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      barPercentage: 0.85,
      categoryPercentage: labels.length > 8 ? 0.9 : 0.7,
      scales: {
        x: { ticks: { font: { size: 10.5 }, maxRotation: 60, minRotation: labels.length > 6 ? 45 : 0 } },
        y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } }
      },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11.5 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw}` } }
      }
    }
  });
}

// ---- Chart colour palette (matches the app's own accent colours) ----
const CHART_PALETTE = ['#1f9d55', '#2563a6', '#c8790a', '#c0392b', '#6b4fa0', '#0e7c86', '#8a8f98', '#a5443a'];
let techKpiBarChartInstance = null;
let slaAchievementChartInstance = null;
// A focused second view, deliberately separate from the Assigned/Completed
// bar chart above: this one only answers "did completed jobs land within
// the SLA target?" — technicians with zero completed+timestamped jobs in
// range are left out entirely rather than showing a misleading 0%.
function renderSlaAchievementChart(rows) {
  const canvas = document.getElementById('slaAchievementChart');
  const wrap = document.getElementById('slaAchievementWrap');
  if (!canvas || typeof Chart === 'undefined') return;
  if (slaAchievementChartInstance) { slaAchievementChartInstance.destroy(); slaAchievementChartInstance = null; }
  const withSla = rows.filter(r => (r.slaAchieved + r.slaBreached) > 0);
  if (!withSla.length) { if (wrap) wrap.style.display = 'none'; return; }
  if (wrap) wrap.style.display = '';
  const labels = withSla.map(r => r.technician);
  // Capped, compact, and genuinely responsive — grows a little with more
  // technicians so bars stay legible, but never balloons past a sensible
  // height, and always fills the card's actual width rather than a fixed
  // pixel size.
  const heightPx = Math.min(360, Math.max(180, labels.length * 26 + 50));
  canvas.style.height = heightPx + 'px';
  canvas.style.width = '100%';
  const target = DB.settings.slaTargetDays || 3;
  slaAchievementChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: `Within ${target}-day SLA`, data: withSla.map(r => r.slaPct), backgroundColor: CHART_PALETTE[0] },
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      barPercentage: 0.8,
      categoryPercentage: 0.85,
      scales: { x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%', font: { size: 10.5 } } }, y: { ticks: { font: { size: 11 } } } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => {
          const r = withSla[ctx.dataIndex];
          return `${r.slaPct}% within SLA (${r.slaAchieved} of ${r.slaAchieved + r.slaBreached} completed jobs)`;
        } } }
      }
    }
  });
}

// ---- Debit/Credit breakdown by Debited-to × Material × Client/Brand ----
function renderPivotFullConsumption(inv) {
  const groups = {};
  inv.forEach(v => {
    const key = [v.issuedTo || 'Unknown', v.material || 'Unknown', v.clientBrand || '—', v.partCode || '', v.serial || '', v.size || ''].join('||');
    if (!groups[key]) groups[key] = {
      issuedTo: v.issuedTo || 'Unknown', material: v.material || 'Unknown', clientBrand: v.clientBrand || '—',
      partCode: v.partCode || '', serial: v.serial || '', size: v.size || '',
      debQty: 0, debAmt: 0, credQty: 0, credAmt: 0
    };
    if (v.type === 'Debit') { groups[key].debQty += v.qty; groups[key].debAmt += v.amount; }
    else { groups[key].credQty += v.qty; groups[key].credAmt += v.amount; }
  });
  const rows = Object.values(groups)
    .filter(r => (r.debQty - r.credQty) > 0) // balance-only — technician still holds stock for this line
    .sort((a, b) => a.issuedTo.localeCompare(b.issuedTo) || a.material.localeCompare(b.material));
  const tbody = document.getElementById('pivotFullBody');
  const tfoot = document.getElementById('pivotFullFoot');
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9">Nothing outstanding — every part issued in this date range has been returned or fully accounted for.</td></tr>`;
    tfoot.innerHTML = '';
    return;
  }
  let gDQ = 0, gDA = 0, gCQ = 0, gCA = 0;
  tbody.innerHTML = rows.map(r => {
    gDQ += r.debQty; gDA += r.debAmt; gCQ += r.credQty; gCA += r.credAmt;
    const totQty = r.debQty - r.credQty, totAmt = r.debAmt - r.credAmt;
    const specBits = [r.partCode, r.serial, r.size].filter(Boolean);
    const materialCell = `<b>${esc(r.material)}</b>${specBits.length ? `<br><span style="color:var(--text-dim);font-size:11px">${esc(specBits.join(' · '))}</span>` : ''}`;
    return `<tr>
      <td>${esc(r.issuedTo)}</td><td>${materialCell}</td><td>${esc(r.clientBrand)}</td>
      <td class="num">${r.debQty || '—'}</td><td class="num">${r.debAmt ? money(r.debAmt) : '—'}</td>
      <td class="num">${r.credQty || '—'}</td><td class="num">${r.credAmt ? money(r.credAmt) : '—'}</td>
      <td class="num"><b>${totQty}</b></td><td class="num"><b>${money(totAmt)}</b></td>
    </tr>`;
  }).join('');
  tfoot.innerHTML = `<tr class="total-row"><td colspan="3">Grand Total</td><td class="num">${gDQ}</td><td class="num">${money(gDA)}</td><td class="num">${gCQ}</td><td class="num">${money(gCA)}</td><td class="num">${gDQ - gCQ}</td><td class="num">${money(gDA - gCA)}</td></tr>`;
}

// ---- Stock summary (all-time, not date filtered — running stock position) — by Material × Brand × Part code × Size ----
function renderStockSummary() {
  const byKey = {};
  DB.purchases.forEach(p => {
    const key = [p.material || 'Unknown', p.supplierBrand || '—', p.partCode || '—', p.size || '—'].join('||');
    if (!byKey[key]) byKey[key] = { material: p.material || 'Unknown', brand: p.supplierBrand || '—', partCode: p.partCode || '—', size: p.size || '—', inQty: 0, outQty: 0, valueIn: 0, valueOut: 0 };
    byKey[key].inQty += p.type === 'Purchase' ? p.qty : -p.qty;
    byKey[key].valueIn += p.debit - p.credit;
  });
  DB.inventory.forEach(v => {
    const key = [v.material || 'Unknown', v.clientBrand || '—', v.partCode || '—', v.size || '—'].join('||');
    if (!byKey[key]) byKey[key] = { material: v.material || 'Unknown', brand: v.clientBrand || '—', partCode: v.partCode || '—', size: v.size || '—', inQty: 0, outQty: 0, valueIn: 0, valueOut: 0 };
    byKey[key].outQty += v.type === 'Debit' ? v.qty : -v.qty;
    byKey[key].valueOut += v.type === 'Debit' ? v.amount : -v.amount;
  });
  const rows = Object.values(byKey).sort((a, b) => a.material.localeCompare(b.material) || a.brand.localeCompare(b.brand) || a.partCode.localeCompare(b.partCode) || a.size.localeCompare(b.size));
  const tbody = document.getElementById('stockSummaryBody');
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No purchases or inventory movement recorded yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const net = r.inQty - r.outQty;
    const netVal = r.valueIn - r.valueOut;
    const cls = net < 0 ? 'stock-neg' : (net <= 2 ? 'stock-low' : '');
    return `<tr><td>${esc(r.material)}</td><td>${esc(r.brand)}</td><td>${esc(r.partCode)}</td><td>${esc(r.size)}</td><td class="num">${r.inQty}</td><td class="num">${r.outQty}</td><td class="num ${cls}">${net}</td><td class="num">${money(netVal)}</td></tr>`;
  }).join('');
}
