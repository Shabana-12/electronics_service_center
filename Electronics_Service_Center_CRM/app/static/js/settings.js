/* Admin settings, user management and master-list maintenance. */

/* =========================================================================
   SETTINGS — validation lists
   ========================================================================= */
function renderSettings() {
  document.getElementById('slaTargetInput').value = DB.settings.slaTargetDays || 3;
  document.getElementById('openingBalanceInput').value = DB.settings.openingCashBalance || 0;
  renderCashCategoryEditor();
  renderListEditor('parts', 'Part name / goods');
  renderListEditor('brands', 'Company / Brand name');
  renderListEditor('brackets', 'Bracket used of');
  renderListEditor('employees', 'Technician / employee / customer');
  renderListEditor('statuses', 'Call status');
  renderListEditor('products', 'Product type');

  const tbody = document.getElementById('usersTbody');
  tbody.innerHTML = DB.users.map(u => `
    <tr style="${u.is_active ? '' : 'opacity:.55;'}">
    <td class="mono">${esc(u.username)}</td><td>${esc(u.name)}</td><td><span class="badge ${u.role === 'Admin' ? 'blue' : 'gray'}">${esc(u.role)}</span></td>
    <td class="center">
      <button class="btn icon" onclick="openEditUsernameForm('${esc(u.username)}')" title="Edit username">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      </button>
      <button class="btn icon" onclick="openResetPasswordForm('${esc(u.username)}')" title="Reset password">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </button>
      ${u.username !== currentUser.username ? `<button class="btn sm ${u.is_active ? '' : 'accent'}" onclick="toggleUserActive('${esc(u.username)}', ${u.is_active ? 'true' : 'false'})" title="${u.is_active ? 'Deactivate — blocks login' : 'Activate — allows login'}">${u.is_active ? 'Active' : 'Inactive'}</button>` : '<span class="badge green">Active (you)</span>'}
    </td></tr>`).join('');
}
async function toggleUserActive(username, currentlyActive) {
  const goingTo = currentlyActive ? 'deactivate' : 'activate';
  if (!confirm(`${goingTo === 'deactivate' ? 'Deactivate' : 'Activate'} "${username}"? ${goingTo === 'deactivate' ? 'They will not be able to log in until reactivated.' : 'They will be able to log in again.'}`)) return;
  try {
    await apiFetch('/users/' + encodeURIComponent(username) + '/active', { method: 'PUT', body: { active: !currentlyActive } });
    await loadUsersFromServer();
    renderSettings();
    toast(`${username} ${!currentlyActive ? 'activated' : 'deactivated'}`);
  } catch (err) {
    toast(err.message);
  }
}
function openEditUsernameForm(username) {
  document.getElementById('eu_oldUsername').value = username;
  document.getElementById('eu_oldUsernameLabel').textContent = username;
  document.getElementById('eu_newUsername').value = username;
  document.getElementById('editUsernameModal').classList.add('open');
}
function closeEditUsernameForm() { document.getElementById('editUsernameModal').classList.remove('open'); }
async function saveEditUsernameForm(e) {
  e.preventDefault();
  const oldUsername = document.getElementById('eu_oldUsername').value;
  const newUsername = document.getElementById('eu_newUsername').value.trim();
  try {
    await apiFetch('/users/' + encodeURIComponent(oldUsername) + '/username', { method: 'PUT', body: { newUsername } });
    closeEditUsernameForm();
    toast(newUsername === oldUsername ? 'No change made' : `Username updated to ${newUsername}`);
    await loadUsersFromServer();
    renderSettings();
  } catch (e) {
    toast(e.message);
  }
}
function openResetPasswordForm(username) {
  document.getElementById('rp_username').value = username;
  document.getElementById('rp_password').value = '';
  document.getElementById('rp_password2').value = '';
  document.getElementById('rp_currentPassword').value = '';
  document.getElementById('rp_mismatchHint').style.display = 'none';
  const isSelf = username === currentUser.username;
  document.getElementById('rp_title').textContent = isSelf ? 'Change your password' : 'Reset password';
  document.getElementById('rp_currentPasswordField').style.display = isSelf ? '' : 'none';
  document.getElementById('rp_currentPassword').required = isSelf;
  document.getElementById('rp_intro').textContent = isSelf
    ? 'Enter your current password, then the new one — twice, so we know it was typed correctly.'
    : `Setting a new password for ${username}. They'll need to use it next time they sign in — nothing else about their account changes.`;
  initGenericPasswordToggles(document.getElementById('resetPasswordModal'));
  document.getElementById('resetPasswordModal').classList.add('open');
}
function closeResetPasswordForm() { document.getElementById('resetPasswordModal').classList.remove('open'); }
async function saveResetPasswordForm(e) {
  e.preventDefault();
  const username = document.getElementById('rp_username').value;
  const password = document.getElementById('rp_password').value;
  const password2 = document.getElementById('rp_password2').value;
  if (password !== password2) {
    document.getElementById('rp_mismatchHint').style.display = '';
    return;
  }
  document.getElementById('rp_mismatchHint').style.display = 'none';
  const body = { password };
  const isSelf = username === currentUser.username;
  if (isSelf) body.currentPassword = document.getElementById('rp_currentPassword').value;
  try {
    await apiFetch('/users/' + encodeURIComponent(username) + '/password', { method: 'PUT', body });
    closeResetPasswordForm();
    if (isSelf) {
      toast('Password updated — please sign in again');
      doLogout();
    } else {
      toast(`Password updated for ${username}`);
    }
  } catch (e) {
    toast(e.message);
  }
}
async function saveSlaTarget() {
  const v = Number(document.getElementById('slaTargetInput').value) || 3;
  try {
    await apiFetch('/settings/slaTargetDays', { method: 'PUT', body: { value: v } });
    DB.settings.slaTargetDays = v;
    toast('SLA target saved');
  } catch (e) {
    toast(e.message);
  }
}
function renderListEditor(key, label) {
  const wrap = document.getElementById('list_' + key);
  const items = DB.lists[key];
  wrap.innerHTML = `
    <div class="card-head"><h3>${label}</h3><span class="tag">${items.length} items</span></div>
    <div class="card-pad">
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <input id="newitem_${key}" placeholder="Add new ${label.toLowerCase()}…" style="flex:1;padding:8px 10px;border:1px solid #d7dde1;border-radius:5px;">
        <button class="btn accent sm" onclick="addListItem('${key}')">Add</button>
      </div>
    </div>
    <div class="table-wrap short">
      <table>
        <thead><tr><th style="width:50px;">#</th><th>${label}</th><th class="center" style="width:90px;">Actions</th></tr></thead>
        <tbody id="taglist_${key}">
          ${items.length ? items.map((v, i) => `
            <tr>
              <td class="mono" style="color:var(--text-dim);">${i + 1}</td>
              <td>${esc(v)}</td>
              <td class="center">
                <button class="btn icon danger" onclick="removeListItem('${key}', ${JSON.stringify(v)})" title="Remove">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6"/></svg>
                </button>
              </td>
            </tr>`).join('') : `<tr class="empty-row"><td colspan="3">Nothing added yet.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}
