'use strict';

// ── Config ──────────────────────────────────────────────────────────────────
const MAX_ROWS = 2000;
let currentTab = 'all';

// ── Tab switching ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    document.getElementById(`panel-${currentTab}`).classList.add('active');
    if (currentTab === 'heavy')    fetchHeavyUsers();
    if (currentTab === 'geo')      fetchGeoStats();
    if (currentTab === 'ips')      fetchIpStats();
    if (currentTab === 'botrules') fetchBotRules();
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function flagEmoji(code) {
  if (!code || code === '??' || code.length !== 2) return '🌐';
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  );
}

function fmtSize(b) {
  if (!b || b === 0) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('en-GB', { hour12: false });
  return `${date} ${time}`;
}

function statusClass(code) {
  if (code >= 500) return 's5xx';
  if (code >= 400) return 's4xx';
  if (code >= 300) return 's3xx';
  return 's2xx';
}

function methodClass(m) {
  return { GET: 'm-GET', POST: 'm-POST', PUT: 'm-PUT', DELETE: 'm-DELETE' }[m] || 'm-other';
}

function typeBadge(e) {
  if (e.is_heavy_user) return '<span class="type-badge type-heavy">Heavy</span>';
  if (e.is_bot)        return '<span class="type-badge type-bot">Bot</span>';
  return '<span class="type-badge type-human">Human</span>';
}

// ── Build a <tr> for a log entry ─────────────────────────────────────────────
function buildRow(e, showType) {
  const rowClass = [
    e.is_bot       ? 'row-bot'   : '',
    e.is_heavy_user ? 'row-heavy' : '',
  ].filter(Boolean).join(' ');

  const ua   = (e.user_agent || '—').substring(0, 70);
  const path = (e.path       || '—').substring(0, 55);
  const type = showType ? `<td>${typeBadge(e)}</td>` : '';

  return `<tr class="${rowClass}">
    <td class="time-cell">${fmtTime(e.time)}</td>
    <td class="ip-cell">${e.ip}</td>
    <td><span class="flag">${flagEmoji(e.country_code)}</span><span class="cc">${e.country_code}</span></td>
    <td><span class="method-badge ${methodClass(e.method)}">${e.method}</span></td>
    <td class="path" title="${e.path}">${path}</td>
    <td><span class="status-badge ${statusClass(e.status)}">${e.status}</span></td>
    <td>${fmtSize(e.size)}</td>
    ${type}
    <td class="ua-cell" title="${e.user_agent}">${ua}</td>
  </tr>`;
}

// ── Prepend rows to tbody, trim to MAX_ROWS ──────────────────────────────────
function prependRows(tbody, htmlRows) {
  if (!htmlRows.length) return;
  const wrap = document.createElement('tbody');
  wrap.innerHTML = htmlRows.join('');
  while (wrap.firstChild) tbody.insertBefore(wrap.firstChild, tbody.firstChild);
  while (tbody.rows.length > MAX_ROWS) tbody.removeChild(tbody.lastChild);
}

function setRows(tbody, htmlRows) {
  tbody.innerHTML = htmlRows.join('');
}

// ── Render initial snapshot ───────────────────────────────────────────────────
function renderSnapshot(entries) {
  setRows(document.getElementById('tbody-all'),    entries.map(e => buildRow(e, true)));
  setRows(document.getElementById('tbody-humans'), entries.filter(e => !e.is_bot).map(e => buildRow(e, false)));
  setRows(document.getElementById('tbody-bots'),   entries.filter(e =>  e.is_bot).map(e => buildRow(e, false)));
}

