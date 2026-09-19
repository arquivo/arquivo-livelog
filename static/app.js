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
    if (currentTab === 'urls')     fetchUrlStats();
    if (currentTab === 'domains')  fetchDomainStats();
    if (currentTab === 'botrules') fetchBotRules();
    if (currentTab === 'block')    fetchBlockSuggestions();
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function flagEmoji(code) {
  if (!code || code === '??' || code.length !== 2) return '🌐';
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  );
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
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
  const path = escapeHtml((e.path || '—').substring(0, 55));
  const type = showType ? `<td>${typeBadge(e)}</td>` : '';

  return `<tr class="${rowClass}">
    <td class="time-cell">${fmtTime(e.time)}</td>
    <td class="ip-cell">${e.ip}</td>
    <td><span class="flag">${flagEmoji(e.country_code)}</span><span class="cc">${e.country_code}</span></td>
    <td><span class="method-badge ${methodClass(e.method)}">${e.method}</span></td>
    <td class="path" title="${escapeHtml(e.path)}">${path}</td>
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

// ── Requests per URL ─────────────────────────────────────────────────────────
let urlFilter    = '';
let urlGroupFull = false;
let urlFilterTimer = null;

async function fetchUrlStats() {
  const tbody = document.getElementById('tbody-urls');
  if (tbody && !tbody.innerHTML.trim()) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--text-muted)">Loading…</td></tr>`;
  }
  try {
    const params = new URLSearchParams({ group: urlGroupFull ? 'full' : 'path' });
    if (urlFilter) params.set('q', urlFilter);
    const res  = await fetch(`/api/url-stats?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const urls = data.urls || [];

    const uniqueLabel  = document.getElementById('url-unique-label');
    const shownLabel   = document.getElementById('url-shown-label');
    const matchedLabel = document.getElementById('url-matched-label');
    if (uniqueLabel)  uniqueLabel.textContent  = data.unique_urls?.toLocaleString() ?? '—';
    if (shownLabel)   shownLabel.textContent   = urls.length.toLocaleString();
    if (matchedLabel) matchedLabel.textContent = data.matched?.toLocaleString() ?? '—';

    const body = document.getElementById('tbody-urls');
    if (!urls.length) {
      body.innerHTML = `<tr><td colspan="7" class="empty-state">${urlFilter ? 'No URLs match the filter.' : 'No data yet.'}</td></tr>`;
      return;
    }

    const maxTotal = urls[0]?.total || 1;
    body.innerHTML = urls.map((u, i) => {
      const pct  = Math.max(4, Math.round((u.total / maxTotal) * 120));
      const url  = escapeHtml(u.url);
      const errCls = u.errors > 0 ? 'color:var(--red)' : 'color:var(--text-muted)';
      return `<tr>
        <td style="color:var(--text-muted);width:40px">${i + 1}</td>
        <td class="url-cell" title="${url}">${url}</td>
        <td>
          <div class="geo-bar-wrap">
            <div class="geo-bar" style="width:${pct}px"></div>
            <strong>${u.total.toLocaleString()}</strong>
          </div>
        </td>
        <td style="color:var(--green)">${u.humans.toLocaleString()}</td>
        <td style="color:var(--orange)">${u.bots.toLocaleString()}</td>
        <td style="${errCls}">${u.errors.toLocaleString()}</td>
        <td style="color:var(--text-muted)">${u.share.toFixed(2)}%</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('fetchUrlStats', e);
    const body = document.getElementById('tbody-urls');
    if (body) body.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--red)">Failed to load: ${escapeHtml(e.message)}</td></tr>`;
  }
}

(function setupUrlControls() {
  const filterInput = document.getElementById('url-filter');
  const groupToggle = document.getElementById('url-group-full');
  if (filterInput) {
    filterInput.addEventListener('input', () => {
      urlFilter = filterInput.value.trim();
      clearTimeout(urlFilterTimer);
      urlFilterTimer = setTimeout(fetchUrlStats, 250);
    });
  }
  if (groupToggle) {
    groupToggle.addEventListener('change', () => {
      urlGroupFull = groupToggle.checked;
      fetchUrlStats();
    });
  }
})();

// ── Requests per Domain ──────────────────────────────────────────────────────
let domainSource = 'referer';
let domainFilter = '';
let domainFilterTimer = null;

const DOMAIN_HINTS = {
  referer: 'Referring sites that sent traffic here.',
  url:     'Archived target domains extracted from the requested URL.',
};

async function fetchDomainStats() {
  const tbody = document.getElementById('tbody-domains');
  if (tbody && !tbody.innerHTML.trim()) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--text-muted)">Loading…</td></tr>`;
  }
  try {
    const params = new URLSearchParams({ source: domainSource });
    if (domainFilter) params.set('q', domainFilter);
    const res  = await fetch(`/api/domain-stats?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const domains = data.domains || [];

    const uniqueLabel  = document.getElementById('domain-unique-label');
    const shownLabel   = document.getElementById('domain-shown-label');
    const matchedLabel = document.getElementById('domain-matched-label');
    const hint         = document.getElementById('domain-source-hint');
    if (uniqueLabel)  uniqueLabel.textContent  = data.unique_domains?.toLocaleString() ?? '—';
    if (shownLabel)   shownLabel.textContent   = domains.length.toLocaleString();
    if (matchedLabel) matchedLabel.textContent = data.matched?.toLocaleString() ?? '—';
    if (hint)         hint.textContent         = DOMAIN_HINTS[data.source] || '';

    const body = document.getElementById('tbody-domains');
    if (!domains.length) {
      const msg = domainFilter
        ? 'No domains match the filter.'
        : (domainSource === 'url'
            ? 'No archived URLs seen — request paths carry no embedded domain.'
            : 'No data yet.');
      body.innerHTML = `<tr><td colspan="7" class="empty-state">${msg}</td></tr>`;
      return;
    }

    const maxTotal = domains[0]?.total || 1;
    body.innerHTML = domains.map((d, i) => {
      const pct    = Math.max(4, Math.round((d.total / maxTotal) * 120));
      const name   = escapeHtml(d.domain);
      const errCls = d.errors > 0 ? 'color:var(--red)' : 'color:var(--text-muted)';
      return `<tr>
        <td style="color:var(--text-muted);width:40px">${i + 1}</td>
        <td class="url-cell" title="${name}">${name}</td>
        <td>
          <div class="geo-bar-wrap">
            <div class="geo-bar" style="width:${pct}px"></div>
            <strong>${d.total.toLocaleString()}</strong>
          </div>
        </td>
        <td style="color:var(--green)">${d.humans.toLocaleString()}</td>
        <td style="color:var(--orange)">${d.bots.toLocaleString()}</td>
        <td style="${errCls}">${d.errors.toLocaleString()}</td>
        <td style="color:var(--text-muted)">${d.share.toFixed(2)}%</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('fetchDomainStats', e);
    const body = document.getElementById('tbody-domains');
    if (body) body.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--red)">Failed to load: ${escapeHtml(e.message)}</td></tr>`;
  }
}

