/* Page bootstrap and event wiring. Loaded after all feature modules. */

/* =========================================================================
   Init
   ========================================================================= */
async function init() {
  if (currentPage === 'login') {
    initLoginPage();
    return;
  }

  // Every other page is protected — bounce to /login (or /dashboard, if
  // this is an admin-only page a Staff login shouldn't see) before doing
  // anything else.
  if (!requireAuth()) return;

  initMobileMenu();
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

  const on = (id, event, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  };

  on('callForm', 'submit', saveCallForm);
  on('purchaseForm', 'submit', savePurchaseForm);
  on('inventoryForm', 'submit', saveInventoryForm);
  on('cashForm', 'submit', saveCashForm);
  on('newUserForm', 'submit', saveUserForm);

  ['callFrom', 'callTo', 'callTechFilter', 'callStatusFilter', 'callApprovalFilter', 'callSearch'].forEach(id =>
    on(id, 'input', () => resetPageAndRender('calls')));
  ['purFrom', 'purTo', 'purSupplierFilter'].forEach(id =>
    on(id, 'input', () => resetPageAndRender('purchases')));
  ['invFrom', 'invTo', 'invWhoFilter'].forEach(id =>
    on(id, 'input', () => resetPageAndRender('inventory')));
  ['cashFrom', 'cashTo', 'cashTypeFilter', 'cashSearch'].forEach(id =>
    on(id, 'input', () => resetPageAndRender('cashbook')));
  ['dashFrom', 'dashTo'].forEach(id =>
    on(id, 'input', renderDashboard));
  ['slaFrom', 'slaTo'].forEach(id => on(id, 'input', renderSlaKpi));
  on('repDataset', 'change', renderReportsPreview);
  ['repFrom', 'repTo'].forEach(id => on(id, 'input', renderReportsPreview));
  const refreshAuditLog = async () => { await loadAuditLogFromServer(); renderAuditLog(); };
  ['auditTableFilter', 'auditActionFilter'].forEach(id => on(id, 'change', refreshAuditLog));
  ['auditFrom', 'auditTo'].forEach(id => on(id, 'input', refreshAuditLog));

  const first = new Date(); first.setDate(1);
  const firstOfMonth = first.toISOString().slice(0, 10);
  ['dashFrom', 'slaFrom', 'stmtFrom', 'repFrom', 'cashFrom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = firstOfMonth;
  });

  await renderCurrentPage();
  handleBracketCreditPageHandoff();
}
init();