// ── Update stat cards ─────────────────────────────────────────────────────────
function updateStats(stats) {
  const $ = id => document.getElementById(id);
  $('stat-total').textContent     = stats.total?.toLocaleString()     ?? '—';
  $('stat-humans').textContent    = stats.humans?.toLocaleString()    ?? '—';
  $('stat-bots').textContent      = stats.bots?.toLocaleString()      ?? '—';
  $('stat-countries').textContent = stats.countries?.toLocaleString() ?? '—';
  $('stat-heavy').textContent     = stats.heavy_users?.toLocaleString() ?? '—';

  const thr = stats.outlier_threshold;
  $('stat-threshold').textContent = thr != null ? thr.toLocaleString() + ' req' : '—';

  const tailLines = stats.tail_lines;
  $('stat-tail').textContent = tailLines != null ? tailLines.toLocaleString() : '—';
  const footerTail = document.getElementById('footer-tail');
  if (footerTail) footerTail.textContent = tailLines?.toLocaleString() ?? '—';

  const resetInterval = stats.reset_interval || 'none';
  const resetLabels = { none: 'Off', daily: 'Daily', monthly: 'Monthly', yearly: 'Yearly' };
  $('stat-reset').textContent = resetLabels[resetInterval] || resetInterval;
  const resetHint = document.getElementById('reset-next-hint');
  if (resetHint) {
    resetHint.textContent = stats.next_reset_at
      ? 'Next reset: ' + new Date(stats.next_reset_at).toLocaleString('en-GB')
      : 'Next reset: —';
  }

  const badge = $('log-file-badge');
  badge.textContent = stats.log_file || '—';
  badge.title = `Log file: ${stats.log_file}`;

  const errBar = $('error-bar');
  if (stats.log_file_error) {
    errBar.textContent = '⚠ ' + stats.log_file_error;
    errBar.classList.remove('hidden');
  } else {
    errBar.classList.add('hidden');
  }
}

// ── Fetch heavy users (REST) ─────────────────────────────────────────────────
async function fetchHeavyUsers() {
  try {
    const res  = await fetch('/api/heavy-users');
    const data = await res.json();
    const users = data.users || [];

    const thrLabel = document.getElementById('heavy-threshold-label');
    if (thrLabel) thrLabel.textContent = data.threshold?.toLocaleString() + ' req' ?? '—';

    const tbody = document.getElementById('tbody-heavy');
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No heavy users detected — all IP request counts are within normal range.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr class="row-heavy">
        <td class="ip-cell">${u.ip}</td>
        <td><span class="flag">${flagEmoji(u.country_code)}</span>${u.country_name}</td>
        <td class="count-cell">${u.count?.toLocaleString()}</td>
        <td>${u.threshold?.toLocaleString()}</td>
        <td>${u.is_bot
          ? '<span class="type-badge type-bot">Bot</span>'
          : '<span class="type-badge type-human">Human</span>'}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('fetchHeavyUsers', e);
  }
}