(function setupDomainControls() {
  const filterInput = document.getElementById('domain-filter');
  if (filterInput) {
    filterInput.addEventListener('input', () => {
      domainFilter = filterInput.value.trim();
      clearTimeout(domainFilterTimer);
      domainFilterTimer = setTimeout(fetchDomainStats, 250);
    });
  }
  document.querySelectorAll('#domain-source .seg').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.source === domainSource) return;
      document.querySelectorAll('#domain-source .seg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      domainSource = btn.dataset.source;
      document.getElementById('tbody-domains').innerHTML = '';
      fetchDomainStats();
    });
  });
})();

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

// ── Block Suggestions ────────────────────────────────────────────────────────
let _blockMode    = 'ip';        // 'ip' | 'country' | 'ua'
let _blockUsers   = [];          // raw heavy-users payload
let _blockCountries = [];        // raw geo-stats payload
let _blockUAs     = [];          // raw ua-stats payload
let _blockSigs    = [];          // raw ua-stats payload, signature-filtered
let _sigPaths     = ['/noFrame', '/wayback'];  // server-side signature paths
let _blockSelected = new Set();  // set of IP/CIDR, country-code or UA strings

const IP_FORMATS = [
  ['iptables',   'iptables (Linux)'],
  ['nftables',   'nftables (Linux)'],
  ['ufw',        'ufw (Ubuntu/Debian)'],
  ['firewalld',  'firewalld (RHEL/Fedora)'],
  ['nginx',      'nginx deny'],
  ['apache',     'Apache .htaccess'],
  ['hosts-deny', '/etc/hosts.deny'],
  ['netsh',      'Windows netsh'],
  ['cisco',      'Cisco ACL'],
  ['cloudflare', 'Cloudflare API'],
  ['plain',      'Plain IP list'],
];
const COUNTRY_FORMATS = [
  ['iptables-geo',  'iptables (xt_geoip)'],
  ['nftables-geo',  'nftables (named set)'],
  ['ufw-geo',       'ufw before.rules + ipset'],
  ['nginx-geo',     'nginx (ngx_http_geoip_module)'],
  ['nginx-geoip2',  'nginx (ngx_http_geoip2_module)'],
  ['apache-geo',    'Apache (mod_geoip / mod_maxminddb)'],
  ['haproxy-geo',   'HAProxy ACL'],
  ['cloudflare-geo','Cloudflare API (country rule)'],
  ['cloudflare-expr','Cloudflare firewall expression'],
  ['fail2ban-geo',  'fail2ban (geoip-action.conf)'],
  ['plain-cc',      'Plain country-code list'],
];

const UA_FORMATS = [
  ['apache-ua',      'Apache (SetEnvIf + Require)'],
  ['apache-rewrite', 'Apache (mod_rewrite 403)'],
  ['nginx-ua',       'nginx (map + return 403)'],
  ['haproxy-ua',     'HAProxy ACL'],
  ['iptables-ua',    'iptables (string match, HTTP only)'],
  ['cloudflare-ua',  'Cloudflare API (UA rule)'],
  ['cloudflare-expr-ua', 'Cloudflare firewall expression'],
  ['fail2ban-ua',    'fail2ban filter'],
  ['botrule-regex',  'Bot rule regex (this dashboard)'],
  ['robots-txt',     'robots.txt (polite crawlers only)'],
  ['plain-ua',       'Plain User-Agent list'],
];

// A signature block is a conjunction (UA + no Referer + path), so only formats
// that can express all three appear here. A bare UA list cannot.
const SIGNATURE_FORMATS = [
  ['apache-sig',      'Apache (SetEnvIfExpr + Require)'],
  ['apache-sig-rw',   'Apache (mod_rewrite 403)'],
  ['nginx-sig',       'nginx (map + return 403)'],
  ['haproxy-sig',     'HAProxy ACL'],
  ['cloudflare-sig',  'Cloudflare firewall expression'],
  ['plain-sig',       'Plain User-Agent list (signature rows)'],
];

// Regex-escape a User-Agent so it can be dropped into a pattern verbatim.
function reEscape(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
}

// Token mode matches a substring (survives version bumps); full mode is exact.
function uaTokenMode() {
  return document.getElementById('block-ua-token')?.checked !== false;
}

function populateFormatSelect() {
  const sel = document.getElementById('block-format');
  if (!sel) return;
  const list = _blockMode === 'country'   ? COUNTRY_FORMATS
             : _blockMode === 'ua'        ? UA_FORMATS
             : _blockMode === 'signature' ? SIGNATURE_FORMATS
             : IP_FORMATS;
  sel.innerHTML = list.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
}

async function fetchBlockSuggestions({ preserveSelection = false } = {}) {
  try {
    if (_blockMode === 'country') {
      const res  = await fetch('/api/geo-stats');
      const data = await res.json();
      _blockCountries = (data.countries || []).filter(c => c.code && c.code !== '??');
    } else if (_blockMode === 'signature') {
      const params = new URLSearchParams({
        group:                'full',
        signature_only:       'true',
        min_signature_share:  String(Math.min(100, Math.max(0, parseFloat(document.getElementById('block-sig-share')?.value) || 0))),
        min_requests:         String(Math.max(1, parseInt(document.getElementById('block-sig-min')?.value, 10) || 1)),
        limit:                '500',
      });
      const res  = await fetch(`/api/ua-stats?${params}`);
      const data = await res.json();
      _blockSigs = data.user_agents || [];
      if (Array.isArray(data.signature_paths) && data.signature_paths.length) {
        _sigPaths = data.signature_paths;
        const box = document.getElementById('block-sig-paths');
        if (box && !box.value) box.value = _sigPaths.join(',');
      }
    } else if (_blockMode === 'ua') {
      const params = new URLSearchParams({
        group:        uaTokenMode() ? 'token' : 'full',
        bots_only:    document.getElementById('block-ua-bots-only')?.checked ? 'true' : 'false',
        min_requests: String(Math.max(1, parseInt(document.getElementById('block-ua-min')?.value, 10) || 1)),
        limit:        '500',
      });
      const res  = await fetch(`/api/ua-stats?${params}`);
      const data = await res.json();
      _blockUAs = data.user_agents || [];
    } else {
      const res  = await fetch('/api/heavy-users');
      const data = await res.json();
      _blockUsers = data.users || [];
    }

    const rowKeys = new Set(currentBlockRows().map(r => r.key));
    if (preserveSelection) {
      // Drop selections whose IPs/countries no longer exist in fresh data.
      _blockSelected = new Set([..._blockSelected].filter(k => rowKeys.has(k)));
    } else {
      // Initial open or mode switch: select everything by default.
      _blockSelected = new Set(rowKeys);
    }
    renderBlockTable();
    renderBlockOutput();
  } catch (e) {
    console.error('fetchBlockSuggestions', e);
  }
}

