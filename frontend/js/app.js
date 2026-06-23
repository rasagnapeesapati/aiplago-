// js/app.js
// Wires the landing/app page UI to the real backend API (see js/api.js).

document.addEventListener('DOMContentLoaded', () => {
  refreshTrialBanner();
});

async function refreshTrialBanner() {
  const banner = document.getElementById('trialBanner');
  if (!banner) return;
  if (Auth.isLoggedIn()) {
    banner.classList.remove('show');
    return;
  }
  try {
    const status = await Tools.trialStatus();
    if (status.trialsRemaining <= 0) {
      banner.innerHTML = `You've used all your free scans. <button class="nav-link" style="color:var(--cyan);font-weight:600;" onclick="window.openAuthModal('signup')">Sign up free</button> to keep going.`;
    } else {
      banner.innerHTML = `<strong>${status.trialsRemaining}</strong> of ${status.limit} free scans remaining — no account needed yet.`;
    }
    banner.classList.add('show');
  } catch (e) {
    // fail silently — banner is a nice-to-have, not critical
  }
}

// ── Tab switching ──
function switchTab(name, btn) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
}

// ── Word/char count ──
function updateCount(textareaId, wcId, ccId) {
  const txt = document.getElementById(textareaId).value.trim();
  document.getElementById(wcId).textContent = txt ? txt.split(/\s+/).filter(Boolean).length : 0;
  document.getElementById(ccId).textContent = txt.length;
}

// ── File handling: upload to backend for real extraction (txt/docx/pdf) ──
async function handleFile(evt, targetId, fileNameId, wcId, ccId) {
  const file = evt.target.files[0];
  if (!file) return;
  await processFile(file, targetId, fileNameId, wcId, ccId);
}

async function processFile(file, targetId, fileNameId, wcId, ccId) {
  const fileNameEl = document.getElementById(fileNameId);
  fileNameEl.textContent = '⏳ Reading ' + file.name + '…';
  try {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    let text;
    if (ext === '.txt') {
      text = await file.text();
    } else {
      const result = await Upload.extractText(file);
      text = result.text;
    }
    document.getElementById(targetId).value = text;
    fileNameEl.textContent = '📎 ' + file.name;
    updateCount(targetId, wcId, ccId);
  } catch (err) {
    fileNameEl.textContent = '';
    showToast('❌ ' + (err.message || 'Could not read this file.'));
  }
}

function dragOver(e, zoneId) { e.preventDefault(); document.getElementById(zoneId).classList.add('dragging'); }
function dragLeave(zoneId) { document.getElementById(zoneId).classList.remove('dragging'); }
async function dropFile(e, targetId, zoneId, fileNameId, wcId, ccId) {
  e.preventDefault();
  dragLeave(zoneId);
  const file = e.dataTransfer.files[0];
  if (file) await processFile(file, targetId, fileNameId, wcId, ccId);
}

// ── Scan animation / loader ──
function startScan(lineId) { document.getElementById(lineId).classList.add('active'); }
function stopScan(lineId) { document.getElementById(lineId).classList.remove('active'); }
function showLoader(id) { document.getElementById(id).classList.add('show'); }
function hideLoader(id) { document.getElementById(id).classList.remove('show'); }

// ── Ring / meter animation ──
function animateRing(ringId, pct, color) {
  const el = document.getElementById(ringId);
  el.setAttribute('stroke', color);
  const circumf = 232;
  const offset = circumf - (Math.max(0, Math.min(100, pct)) / 100) * circumf;
  el.style.strokeDashoffset = offset;
}
function animateMeter(meterId, pct) {
  setTimeout(() => { document.getElementById(meterId).style.width = Math.max(0, Math.min(100, pct)) + '%'; }, 80);
}

// ── Toast ──
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Copy / Download ──
function copyOutput(id) {
  const txt = document.getElementById(id).textContent;
  navigator.clipboard.writeText(txt).then(() => showToast('✅ Copied to clipboard'));
}
function downloadOutput(id, filename) {
  const txt = document.getElementById(id).textContent;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
  a.download = filename + '.txt';
  a.click();
  showToast('⬇️ Downloading…');
}

// ── Clear helpers ──
function clearPanel(inputId, wcId, ccId, resultId, fileId) {
  document.getElementById(inputId).value = '';
  document.getElementById(wcId).textContent = '0';
  document.getElementById(ccId).textContent = '0';
  document.getElementById(resultId).classList.remove('show', 'safe', 'danger', 'warn', 'info');
  if (fileId) document.getElementById(fileId).textContent = '';
}
function clearHumanizer() {
  document.getElementById('humanInput').value = '';
  document.getElementById('humanWordCount').textContent = '0';
  document.getElementById('humanCharCount').textContent = '0';
  document.getElementById('humanResult').classList.remove('show', 'safe', 'danger', 'warn', 'info');
  document.getElementById('humanFile').textContent = '';
  document.getElementById('humanEmptyState').style.display = 'block';
}
function clearCleanGen() {
  document.getElementById('cleanInput').value = '';
  document.getElementById('cleanWordCount').textContent = '0';
  document.getElementById('cleanCharCount').textContent = '0';
  document.getElementById('cleanResult').classList.remove('show', 'safe', 'danger', 'warn', 'info');
  document.getElementById('cleanEmptyState').style.display = 'block';
}

