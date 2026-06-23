// js/admin.js
// Admin dashboard logic: platform stats, trend charts, user search/table,
// and the ban/plan/admin/delete actions via the user detail modal.

let currentPage = 1;
let currentSearch = '';
let modalUserId = null;
let modalUserData = null;

document.addEventListener('DOMContentLoaded', async () => {
  const locked = document.getElementById('adminLocked');
  const content = document.getElementById('adminContent');

  if (!Auth.isLoggedIn()) {
    locked.classList.remove('hidden');
    content.classList.add('hidden');
    window.onAuthSuccess = () => window.location.reload();
    return;
  }

  const user = Auth.currentUser();
  if (!user.isAdmin) {
    locked.classList.remove('hidden');
    content.classList.add('hidden');
    document.getElementById('adminLockedTitle').textContent = 'Not authorized';
    document.getElementById('adminLockedSub').textContent = "Your account doesn't have admin access.";
    document.querySelector('#adminLocked .btn').style.display = 'none';
    return;
  }

  locked.classList.add('hidden');
  content.classList.remove('hidden');

  await loadStats();
  await loadUsers(1);

  document.getElementById('userSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadUsers(1);
  });
});

// ═══════════ STATS ═══════════
async function loadStats() {
  try {
    const s = await Admin.stats();

    document.getElementById('kTotalUsers').textContent = s.totalUsers.toLocaleString();
    document.getElementById('kNewUsers').textContent = `${s.newUsersToday} / ${s.newUsersThisWeek}`;
    document.getElementById('kTotalScans').textContent = s.totalScans.toLocaleString();
    document.getElementById('kScansToday').textContent = s.scansToday.toLocaleString();
    document.getElementById('kTotalWords').textContent = s.totalWords.toLocaleString();
    document.getElementById('kBanned').textContent = s.totalBanned.toLocaleString();
    document.getElementById('kRevenue').textContent = '$' + (s.revenueCents / 100).toFixed(2);

    const topTool = s.usageByTool[0];
    document.getElementById('kTopTool').textContent = topTool ? TOOL_LABEL(topTool.tool) : '—';

    renderTrend('signupTrend', s.signupTrend);
    renderTrend('scanTrend', s.scanTrend);
    renderBreakdown('adminToolBreakdown', s.usageByTool.map(t => ({ label: TOOL_LABEL(t.tool), count: t.count })));
    renderBreakdown('planBreakdown', s.planBreakdown.map(p => ({ label: p.plan.charAt(0).toUpperCase() + p.plan.slice(1), count: p.count })));
  } catch (err) {
    showToast('❌ ' + (err.message || 'Could not load platform stats.'));
  }
}

function TOOL_LABEL(tool) {
  const map = { detect: '◎ AI Detector', plagiarism: '⌕ Plagiarism Checker', humanize: '✦ Humanizer', generate: '✎ Content Generator' };
  return map[tool] || tool;
}

function renderTrend(containerId, data) {
  const el = document.getElementById(containerId);
  if (!data || data.length === 0) {
    el.innerHTML = '<div class="trend-empty">No data in the last 14 days yet.</div>';
    return;
  }
  const max = Math.max(...data.map(d => d.count), 1);
  el.innerHTML = data.map(d => {
    const heightPct = Math.max(4, (d.count / max) * 100);
    const day = new Date(d.day + 'T00:00:00Z');
    const label = day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `
      <div class="trend-bar-wrap" title="${d.count} on ${label}">
        <div class="trend-bar" style="height:${heightPct}%"></div>
        <span class="trend-day-label">${label}</span>
      </div>`;
  }).join('');
}

function renderBreakdown(containerId, items) {
  const el = document.getElementById(containerId);
  if (!items || items.length === 0) {
    el.innerHTML = '<p class="empty-state">No data yet.</p>';
    return;
  }
  const max = Math.max(...items.map(i => i.count), 1);
  el.innerHTML = items.map(i => `
    <div class="tool-row">
      <span class="tool-name">${i.label}</span>
      <div class="tool-bar-track"><div class="tool-bar-fill" style="width:${(i.count / max) * 100}%"></div></div>
      <strong>${i.count}</strong>
    </div>`).join('');
}