// Aggregate to /24 when toggled and 2+ IPs share the prefix.
function currentBlockRows() {
  if (_blockMode === 'country') {
    const botsOnly = document.getElementById('block-bots-only')?.checked;
    const rows = _blockCountries
      .filter(c => !botsOnly || (c.bots || 0) > 0)
      .map(c => ({
        key: c.code,
        label: c.name || c.code,
        country_code: c.code,
        country_name: c.name,
        count: c.count,
        bots: c.bots || 0,
        is_country: true,
      }));
    return rows;
  }

  if (_blockMode === 'signature') {
    return _blockSigs.map(u => ({
      key: u.user_agent,
      label: u.user_agent,
      sample: u.sample || u.user_agent,
      count: u.total,
      signature: u.signature,
      signature_share: u.signature_share,
      signature_ips: u.signature_ips,
      no_referer: u.no_referer,
      is_bot: u.is_bot,
      is_signature: true,
    }));
  }

  if (_blockMode === 'ua') {
    return _blockUAs.map(u => ({
      key: u.user_agent,
      label: u.user_agent,
      sample: u.sample || u.user_agent,
      token: u.token || u.user_agent,
      count: u.total,
      unique_ips: u.unique_ips,
      ips_capped: u.ips_capped,
      is_bot: u.is_bot,
      rule_name: u.rule_name,
      is_ua: true,
    }));
  }

  const aggregate = document.getElementById('block-aggregate-cidr')?.checked;
  if (!aggregate) {
    return _blockUsers.map(u => ({
      key: u.ip,
      label: u.ip,
      country_code: u.country_code,
      country_name: u.country_name,
      count: u.count,
      is_bot: u.is_bot,
      ipv6: u.ip.includes(':'),
      cidr: false,
    }));
  }

  // Group by /24 (IPv4 only) — IPv6 stays as /128
  const groups = new Map();
  for (const u of _blockUsers) {
    if (u.ip.includes(':')) {
      groups.set(u.ip, { ips: [u], key: u.ip, ipv6: true });
      continue;
    }
    const prefix = u.ip.split('.').slice(0, 3).join('.') + '.0/24';
    if (!groups.has(prefix)) groups.set(prefix, { ips: [], key: prefix, ipv6: false });
    groups.get(prefix).ips.push(u);
  }

  const rows = [];
  for (const g of groups.values()) {
    if (g.ipv6 || g.ips.length === 1) {
      const u = g.ips[0];
      rows.push({
        key: u.ip,
        label: u.ip,
        country_code: u.country_code,
        country_name: u.country_name,
        count: u.count,
        is_bot: u.is_bot,
        ipv6: g.ipv6,
        cidr: false,
      });
    } else {
      const total = g.ips.reduce((s, u) => s + (u.count || 0), 0);
      const anyBot = g.ips.some(u => u.is_bot);
      rows.push({
        key: g.key,
        label: `${g.key}  (${g.ips.length} IPs)`,
        country_code: g.ips[0].country_code,
        country_name: g.ips[0].country_name,
        count: total,
        is_bot: anyBot,
        ipv6: false,
        cidr: true,
      });
    }
  }
  rows.sort((a, b) => b.count - a.count);
  return rows;
}

function renderBlockTableHead() {
  const thead = document.getElementById('thead-block');
  if (!thead) return;
  if (_blockMode === 'country') {
    thead.innerHTML = `<tr>
      <th style="width:40px;text-align:center">
        <input type="checkbox" id="block-head-check" checked />
      </th>
      <th>Country</th>
      <th style="width:80px">Code</th>
      <th>Total Requests</th>
      <th>Bots</th>
    </tr>`;
  } else if (_blockMode === 'signature') {
    thead.innerHTML = `<tr>
      <th style="width:40px;text-align:center">
        <input type="checkbox" id="block-head-check" checked />
      </th>
      <th>User-Agent</th>
      <th style="width:100px">Requests</th>
      <th style="width:110px" title="Requests with no Referer on a signature path">Signature</th>
      <th style="width:90px" title="Signature requests as a share of this UA's traffic">Share</th>
      <th style="width:90px">Unique IPs</th>
    </tr>`;
  } else if (_blockMode === 'ua') {
    thead.innerHTML = `<tr>
      <th style="width:40px;text-align:center">
        <input type="checkbox" id="block-head-check" checked />
      </th>
      <th>User-Agent</th>
      <th style="width:100px">Requests</th>
      <th style="width:110px" title="Requests that arrived with no Referer">No Referer</th>
      <th style="width:90px">Unique IPs</th>
      <th style="width:150px">Detected as</th>
    </tr>`;
  } else {
    thead.innerHTML = `<tr>
      <th style="width:40px;text-align:center">
        <input type="checkbox" id="block-head-check" checked />
      </th>
      <th>IP / Subnet</th>
      <th>Country</th>
      <th>Requests</th>
      <th>Type</th>
    </tr>`;
  }
  // Re-bind the header checkbox listener (it was replaced)
  document.getElementById('block-head-check')?.addEventListener('change', e => {
    document.querySelectorAll('#tbody-block .block-row-check').forEach(cb => {
      cb.checked = e.target.checked;
      const k = cb.dataset.key;
      if (e.target.checked) _blockSelected.add(k);
      else                  _blockSelected.delete(k);
    });
    syncBlockHeaderCheck();
    renderBlockOutput();
  });
}