// ── Scroll helpers ──
function scrollToTool() { document.getElementById('tool').scrollIntoView({ behavior: 'smooth' }); }
function scrollToFeatures() { document.getElementById('features').scrollIntoView({ behavior: 'smooth' }); }
function scrollToPricing() { document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' }); }

// ── Shared error handler for trial exhaustion ──
function handleToolError(err) {
  if (err.status === 403 && err.payload?.error === 'trial_exhausted') {
    showToast('🔒 Free trials used up — please sign up to continue.');
    window.openAuthModal('signup');
    return true;
  }
  showToast('❌ ' + (err.message || 'Something went wrong.'));
  return false;
}

function buildHighlightedHtml(text, labels, flagKey) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  return sentences.map((s, i) => {
    const lbl = (labels && labels[i]) || '';
    const cls = lbl === flagKey ? (flagKey === 'ai' ? 'hl-ai' : 'hl-plag') : 'hl-ok';
    return `<span class="${cls}">${escapeHtml(s.trim())}</span> `;
  }).join('');
}

// ═══════════════════════════════════════════
//  AI DETECTOR
// ═══════════════════════════════════════════
async function runAIDetect() {
  const text = document.getElementById('aiInput').value.trim();
  if (text.length < 20) { showToast('⚠️ Please enter at least a sentence.'); return; }

  startScan('aiScanLine');
  showLoader('aiLoader');
  document.getElementById('aiResult').classList.remove('show');
  document.getElementById('aiRunBtn').disabled = true;

  try {
    const d = await Tools.detect(text);
    stopScan('aiScanLine');
    hideLoader('aiLoader');

    const isAI = d.ai_probability >= 60;
    const r = document.getElementById('aiResult');
    r.className = 'result-card show ' + (isAI ? 'danger' : (d.ai_probability >= 35 ? 'warn' : 'safe'));

    document.getElementById('aiScoreVal').textContent = d.ai_probability + '%';
    document.getElementById('aiVerdict').textContent = d.verdict;
    document.getElementById('aiSummary').textContent = d.summary;

    animateRing('aiRingFill', d.ai_probability, isAI ? '#F0465B' : (d.ai_probability >= 35 ? '#F2A93B' : '#16C988'));

    document.getElementById('aiPct').textContent = d.ai_probability + '%';
    document.getElementById('humanPct').textContent = d.human_probability + '%';
    document.getElementById('perpPct').textContent = d.perplexity_score + '%';
    document.getElementById('burstPct').textContent = d.burstiness_score + '%';

    animateMeter('aiMeter', d.ai_probability);
    animateMeter('humanMeter', d.human_probability);
    animateMeter('perpMeter', d.perplexity_score);
    animateMeter('burstMeter', d.burstiness_score);

    document.getElementById('aiTag1').className = 'tag ' + (isAI ? 'tag-crimson' : 'tag-emerald');
    document.getElementById('aiTag1').textContent = isAI ? 'AI content' : 'Human content';
    document.getElementById('aiTag2').className = 'tag tag-amber';
    document.getElementById('aiTag2').textContent = d.top_signals?.[0] || 'Low burstiness';

    document.getElementById('aiHlText').innerHTML = buildHighlightedHtml(text, d.sentence_labels, 'ai');

    refreshTrialBanner();
  } catch (err) {
    stopScan('aiScanLine');
    hideLoader('aiLoader');
    handleToolError(err);
  } finally {
    document.getElementById('aiRunBtn').disabled = false;
  }
}