// ═══════════ USERS TABLE ═══════════
async function loadUsers(page) {
  currentPage = page;
  currentSearch = document.getElementById('userSearchInput').value.trim();

  try {
    const result = await Admin.listUsers({ search: currentSearch, page, pageSize: 25 });
    renderUsersTable(result.users);
    renderPagination(result.total, result.page, result.pageSize);
  } catch (err) {
    showToast('❌ ' + (err.message || 'Could not load users.'));
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No users found.</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><button class="row-name-link" onclick="openUserModal('${u.id}')">${escapeHtml(u.name)}</button>${u.is_admin ? ' <span class="tag tag-gold" style="margin-left:6px;">ADMIN</span>' : ''}</td>
      <td class="muted">${escapeHtml(u.email)}</td>
      <td><span class="tag ${planTagClass(u.plan)}">${u.plan.toUpperCase()}</span></td>
      <td>${u.is_banned ? '<span class="tag tag-crimson">BANNED</span>' : '<span class="tag tag-emerald">ACTIVE</span>'}</td>
      <td class="muted">${formatDate(u.created_at)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openUserModal('${u.id}')">Manage</button></td>
    </tr>`).join('');
}

function planTagClass(plan) {
  if (plan === 'pro') return 'tag-cyan';
  if (plan === 'business') return 'tag-gold';
  return 'tag-emerald';
}

function renderPagination(total, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const row = document.getElementById('paginationRow');
  let html = `<button class="page-btn" ${page <= 1 ? 'disabled' : ''} onclick="loadUsers(${page - 1})">← Prev</button>`;
  html += `<span class="page-btn active">Page ${page} of ${totalPages}</span>`;
  html += `<button class="page-btn" ${page >= totalPages ? 'disabled' : ''} onclick="loadUsers(${page + 1})">Next →</button>`;
  row.innerHTML = html;
}

// ═══════════ USER MODAL ═══════════
async function openUserModal(id) {
  modalUserId = id;
  try {
    const detail = await Admin.getUser(id);
    modalUserData = detail.user;

    document.getElementById('modalUserName').textContent = detail.user.name;
    document.getElementById('modalUserEmail').textContent = detail.user.email;
    document.getElementById('modalUserPlan').textContent = detail.user.plan.charAt(0).toUpperCase() + detail.user.plan.slice(1);
    document.getElementById('modalUserStatus').innerHTML = detail.user.is_banned
      ? '<span class="tag tag-crimson">Banned</span>' : '<span class="tag tag-emerald">Active</span>';
    document.getElementById('modalUserScans').textContent = detail.stats.total;
    document.getElementById('modalUserWords').textContent = detail.stats.wordsProcessed.toLocaleString();
    document.getElementById('modalUserJoined').textContent = formatDate(detail.user.created_at);
    document.getElementById('modalPlanSelect').value = detail.user.plan;
    document.getElementById('modalBanBtn').textContent = detail.user.is_banned ? 'Unban user' : 'Ban user';
    document.getElementById('modalAdminBtn').textContent = detail.user.is_admin ? 'Remove admin' : 'Make admin';

    document.getElementById('userModalOverlay').classList.add('show');
  } catch (err) {
    showToast('❌ ' + (err.message || 'Could not load user.'));
  }
}

function closeUserModal() {
  document.getElementById('userModalOverlay').classList.remove('show');
  modalUserId = null;
  modalUserData = null;
}

async function toggleBanCurrentUser() {
  if (!modalUserId) return;
  try {
    if (modalUserData.is_banned) {
      await Admin.unban(modalUserId);
      showToast('✅ User unbanned.');
    } else {
      await Admin.ban(modalUserId);
      showToast('🔒 User banned.');
    }
    closeUserModal();
    await loadUsers(currentPage);
    await loadStats();
  } catch (err) {
    showToast('❌ ' + (err.message || 'Action failed.'));
  }
}

async function toggleAdminCurrentUser() {
  if (!modalUserId) return;
  try {
    const newValue = !modalUserData.is_admin;
    await Admin.setAdmin(modalUserId, newValue);
    showToast(newValue ? '✅ User is now an admin.' : '✅ Admin access removed.');
    closeUserModal();
    await loadUsers(currentPage);
  } catch (err) {
    showToast('❌ ' + (err.message || 'Action failed.'));
  }
}

async function saveModalPlan() {
  if (!modalUserId) return;
  const plan = document.getElementById('modalPlanSelect').value;
  try {
    await Admin.setPlan(modalUserId, plan);
    showToast('✅ Plan updated.');
    closeUserModal();
    await loadUsers(currentPage);
    await loadStats();
  } catch (err) {
    showToast('❌ ' + (err.message || 'Action failed.'));
  }
}

async function deleteCurrentUser() {
  if (!modalUserId) return;
  const confirmed = confirm(`Permanently delete ${modalUserData.name} (${modalUserData.email})? This cannot be undone.`);
  if (!confirmed) return;
  try {
    await Admin.deleteUser(modalUserId);
    showToast('🗑️ User deleted.');
    closeUserModal();
    await loadUsers(currentPage);
    await loadStats();
  } catch (err) {
    showToast('❌ ' + (err.message || 'Action failed.'));
  }
}

// ═══════════ Helpers ═══════════
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}