function renderBlockTable() {
  renderBlockTableHead();
  const tbody = document.getElementById('tbody-block');
  if (!tbody) return;
  const rows = currentBlockRows();

  if (!rows.length) {
    const msg = _blockMode === 'country'
      ? 'No country data yet — wait for traffic to be ingested.'
      : _blockMode === 'signature'
      ? 'No User-Agent matches the signature — lower "Min signature share %" or "Min requests", or widen the paths.'
      : _blockMode === 'ua'
      ? 'No User-Agent matches the current filters — lower "Min requests" or untick "Only bot-classified".'
      : 'No heavy users detected — nothing to suggest blocking.';
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${msg}</td></tr>`;
    document.getElementById('block-selected-count').textContent = '0';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const checked = _blockSelected.has(r.key) ? 'checked' : '';
    if (r.is_country) {
      return `<tr>
        <td style="text-align:center">
          <input type="checkbox" data-key="${r.key}" ${checked} class="block-row-check" />
        </td>
        <td><span class="flag">${flagEmoji(r.country_code)}</span> <strong>${r.country_name || r.country_code}</strong></td>
        <td><span class="cc">${r.country_code}</span></td>
        <td class="count-cell">${r.count?.toLocaleString() ?? '—'}</td>
        <td style="color:var(--orange)">${r.bots?.toLocaleString() ?? '0'}</td>
      </tr>`;
    }
    if (r.is_signature) {
      const share = (r.signature_share ?? 0).toFixed(1);
      const hot   = (r.signature_share ?? 0) >= 90 ? ' style="color:var(--orange);font-weight:600"' : '';
      return `<tr>
        <td style="text-align:center">
          <input type="checkbox" data-key="${escapeHtml(r.key)}" ${checked} class="block-row-check" />
        </td>
        <td class="ua-key-cell" title="${escapeHtml(r.sample)}">${escapeHtml(r.label)}</td>
        <td class="count-cell">${r.count?.toLocaleString() ?? '—'}</td>
        <td class="count-cell">${r.signature?.toLocaleString() ?? '—'}</td>
        <td class="count-cell"${hot}>${share}%</td>
        <td class="count-cell">${r.signature_ips?.toLocaleString() ?? '—'}</td>
      </tr>`;
    }
    if (r.is_ua) {
      const detected = r.is_bot
        ? `<span class="type-badge type-bot">Bot</span> <span class="ua-rule-name">${escapeHtml(r.rule_name || '')}</span>`
        : '<span class="type-badge type-human">Human</span>';
      const ips = r.unique_ips?.toLocaleString() ?? '—';
      return `<tr>
        <td style="text-align:center">
          <input type="checkbox" data-key="${escapeHtml(r.key)}" ${checked} class="block-row-check" />
        </td>
        <td class="ua-key-cell" title="${escapeHtml(r.sample)}">${escapeHtml(r.label)}</td>
        <td class="count-cell">${r.count?.toLocaleString() ?? '—'}</td>
        <td class="count-cell">${r.no_referer?.toLocaleString() ?? '—'}</td>
        <td class="count-cell">${ips}${r.ips_capped ? '+' : ''}</td>
        <td>${detected}</td>
      </tr>`;
    }
    const badge = r.is_bot
      ? '<span class="type-badge type-bot">Bot</span>'
      : '<span class="type-badge type-human">Human</span>';
    return `<tr>
      <td style="text-align:center">
        <input type="checkbox" data-key="${r.key}" ${checked} class="block-row-check" />
      </td>
      <td class="ip-cell">${r.label}</td>
      <td><span class="flag">${flagEmoji(r.country_code)}</span> ${r.country_name || r.country_code || '—'}</td>
      <td class="count-cell">${r.count?.toLocaleString() ?? '—'}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.block-row-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const k = cb.dataset.key;
      if (cb.checked) _blockSelected.add(k); else _blockSelected.delete(k);
      renderBlockOutput();
      syncBlockHeaderCheck();
    });
  });
  syncBlockHeaderCheck();
  renderBlockOutput();
}

function syncBlockHeaderCheck() {
  const rows = currentBlockRows();
  const head = document.getElementById('block-head-check');
  const top  = document.getElementById('block-select-all');
  if (!rows.length) {
    if (head) head.checked = false;
    if (top)  top.checked  = false;
  } else {
    const all = rows.every(r => _blockSelected.has(r.key));
    if (head) head.checked = all;
    if (top)  top.checked  = all;
  }
  document.getElementById('block-selected-count').textContent =
    String([...rows].filter(r => _blockSelected.has(r.key)).length);
}

function selectedBlockTargets() {
  return currentBlockRows().filter(r => _blockSelected.has(r.key));
}

const BLOCK_HINTS = {
  // IP-based
  iptables:    'Run as root. Persist with <code>iptables-save &gt; /etc/iptables/rules.v4</code> (Debian/Ubuntu) or <code>service iptables save</code> (RHEL).',
  nftables:    'Requires a table+chain named <code>filter</code>/<code>input</code>. Adjust if yours differ. Persist with <code>nft list ruleset &gt; /etc/nftables.conf</code>.',
  ufw:         'Run as root or with sudo. UFW reloads automatically.',
  firewalld:   'Run as root. <code>--permanent</code> survives reload; <code>firewall-cmd --reload</code> applies.',
  nginx:       'Paste inside a <code>server { ... }</code> or <code>http { ... }</code> block, then reload nginx.',
  apache:      'Drop into <code>.htaccess</code> or a <code>&lt;Directory&gt;</code> / <code>&lt;Location&gt;</code> block. Requires <code>mod_authz_core</code> (Apache 2.4+).',
  'hosts-deny':'Only effective for services using libwrap (sshd, etc.). Not an HTTP-level block.',
  netsh:       'Run in elevated cmd.exe / PowerShell on Windows Server.',
  cisco:       'Apply ACL to the relevant interface with <code>ip access-group BLOCKLIST in</code>.',
  cloudflare:  'Replace <code>$ZONE_ID</code> and <code>$CF_API_TOKEN</code>. Each call creates a firewall access rule scoped to the zone.',
  plain:       'A bare IP list — easy to import into your own tooling, fail2ban jails, ipset, etc.',
  // Country-based
  'iptables-geo':  'Requires the <code>xt_geoip</code> kernel module and the country database under <code>/usr/share/xt_geoip/</code>. Install via <code>xtables-addons-common</code> + <code>xtables-addons-dkms</code>.',
  'nftables-geo':  'Uses a named set populated from a country IP list (e.g. <a>ipdeny.com</a>, <a>ipverse.net</a>). Refresh the set periodically with a cron job.',
  'ufw-geo':       'UFW has no native GeoIP; this uses <code>ipset</code> + <code>before.rules</code>. Country IP lists from ipdeny.com or MaxMind GeoLite2-Country.',
  'nginx-geo':     'Requires nginx built with <code>--with-http_geoip_module</code> and the legacy MaxMind <code>GeoIP.dat</code>. Place <code>geoip_country</code> in the <code>http {}</code> block.',
  'nginx-geoip2':  'Requires <code>ngx_http_geoip2_module</code> and the MaxMind <code>GeoLite2-Country.mmdb</code> database (free signup required).',
  'apache-geo':    'Requires <code>mod_maxminddb</code> (Apache 2.4+) and the MaxMind <code>GeoLite2-Country.mmdb</code>.',
  'haproxy-geo':   'Uses a static map file <code>country.map</code> built from a country IP list. Apply the ACL in your <code>frontend</code> or <code>backend</code>.',
  'cloudflare-geo':'Creates one country-scoped access rule per call. Replace <code>$ZONE_ID</code> and <code>$CF_API_TOKEN</code>.',
  'cloudflare-expr':'Paste this expression into a Cloudflare WAF custom rule (Security → WAF → Custom rules). Action: <code>Block</code>.',
  'fail2ban-geo':  'fail2ban does not natively support country blocking; this snippet shows how to wire an action that uses MaxMind + ipset. Suitable for blocking on repeat offenders from these countries.',
  'plain-cc':      'Bare ISO-3166 alpha-2 country code list — import into your own tooling.',
  // User-Agent-based
  'apache-ua':      'Requires <code>mod_setenvif</code> + <code>mod_authz_core</code> (Apache 2.4+). Drop into <code>.htaccess</code> or a <code>&lt;Directory&gt;</code> block. Returns 403 to matching clients.',
  'apache-rewrite': 'Requires <code>mod_rewrite</code>. Equivalent to the SetEnvIf variant; use it when you already have a rewrite block. <code>[F]</code> returns 403.',
  'nginx-ua':       'The <code>map</code> goes in the <code>http { }</code> block, the <code>if</code> in your <code>server { }</code> block. Reload nginx afterwards.',
  'haproxy-ua':     'Apply inside your <code>frontend</code>. <code>-m sub</code> matches a substring, <code>-m str</code> the whole header value.',
  'iptables-ua':    'Matches the User-Agent in the raw TCP payload, so it only works for <strong>plaintext HTTP</strong> — useless behind TLS. Prefer a web-server or WAF rule.',
  'cloudflare-ua':  'Cloudflare User-Agent Blocking matches the <strong>complete</strong> UA string exactly, so each rule uses the busiest observed string rather than the token. Replace <code>$ZONE_ID</code> and <code>$CF_API_TOKEN</code>.',
  'cloudflare-expr-ua': 'Paste into a Cloudflare WAF custom rule (Security → WAF → Custom rules). Action: <code>Block</code>.',
  'fail2ban-ua':    'Save as <code>/etc/fail2ban/filter.d/bad-ua.conf</code> and reference it from a jail. Bans the IP after <code>maxretry</code> matching requests instead of rejecting every one.',
  'botrule-regex':  'Not a firewall rule — paste this pattern into <strong>Bot Rules → Add custom rule</strong> so these clients are counted as bots in this dashboard. It changes classification only; it does not block anything.',
  'robots-txt':     'Only obeyed by well-behaved crawlers, and only for tokens that are real product names. Abusive clients ignore it — pair it with one of the enforcing formats above.',
  'plain-ua':       'Bare User-Agent list — import into your own tooling.',
  // Signature-based (UA + no Referer + path, as one conjunction)
  'apache-sig':     'Requires <code>mod_setenvif</code> + <code>mod_authz_core</code> (Apache 2.4+). Denies only when all three conditions hold at once, so ordinary visitors sending the same User-Agent are unaffected as long as they arrive with a Referer.',
  'apache-sig-rw':  'Requires <code>mod_rewrite</code>. Same conjunction expressed as stacked <code>RewriteCond</code> lines, which are ANDed by default. <code>[F]</code> returns 403.',
  'nginx-sig':      'Two <code>map</code> blocks in <code>http { }</code> set a flag each; the <code>location</code> denies only when both are set. Reload nginx afterwards.',
  'haproxy-sig':    'Apply inside your <code>frontend</code>. The three ACLs on one <code>http-request deny</code> line are ANDed.',
  'cloudflare-sig': 'Paste into a Cloudflare WAF custom rule (Security → WAF → Custom rules). Action: <code>Block</code>.',
  'plain-sig':      'Bare list of the User-Agent strings that matched the signature — import into your own tooling.',
};