async function addListItem(key) {
  const input = document.getElementById('newitem_' + key);
  const v = input.value.trim();
  if (!v) return;
  if (DB.lists[key].includes(v)) { toast('Already in the list'); return; }
  try {
    await apiFetch('/lists/' + key, { method: 'POST', body: { value: v } });
    DB.lists[key].push(v);
    input.value = '';
    renderSettings();
    toast('Added to list');
  } catch (e) {
    toast(e.message);
  }
}
async function removeListItem(key, v) {
  if (!confirm(`Remove "${v}" from this list? This cannot be undone.`)) return;
  try {
    await apiFetch('/lists/' + key + '/' + encodeURIComponent(v), { method: 'DELETE' });
    DB.lists[key] = DB.lists[key].filter(x => x !== v);
    renderSettings();
    toast('Removed from list');
  } catch (e) {
    toast(e.message);
  }
}
function openUserForm() { document.getElementById('userModal').classList.add('open'); document.getElementById('newUserForm').reset(); }
function closeUserForm() { document.getElementById('userModal').classList.remove('open'); }
async function saveUserForm(e) {
  e.preventDefault();
  const username = document.getElementById('nu_username').value.trim();
  const name = document.getElementById('nu_name').value.trim();
  const password = document.getElementById('nu_password').value;
  const role = document.getElementById('nu_role').value;
  if (DB.users.find(u => u.username.toLowerCase() === username.toLowerCase())) { toast('Username already exists'); return; }
  try {
    await apiFetch('/users', { method: 'POST', body: { username, name, password, role } });
    await loadUsersFromServer();
    closeUserForm();
    renderSettings();
    toast('User created');
  } catch (e) {
    toast(e.message);
  }
}
async function deleteUser(username) {
  if (!confirm('Remove this user login?')) return;
  try {
    await apiFetch('/users/' + encodeURIComponent(username), { method: 'DELETE' });
    await loadUsersFromServer();
    renderSettings();
    toast('User removed');
  } catch (e) {
    toast(e.message);
  }
}
