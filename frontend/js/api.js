// js/api.js
// Shared API client, auth-state helpers, and anonymous-trial id management.
// Loaded on every page before the page-specific script.

const API_BASE = (() => {
  // Same-origin deployment by default. Override window.__AIPLAGO_API__
  // before this script loads if the frontend is hosted separately from the backend.
  if (window.__AIPLAGO_API__) return window.__AIPLAGO_API__;
  return '/api';
})();

const AUTH_TOKEN_KEY = 'aiplago_token';
const AUTH_USER_KEY = 'aiplago_user';
const ANON_ID_KEY = 'aiplago_anon_id';

// ── Anonymous client id (for free-trial tracking before signup) ──
function getAnonId() {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = 'anon_' + crypto.randomUUID();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

// ── Auth state ──
function getToken() { return localStorage.getItem(AUTH_TOKEN_KEY); }
function getStoredUser() {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  return raw ? JSON.parse(raw) : null;
}
function setSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}
function isLoggedIn() { return !!getToken(); }

// ── Core request helper ──
async function apiRequest(path, { method = 'GET', body = null, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (!token) headers['x-anon-id'] = getAnonId();

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: isForm ? body : (body ? JSON.stringify(body) : undefined),
  });

  let data;
  try { data = await res.json(); } catch (e) { data = {}; }

  if (!res.ok) {
    const err = new Error(data.error || data.message || 'Request failed.');
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

// ── Auth API ──
const Auth = {
  async signup(name, email, password) {
    const data = await apiRequest('/auth/signup', { method: 'POST', body: { name, email, password } });
    setSession(data.token, data.user);
    return data.user;
  },
  async login(email, password) {
    const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
    setSession(data.token, data.user);
    return data.user;
  },
  logout() { clearSession(); },
  currentUser() { return getStoredUser(); },
  isLoggedIn,
};

// ── Tools API ──
const Tools = {
  detect(text) { return apiRequest('/tools/detect', { method: 'POST', body: { text } }); },
  plagiarism(text) { return apiRequest('/tools/plagiarism', { method: 'POST', body: { text } }); },
  humanize(payload) { return apiRequest('/tools/humanize', { method: 'POST', body: payload }); },
  generate(payload) { return apiRequest('/tools/generate', { method: 'POST', body: payload }); },
  trialStatus() { return apiRequest('/tools/trial-status', { method: 'GET' }); },
};

// ── Upload API ──
const Upload = {
  async extractText(file) {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest('/upload', { method: 'POST', body: formData, isForm: true });
  },
};

// ── Dashboard API ──
const Dashboard = {
  stats() { return apiRequest('/dashboard/stats', { method: 'GET' }); },
};

// ── Admin API ──
const Admin = {
  stats() { return apiRequest('/admin/stats', { method: 'GET' }); },
  listUsers({ search = '', page = 1, pageSize = 25 } = {}) {
    const params = new URLSearchParams({ search, page, pageSize });
    return apiRequest('/admin/users?' + params.toString(), { method: 'GET' });
  },
  getUser(id) { return apiRequest('/admin/users/' + id, { method: 'GET' }); },
  ban(id) { return apiRequest(`/admin/users/${id}/ban`, { method: 'POST' }); },
  unban(id) { return apiRequest(`/admin/users/${id}/unban`, { method: 'POST' }); },
  setPlan(id, plan) { return apiRequest(`/admin/users/${id}/plan`, { method: 'POST', body: { plan } }); },
  setAdmin(id, isAdmin) { return apiRequest(`/admin/users/${id}/admin`, { method: 'POST', body: { isAdmin } }); },
  deleteUser(id) { return apiRequest(`/admin/users/${id}`, { method: 'DELETE' }); },
};

// ── Shared UI: nav auth-state rendering ──
function renderNavAuthState() {
  const slot = document.getElementById('navAuthSlot');
  if (!slot) return;
  const user = getStoredUser();
  if (user) {
    const adminLink = user.isAdmin ? `<a class="nav-link" href="/pages/admin.html">Admin</a>` : '';
    slot.innerHTML = `
      <a class="nav-link" href="/pages/dashboard.html">Dashboard</a>
      ${adminLink}
      <span class="muted" style="font-size:13px;">Hi, ${escapeHtml(user.name.split(' ')[0])}</span>
      <button class="btn btn-ghost btn-sm" id="logoutBtn">Log out</button>
    `;
    const btn = document.getElementById('logoutBtn');
    if (btn) btn.addEventListener('click', () => { Auth.logout(); window.location.href = '/'; });
  } else {
    slot.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="navLoginBtn">Log in</button>
      <button class="btn btn-primary btn-sm" id="navSignupBtn">Sign up free</button>
    `;
    const loginBtn = document.getElementById('navLoginBtn');
    const signupBtn = document.getElementById('navSignupBtn');
    if (loginBtn) loginBtn.addEventListener('click', () => window.openAuthModal && window.openAuthModal('login'));
    if (signupBtn) signupBtn.addEventListener('click', () => window.openAuthModal && window.openAuthModal('signup'));
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', renderNavAuthState);