// ── Per-mode documentation, swapped into #block-mode-doc on mode change ──
// Each entry says what the mode matches, when it is the right choice, what it
// costs you when it is wrong, and how to read the table columns.
const MODE_DOCS = {
  ip: {
    match: 'Individual addresses whose request count is a statistical outlier — above the IQR threshold shown in the stats strip, which adapts to the current traffic mix.',
    use:   'A handful of addresses account for a disproportionate share of traffic. The most precise dimension available: it names exactly who, and nothing else is affected.',
    risk:  'An address is not a person. NAT gateways, university and corporate egress, mobile carrier CGNAT and VPN exits all look like one very busy visitor. Check the country and bot columns before blocking, and prefer this over broader dimensions only when the addresses are few and stable.',
    cols:  '<strong>Requests</strong> is this address\'s total in the loaded window. <strong>Type</strong> is the bot classifier\'s verdict on its User-Agent. Ticking <em>Aggregate /24</em> rolls IPv4 addresses sharing a prefix into one CIDR when two or more appear — useful against a subnet, wrong if the neighbours are unrelated.',
  },
  country: {
    match: 'Every request from a country, by GeoIP lookup on the source address. The 50 busiest countries in the window.',
    use:   'Traffic is concentrated somewhere you have no audience and you accept losing every visitor from there. Fast to apply and needs no per-address maintenance.',
    risk:  'The bluntest dimension here. It blocks your readers along with the abuse, it cannot distinguish the two, and country entries tend to accumulate and never get removed. GeoIP is roughly 99.8% accurate at country level, so a small number of visitors are misplaced entirely. Reach for this when a narrower dimension genuinely will not separate the traffic.',
    cols:  '<strong>Total Requests</strong> is every request from that country; <strong>Bots</strong> is the share the classifier recognised as automated. A high total with near-zero bots means the traffic looks like ordinary browsers — which may mean it is, or that it is disguised. Compare against <em>By Signature</em> before deciding.',
  },
  ua: {
    match: 'Clients grouped by the User-Agent header they send — either the full string, or collapsed to a product token so every version of one client rolls into a single row.',
    use:   'A client identifies itself and is noisy: an SEO crawler, a scraping framework, an AI training bot, a misconfigured integration.',
    risk:  'The User-Agent is self-reported and trivially forged. This dimension works on clients honest enough to name themselves, and misses entirely any scraper sending a real browser string — those are indistinguishable here from your actual visitors. <em>Only bot-classified</em> narrows to strings the detector recognises, which by definition excludes every forged browser UA; leave it unticked when hunting something that is hiding. If a browser UA dominates this table, that is the case for <em>By Signature</em>.',
    cols:  '<strong>Requests</strong> is the total for that string. <strong>No Referer</strong> counts those that arrived with no referring page — the single most useful column here, because a forged browser UA with a near-total no-referer count is not a browser. <strong>Unique IPs</strong> with a <code>+</code> means the count is a lower bound.',
  },
  signature: {
    match: 'A conjunction, not one attribute: a browser-like User-Agent <em>and</em> no Referer header <em>and</em> a request path under the configured prefixes. All three must hold.',
    use:   'Traffic that looks like an ordinary browser but behaves like a scraper. This is the dimension that catches a pool forging real Chrome strings across many addresses and countries — where blocking by IP, country or UA each fail, for different reasons.',
    risk:  'Each condition alone describes real visitors, so the precision comes entirely from requiring all three. The genuine false positive is someone opening one of those paths directly — from a bookmark, an emailed link or a citation in a PDF — who sends no Referer. Narrow the paths to the expensive endpoints rather than the whole site, and keep the share threshold high.',
    cols:  '<strong>Signature</strong> is how many of that client\'s requests met all three conditions; <strong>Share</strong> is that as a percentage of everything it sent. A real browser scatters across the site and arrives with referrers, so its share stays low. A share at or near 100% means every single request fitted the pattern, which is the shape of a machine working through a list.',
  },
};