// ── Fetch geo stats (REST) ───────────────────────────────────────────────────
async function fetchGeoStats() {
  try {
    const res  = await fetch('/api/geo-stats');
    const data = await res.json();
    const countries = data.countries || [];

    const tbody = document.getElementById('tbody-geo');
    if (!countries.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No geographic data available yet.</td></tr>`;
      return;
    }

    const maxCount = countries[0]?.count || 1;
    tbody.innerHTML = countries.map(c => {
      const humans = c.count - (c.bots || 0);
      const pct    = Math.max(4, Math.round((c.count / maxCount) * 120));
      return `<tr>
        <td><span class="flag">${flagEmoji(c.code)}</span> ${c.name}</td>
        <td><span class="cc">${c.code}</span></td>
        <td>
          <div class="geo-bar-wrap">
            <div class="geo-bar" style="width:${pct}px"></div>
            <span>${c.count?.toLocaleString()}</span>
          </div>
        </td>
        <td style="color:var(--green)">${humans.toLocaleString()}</td>
        <td style="color:var(--orange)">${(c.bots || 0).toLocaleString()}</td>
        <td style="color:var(--text-muted)">${((c.count / maxCount) * 100).toFixed(1)}%</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('fetchGeoStats', e);
  }
}

// ── Fetch requests per IP (REST) ─────────────────────────────────────────────
async function fetchIpStats() {
  const tbody = document.getElementById('tbody-ips');
  if (tbody && !tbody.innerHTML.trim()) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="color:var(--text-muted)">Loading…</td></tr>`;
  }
  try {
    const res  = await fetch('/api/ip-stats');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const ips  = data.ips || [];

    const uniqueLabel = document.getElementById('ip-unique-label');
    const thrLabel    = document.getElementById('ip-threshold-label');
    if (uniqueLabel) uniqueLabel.textContent = data.unique_ips?.toLocaleString() ?? '—';
    if (thrLabel)    thrLabel.textContent    = data.threshold != null ? data.threshold.toLocaleString() + ' req' : '—';

    const tbody = document.getElementById('tbody-ips');
    if (!ips.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No data yet.</td></tr>`;
      return;
    }

    const maxTotal = ips[0]?.total || 1;
    tbody.innerHTML = ips.map((ip, i) => {
      const pct     = Math.max(4, Math.round((ip.total / maxTotal) * 120));
      const rowCls  = ip.is_heavy_user ? 'row-heavy' : '';
      let badge = ip.is_heavy_user
        ? '<span class="type-badge type-heavy">Heavy</span>'
        : (ip.bots > ip.humans
            ? '<span class="type-badge type-bot">Bot</span>'
            : '<span class="type-badge type-human">Human</span>');

      return `<tr class="${rowCls}">
        <td style="color:var(--text-muted);width:40px">${i + 1}</td>
        <td class="ip-cell">${ip.ip}</td>
        <td><span class="flag">${flagEmoji(ip.country_code)}</span><span class="cc">${ip.country_code}</span> ${ip.country_name}</td>
        <td>
          <div class="geo-bar-wrap">
            <div class="geo-bar" style="width:${pct}px"></div>
            <strong>${ip.total.toLocaleString()}</strong>
          </div>
        </td>
        <td style="color:var(--green)">${ip.humans.toLocaleString()}</td>
        <td style="color:var(--orange)">${ip.bots.toLocaleString()}</td>
        <td style="color:var(--text-muted)">${((ip.total / maxTotal) * 100).toFixed(1)}%</td>
        <td>${badge}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('fetchIpStats', e);
    const tbody2 = document.getElementById('tbody-ips');
    if (tbody2) tbody2.innerHTML = `<tr><td colspan="8" class="empty-state" style="color:var(--red)">Failed to load: ${e.message}</td></tr>`;
  }
}

// ── Threshold popover ────────────────────────────────────────────────────────
(function setupThresholdPopover() {
  const card    = document.getElementById('threshold-card');
  const popover = document.getElementById('threshold-popover');
  const iqrIn   = document.getElementById('tpop-iqr');
  const minIn   = document.getElementById('tpop-min');
  const applyBtn = document.getElementById('tpop-apply');
  if (!card) return;

  // Populate inputs from live config on first open
  async function openPopover() {
    try {
      const res  = await fetch('/api/config');
      const data = await res.json();
      iqrIn.value = data.heavy_usage_iqr_multiplier;
      minIn.value = data.heavy_usage_min_requests;
    } catch (_) {}
    popover.classList.remove('hidden');
    iqrIn.focus();
  }

  card.addEventListener('click', e => {
    if (popover.classList.contains('hidden')) {
      openPopover();
    } else {
      popover.classList.add('hidden');
    }
  });

  // Close when clicking outside
  document.addEventListener('click', e => {
    if (!card.contains(e.target)) popover.classList.add('hidden');
  });

  applyBtn.addEventListener('click', async () => {
    const iqr = parseFloat(iqrIn.value);
    const min = parseInt(minIn.value, 10);
    if (isNaN(iqr) || iqr <= 0 || isNaN(min) || min < 1) {
      iqrIn.style.borderColor = 'var(--red)';
      return;
    }
    iqrIn.style.borderColor = '';
    applyBtn.textContent = 'Applying…';
    applyBtn.disabled = true;
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heavy_usage_iqr_multiplier: iqr,
          heavy_usage_min_requests: min,
        }),
      });
      const data = await res.json();
      const thr = data.outlier_threshold;
      document.getElementById('stat-threshold').textContent = thr != null ? thr.toLocaleString() + ' req' : '—';
      document.getElementById('stat-heavy').textContent = data.heavy_users?.toLocaleString() ?? '—';
      popover.classList.add('hidden');
    } catch (e) {
      console.error('apply threshold', e);
    }
    applyBtn.textContent = 'Apply';
    applyBtn.disabled = false;
  });

  // Ctrl+Enter inside popover submits
  popover.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'Enter') applyBtn.click();
  });
}());

// ── Tail lines card (same pattern as threshold card) ─────────────────────────
(function setupTailCard() {
  const card    = document.getElementById('tail-card');
  const popover = document.getElementById('tail-popover');
  const input   = document.getElementById('tail-pop-input');
  const applyBtn = document.getElementById('tail-pop-apply');
  if (!card) return;

  async function openPopover() {
    try {
      const res  = await fetch('/api/config');
      const data = await res.json();
      input.value = data.tail_lines;
    } catch (_) {}
    popover.classList.remove('hidden');
    input.focus();
  }

  card.addEventListener('click', e => {
    if (popover.classList.contains('hidden')) {
      openPopover();
    } else {
      popover.classList.add('hidden');
    }
  });

  document.addEventListener('click', e => {
    if (!card.contains(e.target)) popover.classList.add('hidden');
  });

  applyBtn.addEventListener('click', async () => {
    const val = parseInt(input.value, 10);
    if (isNaN(val) || val < 1) {
      input.style.borderColor = 'var(--red)';
      return;
    }
    input.style.borderColor = '';
    applyBtn.textContent = 'Loading…';
    applyBtn.disabled = true;
    try {
      await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tail_lines: val }),
      });
      popover.classList.add('hidden');
    } catch (e) {
      console.error('apply tail lines', e);
    }
    applyBtn.textContent = 'Apply';
    applyBtn.disabled = false;
  });

  popover.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'Enter') applyBtn.click();
  });
}());

// ── Auto Reset card ──────────────────────────────────────────────────────────
(function setupResetCard() {
  const card     = document.getElementById('reset-card');
  const popover  = document.getElementById('reset-popover');
  const select   = document.getElementById('reset-pop-select');
  const applyBtn = document.getElementById('reset-pop-apply');
  const hint     = document.getElementById('reset-next-hint');
  if (!card) return;

  async function openPopover() {
    try {
      const res  = await fetch('/api/config');
      const data = await res.json();
      select.value = data.reset_interval || 'none';
    } catch (_) {}
    popover.classList.remove('hidden');
  }

  card.addEventListener('click', () => {
    if (popover.classList.contains('hidden')) { openPopover(); }
    else { popover.classList.add('hidden'); }
  });

  document.addEventListener('click', e => {
    if (!card.contains(e.target)) popover.classList.add('hidden');
  });

  applyBtn.addEventListener('click', async () => {
    const val = select.value;
    applyBtn.textContent = 'Applying…';
    applyBtn.disabled = true;
    try {
      const res  = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_interval: val }),
      });
      const data = await res.json();
      const resetLabels = { none: 'Off', daily: 'Daily', monthly: 'Monthly', yearly: 'Yearly' };
      document.getElementById('stat-reset').textContent = resetLabels[val] || val;
      if (hint) {
        hint.textContent = data.next_reset_at
          ? 'Next reset: ' + new Date(data.next_reset_at).toLocaleString('en-GB')
          : 'Next reset: —';
      }
      popover.classList.add('hidden');
    } catch (e) { console.error('apply reset schedule', e); }
    applyBtn.textContent = 'Apply';
    applyBtn.disabled = false;
  });
}());

// ── Bot Rules ─────────────────────────────────────────────────────────────────
let _botRulesData = { rules: [], total_bots: 0, ua_library_available: false };

async function fetchBotRules() {
  try {
    const res  = await fetch('/api/bot-rules');
    _botRulesData = await res.json();
    renderBotRules(_botRulesData);
  } catch (e) {
    console.error('fetchBotRules', e);
  }
}

function renderBotRules(data) {
  const rules = data.rules || [];

  const libBadge = document.getElementById('br-lib-badge');
  if (libBadge) {
    libBadge.textContent = data.ua_library_available ? 'available ✓' : 'unavailable ✗';
    libBadge.className   = 'br-badge ' + (data.ua_library_available ? 'ok' : 'off');
  }
  document.getElementById('br-total-bots').textContent = (data.total_bots ?? 0).toLocaleString();

  const maxHits = Math.max(1, ...rules.map(r => r.hits));
  const tbody   = document.getElementById('tbody-botrules');
  tbody.innerHTML = rules.map((r, i) => {
    const rowCls  = !r.enabled ? 'rule-disabled' : '';
    const pct     = Math.max(3, Math.round((r.hits / maxHits) * 80));
    const shareStr = data.total_bots > 0
      ? ((r.hits / data.total_bots) * 100).toFixed(1) + '%' : '—';

    let patCell;
    if (r.id === 'ua_library') {
      patCell = `<em class="pattern-none">library heuristics — no regex</em>`;
    } else if (r.id === 'empty_ua') {
      patCell = `<em class="pattern-none">built-in — empty or "-" UA</em>`;
    } else {
      patCell = `<span class="pattern-display">${r.pattern || ''}</span>`;
    }

    const canEdit   = r.id !== 'ua_library' && r.id !== 'empty_ua';
    const canDelete = r.custom;
    const actionsCell = `
      ${canEdit   ? `<button class="btn-sm btn-edit" onclick="startEditRule('${r.id}')">Edit</button>` : ''}
      ${canDelete ? `<button class="btn-sm btn-delete" onclick="deleteRule('${r.id}')">Delete</button>` : ''}
    `;

    return `<tr class="${rowCls}" data-rule-id="${r.id}">
      <td class="toggle-wrap">
        <label class="toggle">
          <input type="checkbox" ${r.enabled ? 'checked' : ''}
            onchange="toggleRule('${r.id}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td style="color:var(--text-muted);text-align:center">${i + 1}</td>
      <td><strong style="color:var(--navy);font-size:12px">${r.name}</strong></td>
      <td style="white-space:normal;line-height:1.5;color:var(--text-muted);font-size:11px;min-width:180px">${r.description}</td>
      <td class="pat-cell" data-original="${(r.pattern || '').replace(/"/g, '&quot;')}">${patCell}</td>
      <td>
        <div class="hits-bar-wrap">
          ${r.hits > 0 ? `<div class="hits-bar" style="width:${pct}px"></div>` : ''}
          <span style="font-weight:${r.hits > 0 ? 700 : 400}">${r.hits.toLocaleString()}</span>
        </div>
      </td>
      <td style="color:var(--text-muted)">${shareStr}</td>
      <td>${actionsCell}</td>
    </tr>`;
  }).join('');
}

// Toggle enabled/disabled
async function toggleRule(ruleId, enabled) {
  try {
    await fetch(`/api/bot-rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    await fetchBotRules();
  } catch (e) { console.error('toggleRule', e); }
}