// ═══════════════════════════════════════════
//  PLAGIARISM CHECKER
// ═══════════════════════════════════════════
async function runPlagCheck() {
  const text = document.getElementById('plagInput').value.trim();
  if (text.length < 20) { showToast('⚠️ Please enter some text.'); return; }

  startScan('plagScanLine');
  showLoader('plagLoader');
  document.getElementById('plagResult').classList.remove('show');

  try {
    const d = await Tools.plagiarism(text);
    stopScan('plagScanLine');
    hideLoader('plagLoader');

    const pct = d.plagiarism_percentage;
    const r = document.getElementById('plagResult');
    r.className = 'result-card show ' + (pct >= 40 ? 'danger' : pct >= 15 ? 'warn' : 'safe');

    document.getElementById('plagScoreVal').textContent = pct + '%';
    document.getElementById('plagVerdict').textContent = d.verdict;
    document.getElementById('plagSummary').textContent = d.summary;

    animateRing('plagRingFill', pct, pct >= 40 ? '#F0465B' : pct >= 15 ? '#F2A93B' : '#16C988');

    document.getElementById('plagPct').textContent = pct + '%';
    document.getElementById('origPct').textContent = d.original_percentage + '%';
    animateMeter('plagMeter', pct);
    animateMeter('origMeter', d.original_percentage);

    document.getElementById('plagTag1').className = 'tag ' + (pct >= 40 ? 'tag-crimson' : pct >= 15 ? 'tag-amber' : 'tag-emerald');
    document.getElementById('plagTag1').textContent = pct >= 40 ? 'High risk' : pct >= 15 ? 'Moderate risk' : 'Mostly original';
    document.getElementById('plagTag2').className = 'tag tag-cyan';
    document.getElementById('plagTag2').textContent = (d.suspected_sources?.length || 0) + ' flagged passages';

    document.getElementById('plagHlText').innerHTML = buildHighlightedHtml(text, d.sentence_labels, 'plagiarized');

    const sourcesEl = document.getElementById('plagSources');
    if (d.suspected_sources?.length) {
      const srcHtml = d.suspected_sources.map((s) => `
        <div class="source-row">
          <div><strong>${escapeHtml(s.title || 'Flagged content')}</strong>${s.url ? `<br/><span class="muted-sm">${escapeHtml(s.url)}</span>` : ''}</div>
          <span class="tag tag-amber">${escapeHtml(s.similarity || '')}</span>
        </div>`).join('');
      sourcesEl.innerHTML = `<div class="card-title hl-section">Flagged similarity types</div>${srcHtml}`;
    } else {
      sourcesEl.innerHTML = '';
    }

    refreshTrialBanner();
  } catch (err) {
    stopScan('plagScanLine');
    hideLoader('plagLoader');
    handleToolError(err);
  }
}

// ═══════════════════════════════════════════
//  HUMANIZER
// ═══════════════════════════════════════════
async function runHumanize() {
  const text = document.getElementById('humanInput').value.trim();
  if (text.length < 20) { showToast('⚠️ Please enter some text to humanize.'); return; }

  const payload = {
    text,
    mode: document.getElementById('humanMode').value,
    strength: document.getElementById('humanStrength').value,
    keepMeaning: document.getElementById('keepMeaning').checked,
    addVariety: document.getElementById('addVariety').checked,
    naturalFlow: document.getElementById('naturalFlow').checked,
  };

  startScan('humanScanLine');
  showLoader('humanLoader');
  document.getElementById('humanResult').classList.remove('show');
  document.getElementById('humanEmptyState').style.display = 'none';

  try {
    const d = await Tools.humanize(payload);
    stopScan('humanScanLine');
    hideLoader('humanLoader');

    const r = document.getElementById('humanResult');
    r.className = 'result-card show info';

    document.getElementById('humanOutput').textContent = d.humanized_text;
    document.getElementById('humanScore').textContent = `Estimated human score: ${d.human_score ?? 90}%`;
    document.getElementById('humanScore').className = 'tag tag-emerald';
    document.getElementById('humanDetect').textContent = d.ai_detected_estimate ? 'May still flag' : 'Likely passes';
    document.getElementById('humanDetect').className = d.ai_detected_estimate ? 'tag tag-amber' : 'tag tag-emerald';

    refreshTrialBanner();
  } catch (err) {
    stopScan('humanScanLine');
    hideLoader('humanLoader');
    document.getElementById('humanEmptyState').style.display = 'block';
    handleToolError(err);
  }
}

function reRunAI() {
  const txt = document.getElementById('humanOutput').textContent;
  if (!txt) return;
  document.getElementById('aiInput').value = txt;
  updateCount('aiInput', 'aiWordCount', 'aiCharCount');
  switchTab('ai', document.querySelector('[data-tab="ai"]'));
  scrollToTool();
  setTimeout(runAIDetect, 400);
}

// ═══════════════════════════════════════════
//  CONTENT GENERATOR
// ═══════════════════════════════════════════
async function runCleanGen() {
  const prompt = document.getElementById('cleanInput').value.trim();
  if (prompt.length < 5) { showToast('⚠️ Please enter a topic or prompt.'); return; }

  const payload = {
    prompt,
    type: document.getElementById('cleanType').value,
    tone: document.getElementById('cleanTone').value,
    length: document.getElementById('cleanLen').value,
  };

  showLoader('cleanLoader');
  document.getElementById('cleanResult').classList.remove('show');
  document.getElementById('cleanEmptyState').style.display = 'none';

  try {
    const d = await Tools.generate(payload);
    hideLoader('cleanLoader');
    const r = document.getElementById('cleanResult');
    r.className = 'result-card show safe';
    document.getElementById('cleanOutput').textContent = d.content;
    refreshTrialBanner();
  } catch (err) {
    hideLoader('cleanLoader');
    document.getElementById('cleanEmptyState').style.display = 'block';
    handleToolError(err);
  }
}

function sendCleanToHumanizer() {
  const txt = document.getElementById('cleanOutput').textContent;
  if (!txt) return;
  document.getElementById('humanInput').value = txt;
  updateCount('humanInput', 'humanWordCount', 'humanCharCount');
  switchTab('human', document.querySelector('[data-tab="human"]'));
  scrollToTool();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