function renderModeDoc() {
  const box = document.getElementById('block-mode-doc');
  if (!box) return;
  const d = MODE_DOCS[_blockMode] || MODE_DOCS.ip;
  box.innerHTML = `
    <div class="bmd-row"><span class="bmd-label">Matches</span><span class="bmd-text">${d.match}</span></div>
    <div class="bmd-row"><span class="bmd-label">Use when</span><span class="bmd-text">${d.use}</span></div>
    <div class="bmd-row bmd-risk"><span class="bmd-label">Watch out</span><span class="bmd-text">${d.risk}</span></div>
    <div class="bmd-row"><span class="bmd-label">Columns</span><span class="bmd-text">${d.cols}</span></div>`;
}

// Paths for the signature rule: whatever is in the box, else the server's list.
function sigPaths() {
  const raw = (document.getElementById('block-sig-paths')?.value || '').trim();
  const list = raw ? raw.split(',').map(p => p.trim()).filter(Boolean) : _sigPaths;
  return list.length ? list : ['/noFrame', '/wayback'];
}

function generateBlockCommands(targets, format) {
  if (!targets.length) {
    if (_blockMode === 'country')   return 'No countries selected.';
    if (_blockMode === 'signature') return 'No signatures selected.';
    if (_blockMode === 'ua')        return 'No User-Agents selected.';
    return 'No IPs selected.';
  }

  // ── Signature generators: UA + no Referer + path, as one conjunction ──
  if (_blockMode === 'signature') {
    const uas   = targets.map(t => t.key);
    const paths = sigPaths();
    const uaAlt = uas.map(reEscape).join('|');
    const pAlt  = paths.map(reEscape).join('|');

    switch (format) {
      case 'apache-sig':
        return [
          '# Requires mod_setenvif + mod_authz_core (Apache 2.4+).',
          '# Denies only when ALL THREE hold: this User-Agent, no Referer,',
          '# and one of the paths below. Each condition alone also matches',
          '# real visitors - the conjunction is what makes it specific.',
          `SetEnvIfExpr "%{HTTP_USER_AGENT} =~ m#^(${uaAlt})$# && -z %{HTTP_REFERER} && %{REQUEST_URI} =~ m#^(${pAlt})#" bad_sig`,
          '',
          '<Location />',
          '    <RequireAll>',
          '        Require all granted',
          '        Require not env bad_sig',
          '    </RequireAll>',
          '</Location>',
        ].join('\n');

      case 'apache-sig-rw':
        return [
          'RewriteEngine On',
          `RewriteCond %{HTTP_USER_AGENT} "^(${uaAlt})$"`,
          'RewriteCond %{HTTP_REFERER} "^$"',
          `RewriteRule "^(${pAlt})" - [F,L]`,
        ].join('\n');

      case 'nginx-sig':
        return [
          '# In the http { } block:',
          'map $http_user_agent $sig_ua {',
          '    default 0;',
          ...uas.map(u => `    "~*^${reEscape(u)}$"  1;`),
          '}',
          'map $http_referer $sig_noref {',
          '    default 0;',
          '    ""      1;',
          '}',
          '',
          '# In your server { } block:',
          `location ~ ^(${pAlt}) {`,
          '    if ($sig_ua$sig_noref = 11) { return 403; }',
          '    # ... your existing directives',
          '}',
        ].join('\n');

      case 'haproxy-sig':
        return [
          `    acl sig_ua    req.hdr(User-Agent) -m reg -i ^(${uaAlt})$`,
          '    acl sig_noref req.hdr_cnt(Referer) eq 0',
          `    acl sig_path  path_beg ${paths.join(' ')}`,
          '    http-request deny if sig_ua sig_noref sig_path',
        ].join('\n');

      case 'cloudflare-sig': {
        const uaExpr   = uas.map(u => `http.user_agent eq "${u.replace(/"/g, '\\"')}"`).join(' or ');
        const pathExpr = paths.map(p => `starts_with(http.request.uri.path, "${p}")`).join(' or ');
        return `(( ${uaExpr} ) and http.referer eq "" and ( ${pathExpr} ))`;
      }

      default:
        return uas.join('\n');
    }
  }

  // ── User-Agent-based generators ──
  if (_blockMode === 'ua') {
    const uas     = targets.map(t => t.key);
    const samples = targets.map(t => t.sample || t.key);
    const token   = uaTokenMode();
    // In token mode a substring match is intended, so anchor nothing.
    const rx      = uas.map(u => token ? reEscape(u) : `^${reEscape(u)}$`);

    switch (format) {
      case 'apache-ua': {
        const set = rx.map(r => `SetEnvIfNoCase User-Agent "${r}" bad_ua`).join('\n');
        return `# Requires mod_setenvif + mod_authz_core (Apache 2.4+)\n${set}\n\n<RequireAll>\n  Require all granted\n  Require not env bad_ua\n</RequireAll>`;
      }

      case 'apache-rewrite': {
        const conds = rx.map((r, i) =>
          `RewriteCond %{HTTP_USER_AGENT} "${r}" [NC${i < rx.length - 1 ? ',OR' : ''}]`).join('\n');
        return `RewriteEngine On\n${conds}\nRewriteRule ^ - [F,L]`;
      }

      case 'nginx-ua': {
        const map = rx.map(r => `    "~*${r}"  1;`).join('\n');
        return `# In the http { } block:\nmap $http_user_agent $bad_ua {\n    default 0;\n${map}\n}\n\n# In your server { } block:\nif ($bad_ua) {\n    return 403;\n}`;
      }

      case 'haproxy-ua': {
        const op  = token ? '-m sub -i' : '-m str -i';
        const acl = uas.map((u, i) => `    acl bad_ua_${i} req.hdr(User-Agent) ${op} "${u.replace(/"/g, '\\"')}"`).join('\n');
        const den = uas.map((_, i) => `    http-request deny if bad_ua_${i}`).join('\n');
        return `frontend www\n${acl}\n${den}`;
      }

      case 'iptables-ua':
        return uas.map(u =>
          `iptables -A INPUT -p tcp --dport 80 -m string --algo bm --string "User-Agent: ${u.replace(/"/g, '\\"')}" -j DROP`
        ).join('\n');

      case 'cloudflare-ua':
        return samples.map(u =>
          `curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/firewall/ua_rules" \\\n` +
          `  -H "Authorization: Bearer $CF_API_TOKEN" \\\n` +
          `  -H "Content-Type: application/json" \\\n` +
          `  --data '${JSON.stringify({
            mode: 'block',
            configuration: { target: 'ua', value: u },
            description: 'Suggested by live-log dashboard',
          }).replace(/'/g, "'\\''")}'`
        ).join('\n\n');

      case 'cloudflare-expr-ua': {
        const op = token ? 'contains' : 'eq';
        return uas.map(u => `(http.user_agent ${op} "${u.replace(/"/g, '\\"')}")`).join(' or ');
      }

      case 'fail2ban-ua': {
        const alt = rx.join('|');
        return [
          '# /etc/fail2ban/filter.d/bad-ua.conf',
          '[Definition]',
          `failregex = ^<HOST> .*"[^"]*" \\d+ \\S+ "[^"]*" "[^"]*(?:${alt})[^"]*"$`,
          'ignoreregex =',
          '',
          '# /etc/fail2ban/jail.local',
          '[bad-ua]',
          'enabled  = true',
          'filter   = bad-ua',
          'port     = http,https',
          'logpath  = ' + (document.getElementById('log-file-badge')?.textContent || '/var/log/apache2/access.log'),
          'maxretry = 2',
          'bantime  = 86400',
        ].join('\n');
      }

      case 'botrule-regex':
        return rx.join('|');

      case 'robots-txt':
        // Crawlers match their product token, never the whole UA string.
        return targets.map(t => `User-agent: ${t.token || t.key}\nDisallow: /`).join('\n\n');

      case 'plain-ua':
      default:
        return uas.join('\n');
    }
  }

  // ── Country-based generators ──
  if (_blockMode === 'country') {
    const codes = targets.map(t => t.key.toUpperCase());
    const names = targets.map(t => t.label);
    switch (format) {
      case 'iptables-geo':
        return `# Requires xt_geoip (xtables-addons)\niptables -A INPUT -m geoip --src-cc ${codes.join(',')} -j DROP\n# IPv6:\nip6tables -A INPUT -m geoip --src-cc ${codes.join(',')} -j DROP`;

      case 'nftables-geo': {
        const lines = [
          '# Define a named set; populate it from a country IP list (ipdeny.com, ipverse.net, …)',
          'table inet filter {',
          '  set country_block {',
          '    type ipv4_addr',
          '    flags interval',
          `    # Populate from country lists for: ${codes.join(', ')}`,
          '    elements = { /* paste CIDR ranges here */ }',
          '  }',
          '  chain input {',
          '    type filter hook input priority 0;',
          '    ip saddr @country_block drop',
          '  }',
          '}',
        ];
        return lines.join('\n');
      }

      case 'ufw-geo': {
        const lines = [
          '# 1. Install ipset:    apt-get install ipset',
          '# 2. Create the set:',
          'ipset create geoblock hash:net family inet hashsize 4096 maxelem 200000',
          '',
          '# 3. Populate from ipdeny.com country lists:',
          ...codes.map(cc =>
            `for ip in $(curl -s https://www.ipdeny.com/ipblocks/data/countries/${cc.toLowerCase()}.zone); do ipset add geoblock $ip; done`),
          '',
          '# 4. Add to /etc/ufw/before.rules above the COMMIT line:',
          '-I INPUT -m set --match-set geoblock src -j DROP',
          '',
          '# 5. Reload:',
          'ufw reload',
        ];
        return lines.join('\n');
      }

      case 'nginx-geo': {
        // Legacy ngx_http_geoip_module
        const map = codes.map(cc => `    ${cc}     1;`).join('\n');
        return `# In /etc/nginx/nginx.conf, http { } block:\ngeoip_country /usr/share/GeoIP/GeoIP.dat;\n\nmap $geoip_country_code $blocked_country {\n    default 0;\n${map}\n}\n\n# In your server { } block:\nif ($blocked_country) {\n    return 403;\n}`;
      }

      case 'nginx-geoip2': {
        const map = codes.map(cc => `    ${cc}     1;`).join('\n');
        return `# Requires ngx_http_geoip2_module + GeoLite2-Country.mmdb\n# In http { } block:\ngeoip2 /etc/nginx/geoip/GeoLite2-Country.mmdb {\n    $geoip2_country_code  country iso_code;\n}\n\nmap $geoip2_country_code $blocked_country {\n    default 0;\n${map}\n}\n\n# In your server { } block:\nif ($blocked_country) {\n    return 403;\n}`;
      }

      case 'apache-geo': {
        // mod_maxminddb
        const set = codes.map(cc => `SetEnvIf MM_COUNTRY_CODE ^${cc}$ DenyCountry`).join('\n');
        return `# Requires mod_maxminddb\nMaxMindDBEnable On\nMaxMindDBFile COUNTRY_DB /etc/apache2/GeoLite2-Country.mmdb\nMaxMindDBEnv MM_COUNTRY_CODE COUNTRY_DB/country/iso_code\n\n${set}\n\n<RequireAll>\n  Require all granted\n  Require not env DenyCountry\n</RequireAll>`;
      }

      case 'haproxy-geo': {
        const acl = codes.map(cc => `    acl block_${cc.toLowerCase()} src,map_ip(/etc/haproxy/country.map) ${cc}`).join('\n');
        const deny = codes.map(cc => `    http-request deny if block_${cc.toLowerCase()}`).join('\n');
        return `# country.map is built from MaxMind / ipdeny country IP lists\nfrontend www\n${acl}\n${deny}`;
      }

      case 'cloudflare-geo':
        return codes.map(cc =>
          `curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/firewall/access_rules/rules" \\\n` +
          `  -H "Authorization: Bearer $CF_API_TOKEN" \\\n` +
          `  -H "Content-Type: application/json" \\\n` +
          `  --data '{"mode":"block","configuration":{"target":"country","value":"${cc}"},"notes":"Block ${cc} — suggested by live-log dashboard"}'`
        ).join('\n\n');

      case 'cloudflare-expr': {
        const list = codes.map(c => `"${c}"`).join(' ');
        return `(ip.geoip.country in {${list}})`;
      }

      case 'fail2ban-geo': {
        const lines = [
          '# /etc/fail2ban/action.d/geoip-block.conf',
          '[Definition]',
          'actionban   = ipset add geoblock-fail2ban <ip> timeout 86400',
          'actionunban = ipset del geoblock-fail2ban <ip>',
          '',
          '# /etc/fail2ban/jail.local — add a filter that triggers on requests from these countries',
          '[geo-block]',
          'enabled  = true',
          'filter   = geo-block',
          'logpath  = ' + (document.getElementById('log-file-badge')?.textContent || '/var/log/apache2/access.log'),
          'action   = geoip-block',
          'maxretry = 1',
          `# Configure your filter to match log lines whose IP geo-resolves to: ${codes.join(', ')}`,
        ];
        return lines.join('\n');
      }

      case 'plain-cc':
      default:
        return codes.map((c, i) => `${c}\t${names[i]}`).join('\n');
    }
  }

  // ── IP-based generators ──
  const ips = targets.map(t => t.key);

  switch (format) {
    case 'iptables':
      return ips.map(ip => {
        const cmd = ip.includes(':') ? 'ip6tables' : 'iptables';
        return `${cmd} -A INPUT -s ${ip} -j DROP`;
      }).join('\n');

    case 'nftables':
      return ips.map(ip => {
        const fam = ip.includes(':') ? 'ip6' : 'ip';
        return `nft add rule inet filter input ${fam} saddr ${ip} drop`;
      }).join('\n');

    case 'ufw':
      return ips.map(ip => `ufw deny from ${ip}`).join('\n');

    case 'firewalld': {
      const lines = ips.map(ip => {
        const fam = ip.includes(':') ? 'ipv6' : 'ipv4';
        return `firewall-cmd --permanent --add-rich-rule='rule family="${fam}" source address="${ip}" drop'`;
      });
      lines.push('firewall-cmd --reload');
      return lines.join('\n');
    }

    case 'nginx':
      return ips.map(ip => `deny ${ip};`).join('\n');

    case 'apache': {
      const head = '<RequireAll>\n  Require all granted';
      const body = ips.map(ip => `  Require not ip ${ip}`).join('\n');
      return `${head}\n${body}\n</RequireAll>`;
    }

    case 'hosts-deny':
      return ips.map(ip => `ALL: ${ip}`).join('\n');

    case 'netsh':
      return ips.map((ip, i) =>
        `netsh advfirewall firewall add rule name="Block-${ip}" dir=in action=block remoteip=${ip}`
      ).join('\n');

    case 'cisco': {
      const out = ['ip access-list extended BLOCKLIST'];
      ips.forEach(ip => {
        if (ip.includes('/')) {
          // Translate /24 to wildcard mask
          const [net, bits] = ip.split('/');
          if (bits === '24') out.push(` deny ip ${net} 0.0.0.255 any`);
          else                out.push(` deny ip host ${net} any  ! review mask for /${bits}`);
        } else if (ip.includes(':')) {
          out.push(` deny ipv6 host ${ip} any`);
        } else {
          out.push(` deny ip host ${ip} any`);
        }
      });
      out.push(' permit ip any any');
      return out.join('\n');
    }

    case 'cloudflare':
      return ips.map(ip =>
        `curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/firewall/access_rules/rules" \\\n` +
        `  -H "Authorization: Bearer $CF_API_TOKEN" \\\n` +
        `  -H "Content-Type: application/json" \\\n` +
        `  --data '{"mode":"block","configuration":{"target":"${ip.includes('/') ? 'ip_range' : (ip.includes(':') ? 'ip6' : 'ip')}","value":"${ip}"},"notes":"Auto-suggested by live-log dashboard"}'`
      ).join('\n\n');

    case 'plain':
    default:
      return ips.join('\n');
  }
}

