// js/dashboard.js
// Loads and renders the logged-in user's dashboard. Shows a locked state for guests.

const TOOL_LABELS = {
  detect: { label: 'AI Detector', icon: '◎' },
  plagiarism: { label: 'Plagiarism Checker', icon: '⌕' },
  humanize: { label: 'Humanizer', icon: '✦' },
  generate: { label: 'Content Generator', icon: '✎' },
};

document.addEventListener('DOMContentLoaded', async () => {
  const locked = document.getElementById('dashLocked');
  const content = document.getElementById('dashContent');

  if (!Auth.isLoggedIn()) {
    locked.classList.remove('hidden');
    content.classList.add('hidden');
    window.onAuthSuccess = () => window.location.reload();
    return;
  }

  locked.classList.add('hidden');
  content.classList.remove('hidden');

  const user = Auth.currentUser();
  document.getElementById('dashGreeting').textContent = `Welcome back, ${user.name.split(' ')[0]}`;
  document.getElementById('dashPlanTag').textContent = (user.plan || 'free').toUpperCase() + ' PLAN';
  document.getElementById('accName').textContent = user.name;
  document.getElementById('accEmail').textContent = user.email;
  document.getElementById('accPlan').textContent = (user.plan || 'free').charAt(0).toUpperCase() + (user.plan || 'free').slice(1);
  document.getElementById('accSince').textContent = formatDate(user.createdAt);

  try {
    const stats = await Dashboard.stats();
    renderStats(stats);
  } catch (err) {
    if (err.status === 401) {
      Auth.logout();
      window.location.reload();
    } else {
      showToast('Could not load your dashboard right now. Please refresh.');
    }
  }
});

function renderStats(stats) {
  document.getElementById('kpiTotalScans').textContent = stats.totalScans;
  document.getElementById('kpiWords').textContent = stats.wordsProcessed.toLocaleString();
  document.getElementById('kpiToday').textContent = stats.scansToday;

  const topTool = [...stats.usageByTool].sort((a, b) => b.count - a.count)[0];
  document.getElementById('kpiTopTool').textContent = topTool ? (TOOL_LABELS[topTool.tool]?.label || topTool.tool) : '—';

  // Tool breakdown bars
  const breakdownEl = document.getElementById('toolBreakdown');
  const breakdownEmpty = document.getElementById('breakdownEmpty');
  if (stats.usageByTool.length === 0) {
    breakdownEmpty.style.display = 'block';
  } else {
    breakdownEmpty.style.display = 'none';
    const maxCount = Math.max(...stats.usageByTool.map((t) => t.count));
    breakdownEl.innerHTML = stats.usageByTool.map((t) => {
      const meta = TOOL_LABELS[t.tool] || { label: t.tool, icon: '•' };
      const pct = maxCount ? (t.count / maxCount) * 100 : 0;
      return `
        <div class="tool-row">
          <span class="tool-name">${meta.icon} ${escapeHtml(meta.label)}</span>
          <div class="tool-bar-track"><div class="tool-bar-fill" style="width:${pct}%"></div></div>
          <strong>${t.count}</strong>
        </div>`;
    }).join('') + breakdownEmpty.outerHTML;
    // re-attach the (now hidden) empty node since innerHTML replaced it
    document.getElementById('breakdownEmpty').style.display = 'none';
  }

  // Recent activity
  const activityEl = document.getElementById('recentActivity');
  const activityEmpty = document.getElementById('activityEmpty');
  if (stats.recentActivity.length === 0) {
    activityEmpty.style.display = 'block';
  } else {
    const rows = stats.recentActivity.map((a) => {
      const meta = TOOL_LABELS[a.tool] || { label: a.tool, icon: '•' };
      return `
        <div class="activity-row">
          <span class="activity-tool">${meta.icon} ${escapeHtml(meta.label)} — ${a.words} words</span>
          <span class="activity-time">${formatDateTime(a.createdAt)}</span>
        </div>`;
    }).join('');
    activityEl.innerHTML = rows;
  }
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function goToTools() { window.location.href = '/#tool'; }

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