// Inline pattern editing
function startEditRule(ruleId) {
  const row     = document.querySelector(`tr[data-rule-id="${ruleId}"]`);
  const patCell = row.querySelector('.pat-cell');
  const original = patCell.dataset.original;

  patCell.innerHTML = `
    <div class="pattern-edit-wrap">
      <textarea class="pattern-textarea">${original}</textarea>
      <div class="edit-actions">
        <button class="btn-sm btn-save"   onclick="saveEditRule('${ruleId}', this)">Save</button>
        <button class="btn-sm btn-cancel" onclick="cancelEditRule('${ruleId}', '${original.replace(/'/g, "\\'")}')">Cancel</button>
      </div>
    </div>`;
  patCell.querySelector('textarea').focus();
}

async function saveEditRule(ruleId, btn) {
  const row     = btn.closest('tr');
  const textarea = row.querySelector('.pattern-textarea');
  const newPattern = textarea.value.trim();
  try {
    await fetch(`/api/bot-rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: newPattern }),
    });
    await fetchBotRules();
  } catch (e) { console.error('saveEditRule', e); }
}

function cancelEditRule(ruleId, original) {
  const row     = document.querySelector(`tr[data-rule-id="${ruleId}"]`);
  const patCell = row.querySelector('.pat-cell');
  patCell.innerHTML = `<span class="pattern-display">${original}</span>`;
}

// Delete a custom rule
async function deleteRule(ruleId) {
  if (!confirm('Delete this custom rule?')) return;
  try {
    await fetch(`/api/bot-rules/${ruleId}`, { method: 'DELETE' });
    await fetchBotRules();
  } catch (e) { console.error('deleteRule', e); }
}

// Add rule form toggle
const _brAddBtn    = document.getElementById('br-add-btn');
const _brAddForm   = document.getElementById('br-add-form');
const _brAddSave   = document.getElementById('br-add-save');
const _brAddCancel = document.getElementById('br-add-cancel');

if (_brAddBtn) {
  _brAddBtn.addEventListener('click', () => {
    _brAddForm.classList.toggle('hidden');
    if (!_brAddForm.classList.contains('hidden')) {
      document.getElementById('br-new-name').focus();
    }
  });
}
if (_brAddCancel) {
  _brAddCancel.addEventListener('click', () => {
    _brAddForm.classList.add('hidden');
    ['br-new-name','br-new-desc','br-new-pattern'].forEach(id => {
      document.getElementById(id).value = '';
    });
  });
}
if (_brAddSave) {
  _brAddSave.addEventListener('click', async () => {
    const name    = document.getElementById('br-new-name').value.trim();
    const desc    = document.getElementById('br-new-desc').value.trim();
    const pattern = document.getElementById('br-new-pattern').value.trim();
    if (!name || !pattern) {
      alert('Name and Regex Pattern are required.');
      return;
    }
    try {
      const res = await fetch('/api/bot-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc, pattern }),
      });
      if (!res.ok) { alert('Failed to add rule.'); return; }
      _brAddForm.classList.add('hidden');
      ['br-new-name','br-new-desc','br-new-pattern'].forEach(id => {
        document.getElementById(id).value = '';
      });
      await fetchBotRules();
    } catch (e) { console.error('addRule', e); }
  });
}

// ── UA tester (wired directly — script runs after DOM is parsed) ──────────────
(function setupUATester() {
  const btn   = document.getElementById('ua-test-btn');
  const input = document.getElementById('ua-test-input');
  const out   = document.getElementById('ua-test-result');
  if (!btn) return;

  async function runTest() {
    const ua = input.value.trim();
    if (!ua) return;
    try {
      const res  = await fetch('/api/bot-rules/test?ua=' + encodeURIComponent(ua));
      const data = await res.json();
      out.classList.remove('hidden', 'result-bot', 'result-human');
      if (data.is_bot) {
        out.classList.add('result-bot');
        out.innerHTML = `
          <div class="ua-result-label bot">Bot detected</div>
          <div class="ua-result-row"><span class="ua-result-key">Rule</span>
            <span class="ua-result-val">${data.rule_name ?? '—'}</span></div>
          ${data.matched_term
            ? `<div class="ua-result-row"><span class="ua-result-key">Matched</span>
               <span class="ua-result-val highlight">${data.matched_term}</span></div>` : ''}
          <div class="ua-result-row"><span class="ua-result-key">Rule ID</span>
            <span class="ua-result-val">${data.rule_id ?? '—'}</span></div>`;
      } else {
        out.classList.add('result-human');
        out.innerHTML = `
          <div class="ua-result-label human">Human / unclassified</div>
          <div class="ua-result-row"><span class="ua-result-key">Result</span>
            <span class="ua-result-val">No active rule matched this User-Agent.</span></div>`;
      }
    } catch (e) { console.error('ua test error', e); }
  }

  btn.addEventListener('click', runTest);
  input.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') runTest(); });
}());

// ── WebSocket ────────────────────────────────────────────────────────────────
function connectWS() {
  const ws    = new WebSocket(`ws://${location.host}/ws`);
  const dot   = document.getElementById('ws-dot');
  const label = document.getElementById('ws-label');

  ws.onopen = () => {
    dot.className   = 'ws-dot connected';
    label.textContent = 'live';
  };

  ws.onclose = () => {
    dot.className   = 'ws-dot disconnected';
    label.textContent = 'reconnecting…';
    setTimeout(connectWS, 3000);
  };

  ws.onerror = () => ws.close();

  ws.onmessage = ev => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    if (msg.type === 'snapshot') {
      renderSnapshot(msg.entries || []);
      updateStats(msg.stats || {});
    }

    if (msg.type === 'stats_update') {
      updateStats(msg.stats || {});
      if (currentTab === 'heavy') fetchHeavyUsers();
    }

    if (msg.type === 'new_entries') {
      const entries = msg.entries || [];
      updateStats(msg.stats || {});

      prependRows(document.getElementById('tbody-all'),    entries.map(e => buildRow(e, true)));
      prependRows(document.getElementById('tbody-humans'), entries.filter(e => !e.is_bot).map(e => buildRow(e, false)));
      prependRows(document.getElementById('tbody-bots'),   entries.filter(e =>  e.is_bot).map(e => buildRow(e, false)));

      if (currentTab === 'heavy')    fetchHeavyUsers();
      if (currentTab === 'geo')      fetchGeoStats();
      if (currentTab === 'ips')      fetchIpStats();
      if (currentTab === 'botrules' && !document.querySelector('#tbody-botrules .pattern-textarea')) fetchBotRules();
    }
  };
}

connectWS();