function renderBlockOutput() {
  const fmt    = document.getElementById('block-format')?.value || 'iptables';
  const out    = document.getElementById('block-output');
  const title  = document.getElementById('block-output-title');
  const hint   = document.getElementById('block-hint');
  const targets = selectedBlockTargets();

  if (out)   out.textContent   = generateBlockCommands(targets, fmt);
  if (title) title.textContent = `Commands · ${fmt} · ${targets.length} target${targets.length === 1 ? '' : 's'}`;
  if (hint)  hint.innerHTML    = BLOCK_HINTS[fmt] || '';
  document.getElementById('block-selected-count').textContent = String(targets.length);
}

(function setupBlockTab() {
  const fmt     = document.getElementById('block-format');
  const topCh   = document.getElementById('block-select-all');
  const aggCh   = document.getElementById('block-aggregate-cidr');
  const botsCh  = document.getElementById('block-bots-only');
  const copy    = document.getElementById('block-copy-btn');
  const refresh = document.getElementById('block-refresh-btn');
  if (!fmt) return;

  renderModeDoc();

  refresh?.addEventListener('click', async () => {
    refresh.disabled = true;
    refresh.classList.add('spinning');
    try {
      await fetchBlockSuggestions({ preserveSelection: true });
    } finally {
      refresh.disabled = false;
      refresh.classList.remove('spinning');
    }
  });

  populateFormatSelect();
  fmt.addEventListener('change', renderBlockOutput);

  // Mode switch
  document.querySelectorAll('.block-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === _blockMode) return;
      _blockMode = mode;
      document.querySelectorAll('.block-mode-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === mode));
      document.querySelectorAll('.ip-mode-only').forEach(el =>
        el.style.display = mode === 'ip' ? '' : 'none');
      document.querySelectorAll('.country-mode-only').forEach(el =>
        el.style.display = mode === 'country' ? '' : 'none');
      document.querySelectorAll('.ua-mode-only').forEach(el =>
        el.style.display = mode === 'ua' ? '' : 'none');
      document.querySelectorAll('.sig-mode-only').forEach(el =>
        el.style.display = mode === 'signature' ? '' : 'none');
      renderModeDoc();
      populateFormatSelect();
      fetchBlockSuggestions();
    });
  });

  // Toggle every visible row's checkbox in-place without rebuilding the table
  // (avoids the visual "reload" effect on scroll position).
  const toggleAll = (checked) => {
    document.querySelectorAll('#tbody-block .block-row-check').forEach(cb => {
      cb.checked = checked;
      const k = cb.dataset.key;
      if (checked) _blockSelected.add(k);
      else         _blockSelected.delete(k);
    });
    syncBlockHeaderCheck();
    renderBlockOutput();
  };
  topCh?.addEventListener('change', () => toggleAll(topCh.checked));

  // Filter toggles change which rows are visible, so a re-render is required —
  // but DO preserve existing selections instead of wiping them.
  aggCh?.addEventListener('change', () => {
    renderBlockTable();
  });

  botsCh?.addEventListener('change', () => {
    renderBlockTable();
  });

  // UA and signature filters are applied server-side, so these need a refetch.
  ['block-ua-token', 'block-ua-bots-only', 'block-ua-min',
   'block-sig-share', 'block-sig-min'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => fetchBlockSuggestions());
  });

  // The paths box only shapes the generated rule text, not the query, so it
  // re-renders the output without refetching.
  document.getElementById('block-sig-paths')
    ?.addEventListener('input', () => renderBlockOutput());

  copy?.addEventListener('click', async () => {
    const text = document.getElementById('block-output')?.textContent || '';
    const EMPTY = ['No IPs selected.', 'No countries selected.', 'No User-Agents selected.',
                   'No signatures selected.'];
    if (!text || EMPTY.includes(text)) return;
    try {
      await navigator.clipboard.writeText(text);
      const orig = copy.textContent;
      copy.textContent = 'Copied ✓';
      setTimeout(() => (copy.textContent = orig), 1500);
    } catch (_) {
      // Fallback: select the text
      const range = document.createRange();
      range.selectNodeContents(document.getElementById('block-output'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
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
      // Block tab is intentionally NOT auto-refreshed — user selections
      // would be wiped. Use the Refresh button on the panel.
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
      if (currentTab === 'urls')     fetchUrlStats();
      if (currentTab === 'domains')  fetchDomainStats();
      if (currentTab === 'botrules' && !document.querySelector('#tbody-botrules .pattern-textarea')) fetchBotRules();
      // Block tab: do not auto-refresh while user is viewing it — selections
      // would be wiped. Manual refresh via the panel's Refresh button.
    }
  };
}

connectWS();
