import { sanitizeInput, formatTime, isIncognito } from '../lib/utils.js';
import {
  getCookieInsights,
  decodeFlags,
  getLifespanText,
  getChurnText,
  getDeleteWarning,
  getBlockWarning,
  getPrivacyThreatMeaning,
  getBreakageImpactMeaning,
} from '../lib/cookieInsights.js';

const state = {
  cookies: [],
  history: [],
  mutedDomains: {},
  blockedDomains: {},
  settings: {},
  filters: { search: '', risk: 'all' },
  currentTab: 'active',
  selectedCookie: null,
};

function createElementFromHTML(htmlString) {
  const template = document.createElement('template');
  const fragment = document.createDocumentFragment();
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  
  Array.from(doc.body.childNodes).forEach(node => {
    fragment.appendChild(node.cloneNode(true));
  });
  
  return fragment.firstChild;
}

function setChildren(parent, htmlString) {
  parent.textContent = '';
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  
  Array.from(doc.body.childNodes).forEach(node => {
    parent.appendChild(node.cloneNode(true));
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initializeEventListeners();

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('firstLaunch') === 'true') {
    showFirstLaunchWizard();
    return;
  }
  
  await loadSettings();
  await loadData();
  setInterval(refreshActiveData, 3000);
});

function initializeEventListeners() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
  });
  
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('settingsBackBtn').addEventListener('click', closeSettings);
  document.getElementById('refreshBtn').addEventListener('click', handleRefreshClick);
  
  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.filters.search = e.target.value.toLowerCase();
    renderCookieList();
  });
  
  document.getElementById('riskFilter').addEventListener('change', (e) => {
    state.filters.risk = e.target.value;
    renderCookieList();
  });
  
  document.getElementById('historyLimit').addEventListener('change', loadHistory);
  document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
  
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', closeModals);
  });
  
  ['incognitoEnabled', 'notificationsEnabled', 'developerMode'].forEach(id => {
    document.getElementById(id).addEventListener('change', autoSaveSettings);
  });
  
  document.getElementById('themeSelect').addEventListener('change', autoSaveSettings);
  
  document.getElementById('exportDataBtn').addEventListener('click', () => exportData(false));
  document.getElementById('exportWithValuesBtn').addEventListener('click', () => exportData(true));
  document.getElementById('muteDomainBtn').addEventListener('click', muteDomainFromDetail);
  document.getElementById('deleteCookieBtn').addEventListener('click', deleteCookie);
  document.getElementById('blockDomainBtn').addEventListener('click', blockDomainFromDetail);
  document.getElementById('cleanNowBtn').addEventListener('click', cleanNow);
  document.getElementById('completeWizardBtn')?.addEventListener('click', completeWizard);

  document.getElementById('mutedList').addEventListener('click', (e) => {
    if (e.target.matches('[data-action="unmute"]')) {
      const domain = e.target.dataset.domain;
      if (domain) confirmAndUnmute(domain);
    }
  });

  document.getElementById('blockedList').addEventListener('click', (e) => {
    if (e.target.matches('[data-action="unblock"]')) {
      const domain = e.target.dataset.domain;
      const storeId = e.target.dataset.storeId;
      if (domain && storeId) confirmAndUnblock(domain, storeId);
    }
  });

  document.querySelectorAll('.modal, .detail-panel').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModals();
    });
  });

  document.getElementById('testNotifyBtn').addEventListener('click', async () => {
    try {
      const response = await browser.runtime.sendMessage({ type: 'TRIGGER_TEST_NOTIFICATION' });
      if (response.success) {
        switchTab('active');
        closeSettings();
        await loadActiveCookies(); 
      }
    } catch (err) {
      console.error("Test failed", err);
    }
  });
}

async function handleRefreshClick() {
  const icon = document.getElementById('refreshIcon');
  icon.classList.add('rotating');
  
  await refreshActiveData();
  
  setTimeout(() => {
    icon.classList.remove('rotating');
  }, 500);
}

async function loadData() {
  await Promise.all([loadActiveCookies(), loadHistory(), loadRules()]);
}

async function loadActiveCookies() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_COOKIES' });
    if (response.error) {
      console.error('Failed to load cookies:', response.error);
      return;
    }
    
    state.cookies = response.cookies || [];
    
    if (response.circuitBreakers && response.circuitBreakers.length > 0) {
      showCircuitBreakerAlerts(response.circuitBreakers);
    }
    
    renderCookieList();
    updateStats();
  } catch (error) {
    console.error('Failed to load cookies:', error);
  }
}

async function loadHistory() {
  try {
    const limit = parseInt(document.getElementById('historyLimit').value);
    const response = await browser.runtime.sendMessage({ type: 'GET_HISTORY', limit });
    
    if (response.error) {
      console.error('Failed to load history:', response.error);
      return;
    }
    
    state.history = response.history || [];
    renderHistory();
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

async function loadRules() {
  try {
    const result = await browser.storage.local.get(['cg_muted_domains', 'cg_blocked_domains']);
    state.mutedDomains = result.cg_muted_domains || {};
    state.blockedDomains = result.cg_blocked_domains || {};

    await Promise.all([renderMutedList(), renderBlockedList()]);
    updateStats();
  } catch (error) {
    console.error('Failed to load rules:', error);
  }
}

async function loadSettings() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response.error) {
      console.error('Failed to load settings:', response.error);
      return;
    }
    
    state.settings = response.settings || {};
    applyTheme(state.settings.theme);
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

function getFilteredCookies() {
  return state.cookies.filter(cookie => {
    if (state.filters.search) {
      const searchLower = state.filters.search;
      if (!cookie.name.toLowerCase().includes(searchLower) &&
          !cookie.domain.toLowerCase().includes(searchLower)) {
        return false;
      }
    }

    if (state.filters.risk !== 'all' && cookie.riskLevel !== state.filters.risk) {
      return false;
    }

    return true;
  });
}

function isFilterActive() {
  return state.filters.search !== '' || state.filters.risk !== 'all';
}

function updateCleanButton(filtered) {
  const btn = document.getElementById('cleanNowBtn');
  const label = isFilterActive() ? 'Clean Filtered' : 'Clean All';
  btn.textContent = `${label} (${filtered.length})`;
  btn.disabled = filtered.length === 0;
}

function renderCookieList() {
  const container = document.getElementById('cookieList');

  let filtered = getFilteredCookies();
  updateCleanButton(filtered);

  if (filtered.length === 0) {
    const emptyHTML = `
      <div class="empty-state">
        <svg class="empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
          <line x1="9" y1="9" x2="9.01" y2="9"></line>
          <line x1="15" y1="9" x2="15.01" y2="9"></line>
        </svg>
        <p class="empty-title">${state.cookies.length === 0 ? 'No cookies detected' : 'No matching cookies'}</p>
        <p class="empty-subtitle">${state.cookies.length === 0 ? 'Browse websites to see cookie activity' : 'Try adjusting your filters'}</p>
      </div>
    `;
    setChildren(container, emptyHTML);
    return;
  }
  
  filtered.sort((a, b) => b.timestamp - a.timestamp);
  
  container.textContent = '';
  filtered.forEach(cookie => {
    const item = createCookieItemElement(cookie);
    container.appendChild(item);
  });
  
  container.querySelectorAll('.cookie-item').forEach((item, index) => {
    item.addEventListener('click', () => showCookieDetail(filtered[index]));
  });
}

function createCookieItemElement(cookie) {
  const item = document.createElement('div');
  item.className = 'cookie-item';
  item.dataset.hash = cookie.identityHash;

  // Header strip: domain.com -> cookie_name
  const route = document.createElement('div');
  route.className = 'cookie-route';

  const routeDomain = document.createElement('span');
  routeDomain.className = 'route-domain';
  routeDomain.textContent = sanitizeInput(cookie.domain);

  const routeArrow = document.createElement('span');
  routeArrow.className = 'route-arrow';
  routeArrow.textContent = '→';

  const routeName = document.createElement('span');
  routeName.className = 'route-name';
  routeName.textContent = sanitizeInput(cookie.name);

  route.appendChild(routeDomain);
  route.appendChild(routeArrow);
  route.appendChild(routeName);

  const meta = document.createElement('div');
  meta.className = 'cookie-meta';

  const metaLeft = document.createElement('div');
  metaLeft.className = 'cookie-meta-left';

  // 3-segment risk gauge, illuminated entirely via CSS data-attribute selectors
  const riskIndicator = document.createElement('div');
  riskIndicator.className = 'risk-indicator';

  const gauge = document.createElement('div');
  gauge.className = 'risk-gauge';
  gauge.dataset.risk = cookie.riskLevel;
  for (let i = 0; i < 3; i++) {
    const bar = document.createElement('span');
    bar.className = 'risk-gauge-bar';
    gauge.appendChild(bar);
  }

  const riskLabel = document.createElement('span');
  riskLabel.className = `risk-label risk-label-${cookie.riskLevel}`;
  riskLabel.textContent = cookie.riskLevel.toUpperCase();

  riskIndicator.appendChild(gauge);
  riskIndicator.appendChild(riskLabel);
  metaLeft.appendChild(riskIndicator);

  const badges = document.createElement('div');
  badges.className = 'cookie-badges';

  if (cookie.isPartitioned) {
    const partBadge = document.createElement('span');
    partBadge.className = 'badge badge-partitioned';
    partBadge.textContent = '[PART]';
    badges.appendChild(partBadge);
  }

  if (cookie.secure) {
    const secBadge = document.createElement('span');
    secBadge.className = 'badge badge-secure';
    secBadge.textContent = '[SEC]';
    badges.appendChild(secBadge);
  }

  if (badges.childNodes.length > 0) {
    metaLeft.appendChild(badges);
  }

  const metaRight = document.createElement('div');
  metaRight.className = 'cookie-meta-right';

  const time = document.createElement('span');
  time.className = 'cookie-time';
  time.textContent = formatTime(cookie.timestamp);
  metaRight.appendChild(time);

  if (cookie.changeCount > 1) {
    const changes = document.createElement('span');
    changes.className = 'cookie-changes';
    changes.textContent = `${cookie.changeCount} changes`;
    metaRight.appendChild(changes);
  }

  meta.appendChild(metaLeft);
  meta.appendChild(metaRight);

  item.appendChild(route);
  item.appendChild(meta);

  return item;
}

function renderHistory() {
  const container = document.getElementById('historyList');
  
  if (state.history.length === 0) {
    const emptyHTML = `
      <div class="empty-state">
        <svg class="empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <p class="empty-title">No history yet</p>
        <p class="empty-subtitle">Cookie events will appear here</p>
      </div>
    `;
    setChildren(container, emptyHTML);
    return;
  }

  const RENDER_LIMIT = 100;
  const visibleHistory = state.history.slice(0, RENDER_LIMIT);
  
  container.textContent = '';
  visibleHistory.forEach(event => {
    const item = createHistoryItemElement(event);
    container.appendChild(item);
  });

  if (state.history.length > RENDER_LIMIT) {
    const warning = document.createElement('div');
    warning.className = 'history-notice';
    warning.textContent = `Showing recent ${RENDER_LIMIT} of ${state.history.length} events. Export data to see full logs.`;
    container.appendChild(warning);
  }
}

function createHistoryItemElement(event) {
  const item = document.createElement('div');
  item.className = 'history-item';

  const mainDiv = document.createElement('div');

  const action = document.createElement('span');
  action.className = `history-action ${event.action}`;
  action.textContent = event.action.toUpperCase().replace('_', ' ');

  mainDiv.appendChild(action);
  mainDiv.appendChild(document.createTextNode(' '));

  if (event.action === 'bulk_deleted') {
    const summary = document.createElement('span');
    summary.textContent = `${event.cookiesRemoved} cookie${event.cookiesRemoved === 1 ? '' : 's'} across ${event.domainsAffected} domain${event.domainsAffected === 1 ? '' : 's'}`;
    mainDiv.appendChild(summary);
  } else if (event.action === 'blocked') {
    const domainSpan = document.createElement('strong');
    domainSpan.textContent = sanitizeInput(event.domain);
    mainDiv.appendChild(domainSpan);

    if (event.count > 1) {
      const countSpan = document.createElement('span');
      countSpan.style.color = 'var(--text-tertiary)';
      countSpan.textContent = ` (x${event.count})`;
      mainDiv.appendChild(countSpan);
    }
  } else {
    const cookieName = document.createElement('strong');
    cookieName.textContent = sanitizeInput(event.name);

    const onText = document.createElement('span');
    onText.style.color = 'var(--text-tertiary)';
    onText.textContent = ' on ';

    const domainSpan = document.createElement('span');
    domainSpan.textContent = sanitizeInput(event.domain);

    mainDiv.appendChild(cookieName);
    mainDiv.appendChild(onText);
    mainDiv.appendChild(domainSpan);
  }

  const time = document.createElement('div');
  time.className = 'history-time';
  time.textContent = formatTime(event.timestamp);

  item.appendChild(mainDiv);
  item.appendChild(time);

  return item;
}

// Muted domains are stored as { [etld]: info } (global, not container-scoped).
function flattenMutedDomains(mutedDomains) {
  return Object.entries(mutedDomains).map(([domain, info]) => ({ domain, info, storeId: null }));
}

// Blocked domains are stored as { [storeId]: { [etld]: info } } so a block in
// one container/private-browsing context doesn't leak into another.
function flattenBlockedDomains(blockedDomains) {
  const entries = [];
  for (const [storeId, domains] of Object.entries(blockedDomains)) {
    for (const [domain, info] of Object.entries(domains)) {
      entries.push({ domain, info, storeId });
    }
  }
  return entries;
}

function getContainerLabel(storeId) {
  if (storeId === null || storeId === undefined) return null;
  if (isIncognito(storeId)) return 'Private Browsing';
  if (storeId === '0' || storeId === 'firefox-default') return 'Default';
  return `Container ${storeId}`;
}

async function fetchDomainStats(domain, storeId) {
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_DOMAIN_STATS', domain, storeId });
    if (response.error) {
      console.error('Failed to fetch domain stats:', response.error);
      return null;
    }
    return response.stats;
  } catch (error) {
    console.error('Failed to fetch domain stats:', error);
    return null;
  }
}

async function renderMutedList() {
  await renderRuleList('mutedList', flattenMutedDomains(state.mutedDomains), 'muted');
}

async function renderBlockedList() {
  await renderRuleList('blockedList', flattenBlockedDomains(state.blockedDomains), 'blocked');
}

async function renderRuleList(containerId, entries, type) {
  const container = document.getElementById(containerId);

  if (entries.length === 0) {
    const emptyHTML = `
      <div class="empty-state">
        <svg class="empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>
        <p class="empty-title">No ${type} domains</p>
        <p class="empty-subtitle">${type === 'blocked'
          ? 'Block domains from a cookie\'s details to remove their cookies'
          : 'Mute domains from cookie context menus'}</p>
      </div>
    `;
    setChildren(container, emptyHTML);
    return;
  }

  const statsResults = await Promise.all(entries.map(entry => fetchDomainStats(entry.domain, entry.storeId)));

  container.textContent = '';
  entries.forEach((entry, index) => {
    const item = createDomainRuleItem(entry.domain, entry.info, type, entry.storeId, statsResults[index]);
    container.appendChild(item);
  });
}

function createDomainRuleItem(domain, info, type, storeId, stats) {
  const item = document.createElement('div');
  item.className = 'muted-item';

  const infoDiv = document.createElement('div');
  infoDiv.className = 'muted-info';

  const domainRow = document.createElement('div');
  domainRow.className = 'muted-domain-row';

  const domainDiv = document.createElement('div');
  domainDiv.className = 'muted-domain';
  domainDiv.textContent = sanitizeInput(domain);
  domainRow.appendChild(domainDiv);

  const containerLabel = getContainerLabel(storeId);
  if (containerLabel) {
    const containerBadge = document.createElement('span');
    containerBadge.className = 'container-badge';
    containerBadge.textContent = containerLabel;
    domainRow.appendChild(containerBadge);
  }

  infoDiv.appendChild(domainRow);

  const verb = type === 'blocked' ? 'Blocked' : 'Muted';
  const dateDiv = document.createElement('div');
  dateDiv.className = 'muted-date';
  dateDiv.textContent = `${verb} ${formatTime(info.timestamp)}${info.manual ? ' (Manual)' : ''}`;
  infoDiv.appendChild(dateDiv);

  const statsDiv = document.createElement('div');
  statsDiv.className = 'rule-stats';

  if (!stats) {
    statsDiv.classList.add('rule-stats-unknown');
    statsDiv.textContent = 'Live cookie status unavailable';
  } else if (type === 'blocked') {
    if (stats.cookieCount === 0) {
      statsDiv.classList.add('rule-stats-clean');
      statsDiv.textContent = 'Block active — 0 cookies present';
    } else {
      statsDiv.classList.add('rule-stats-warning');
      statsDiv.textContent = `${stats.cookieCount} cookie${stats.cookieCount === 1 ? '' : 's'} currently present — cleanup pending`;
    }
  } else {
    const { low, medium, high } = stats.riskCounts;
    statsDiv.textContent = `${stats.cookieCount} active cookie${stats.cookieCount === 1 ? '' : 's'} (${high} high, ${medium} medium, ${low} low risk)`;
  }
  infoDiv.appendChild(statsDiv);

  const btn = document.createElement('button');
  btn.className = 'btn btn-secondary';
  btn.dataset.action = type === 'blocked' ? 'unblock' : 'unmute';
  btn.dataset.domain = sanitizeInput(domain);
  if (storeId !== null && storeId !== undefined) {
    btn.dataset.storeId = sanitizeInput(storeId);
  }
  btn.textContent = type === 'blocked' ? 'Unblock' : 'Unmute';

  item.appendChild(infoDiv);
  item.appendChild(btn);

  return item;
}

function countBlockedDomains() {
  return Object.values(state.blockedDomains)
    .reduce((sum, domains) => sum + Object.keys(domains).length, 0);
}

function updateStats() {
  document.getElementById('activeCookies').textContent = state.cookies.length;
  document.getElementById('highRiskCount').textContent = state.cookies.filter(c => c.riskLevel === 'high').length;
  document.getElementById('blockedCount').textContent = countBlockedDomains();
  document.getElementById('mutedCount').textContent = Object.keys(state.mutedDomains).length;
}

function switchTab(tabName) {
  state.currentTab = tabName;
  document.body.dataset.tab = tabName;

  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  document.getElementById(`${tabName}Tab`).classList.add('active');
  
  if (tabName === 'history' && state.history.length === 0) {
    loadHistory();
  } else if (tabName === 'rules' && Object.keys(state.mutedDomains).length === 0 && Object.keys(state.blockedDomains).length === 0) {
    loadRules();
  }
}

function showCookieDetail(cookie) {
  state.selectedCookie = cookie;
  const modal = document.getElementById('detailModal');
  const content = document.getElementById('detailContent');

  content.textContent = '';

  const insights = getCookieInsights(cookie);

  const detailDiv = document.createElement('div');
  detailDiv.className = 'cookie-detail';

  detailDiv.appendChild(buildHeaderZone(cookie, insights));
  detailDiv.appendChild(buildImpactZone(insights));
  detailDiv.appendChild(buildFlagsZone(cookie));
  detailDiv.appendChild(buildFootprintZone(cookie));

  content.appendChild(detailDiv);

  document.getElementById('deleteWarning').textContent = getDeleteWarning(insights);
  document.getElementById('blockWarning').textContent = getBlockWarning(insights, sanitizeInput(cookie.etld));

  modal.classList.add('active');
}

// Zone A: identity, ownership, and a plain-language purpose statement.
function buildHeaderZone(cookie, insights) {
  const zone = document.createElement('div');
  zone.className = 'cd-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'cd-title-row';

  const title = document.createElement('h2');
  title.className = 'cd-title';
  if (insights.displayName) {
    title.textContent = insights.displayName;
  } else {
    const code = document.createElement('code');
    code.className = 'cd-code';
    code.textContent = sanitizeInput(cookie.name);
    title.appendChild(code);
  }
  titleRow.appendChild(title);

  const categoryBadge = document.createElement('span');
  categoryBadge.className = 'cd-category-badge';
  categoryBadge.textContent = insights.category;
  titleRow.appendChild(categoryBadge);

  zone.appendChild(titleRow);

  const subheader = document.createElement('p');
  subheader.className = 'cd-subheader';
  subheader.textContent = insights.owner
    ? `Managed by ${insights.owner} on ${sanitizeInput(cookie.domain)}`
    : `Set by ${sanitizeInput(cookie.domain)}`;
  zone.appendChild(subheader);

  if (insights.displayName) {
    const technicalName = document.createElement('p');
    technicalName.className = 'cd-technical-name';
    technicalName.textContent = 'Technical name: ';
    const code = document.createElement('code');
    code.className = 'cd-code';
    code.textContent = sanitizeInput(cookie.name);
    technicalName.appendChild(code);
    zone.appendChild(technicalName);
  }

  const purpose = document.createElement('p');
  purpose.className = 'cd-purpose';
  purpose.textContent = insights.purpose;
  zone.appendChild(purpose);

  return zone;
}

// Zone B: side-by-side privacy threat vs. site breakage impact.
function buildImpactZone(insights) {
  const zone = document.createElement('div');
  zone.className = 'impact-matrix';

  zone.appendChild(buildImpactBox('Privacy Threat', insights.privacyThreat, getPrivacyThreatMeaning(insights.privacyThreat)));
  zone.appendChild(buildImpactBox('Breakage Impact', insights.breakageImpact, getBreakageImpactMeaning(insights.breakageImpact)));

  return zone;
}

function buildImpactBox(label, level, meaning) {
  const box = document.createElement('div');
  box.className = `impact-box impact-${level}`;

  const labelEl = document.createElement('div');
  labelEl.className = 'impact-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('div');
  valueEl.className = 'impact-value';
  valueEl.textContent = level.toUpperCase();

  const meaningEl = document.createElement('div');
  meaningEl.className = 'impact-meaning';
  meaningEl.textContent = meaning;

  box.appendChild(labelEl);
  box.appendChild(valueEl);
  box.appendChild(meaningEl);

  return box;
}

// Zone C: decoded technical flags with hazard/safety summaries.
function buildFlagsZone(cookie) {
  const zone = document.createElement('div');
  zone.className = 'flags-list';

  const heading = document.createElement('h3');
  heading.className = 'cd-zone-heading';
  heading.textContent = 'Technical Flags';
  zone.appendChild(heading);

  const TAG_TEXT = { safe: '[SAFE]', warning: '[WARNING]', info: '[INFO]', critical: '[CRITICAL]' };

  decodeFlags(cookie).forEach(flag => {
    const item = document.createElement('div');
    item.className = `flag-indicator flag-${flag.level}`;

    const tag = document.createElement('span');
    tag.className = 'flag-tag';
    tag.textContent = TAG_TEXT[flag.level] || 'INFO';
    item.appendChild(tag);

    const body = document.createElement('div');
    body.className = 'flag-body';

    const labelEl = document.createElement('div');
    labelEl.className = 'flag-label';
    labelEl.textContent = flag.label;

    const implicationEl = document.createElement('div');
    implicationEl.className = 'flag-implication';
    implicationEl.textContent = flag.implication;

    body.appendChild(labelEl);
    body.appendChild(implicationEl);
    item.appendChild(body);

    zone.appendChild(item);
  });

  return zone;
}

// Zone D: lifespan and churn activity, summarized in plain language.
function buildFootprintZone(cookie) {
  const zone = document.createElement('div');
  zone.className = 'footprint-row';

  zone.appendChild(buildFootprintItem('Lifespan', getLifespanText(cookie)));
  zone.appendChild(buildFootprintItem('Activity', getChurnText(cookie.changeCount)));

  return zone;
}

function buildFootprintItem(label, value) {
  const item = document.createElement('div');
  item.className = 'footprint-item';

  const labelEl = document.createElement('div');
  labelEl.className = 'footprint-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('div');
  valueEl.className = 'footprint-value';
  valueEl.textContent = value;

  item.appendChild(labelEl);
  item.appendChild(valueEl);

  return item;
}

function openSettings() {
  const panel = document.getElementById('settingsPanel');
  
  document.getElementById('incognitoEnabled').checked = state.settings.incognitoEnabled || false;
  document.getElementById('notificationsEnabled').checked = state.settings.notificationsEnabled !== false;
  document.getElementById('themeSelect').value = state.settings.theme || 'auto';
  document.getElementById('developerMode').checked = state.settings.developerMode || false;
  
  document.getElementById('developerOptions').style.display = state.settings.developerMode ? 'block' : 'none';
  
  loadStorageStats();
  panel.classList.add('active');
}

function closeSettings() {
  const panel = document.getElementById('settingsPanel');
  panel.classList.remove('active');
}

async function autoSaveSettings() {
  const newSettings = {
    incognitoEnabled: document.getElementById('incognitoEnabled').checked,
    notificationsEnabled: document.getElementById('notificationsEnabled').checked,
    theme: document.getElementById('themeSelect').value,
    developerMode: document.getElementById('developerMode').checked,
  };
  
  document.getElementById('developerOptions').style.display = newSettings.developerMode ? 'block' : 'none';

  try {
    await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: newSettings });
    
    state.settings = { ...state.settings, ...newSettings };
    applyTheme(newSettings.theme);
  } catch (error) {
    console.error('Failed to auto-save settings:', error);
  }
}

async function loadStorageStats() {
  try {
    document.getElementById('storageUsed').textContent = 'Loading...';
    document.getElementById('eventsRetained').textContent = state.history.length.toString();
  } catch (error) {
    console.error('Failed to load storage stats:', error);
  }
}

async function muteDomainFromDetail() {
  if (!state.selectedCookie) return;

  try {
    await browser.runtime.sendMessage({
      type: 'MUTE_DOMAIN',
      domain: state.selectedCookie.etld,
      manual: true,
    });

    closeModals();
    await loadRules();
    await loadActiveCookies();
  } catch (error) {
    console.error('Failed to mute domain:', error);
    alert('Failed to mute domain');
  }
}

async function confirmAndUnmute(domain) {
  const stats = await fetchDomainStats(domain, null);
  const countNote = stats
    ? ` It currently has ${stats.cookieCount} active cookie${stats.cookieCount === 1 ? '' : 's'}${stats.thirdPartyCount > 0 ? `, including ${stats.thirdPartyCount} third-party` : ''}.`
    : '';

  const confirmed = confirm(
    `Unmute ${domain}? It will reappear in your active list and trigger high-risk notifications again.${countNote}`
  );
  if (!confirmed) return;

  await unmuteDomain(domain);
}

async function unmuteDomain(domain) {
  try {
    await browser.runtime.sendMessage({ type: 'UNMUTE_DOMAIN', domain });
    await loadRules();
    await loadActiveCookies();
  } catch (error) {
    console.error('Failed to unmute domain:', error);
    alert('Failed to unmute domain');
  }
}

async function deleteCookie() {
  if (!state.selectedCookie) return;

  try {
    const response = await browser.runtime.sendMessage({
      type: 'DELETE_COOKIE',
      identityHash: state.selectedCookie.identityHash,
    });

    if (response.error) {
      alert(response.error);
      return;
    }

    closeModals();
    await loadActiveCookies();
    await loadHistory();
  } catch (error) {
    console.error('Failed to delete cookie:', error);
    alert('Failed to delete cookie');
  }
}

async function blockDomainFromDetail() {
  if (!state.selectedCookie) return;

  const domain = state.selectedCookie.etld;
  const storeId = state.selectedCookie.storeId;
  const affectedCount = state.cookies.filter(c => c.etld === domain && c.storeId === storeId).length;
  const containerLabel = getContainerLabel(storeId);

  const confirmed = confirm(
    `Block ${domain} in ${containerLabel}? This will immediately delete ${affectedCount} cookie${affectedCount === 1 ? '' : 's'} from this domain in this container and prevent new ones, including any active login session.`
  );
  if (!confirmed) return;

  try {
    const response = await browser.runtime.sendMessage({
      type: 'BLOCK_DOMAIN',
      domain,
      storeId,
    });

    if (response.error) {
      alert(response.error);
      return;
    }

    closeModals();
    await loadRules();
    await loadActiveCookies();
    await loadHistory();
  } catch (error) {
    console.error('Failed to block domain:', error);
    alert('Failed to block domain');
  }
}

async function confirmAndUnblock(domain, storeId) {
  const containerLabel = getContainerLabel(storeId);
  const identityHash = `blocked:${storeId}:${domain}`;
  const blockEvent = state.history.find(e =>
    e.action === 'blocked' && e.identityHash === identityHash && !e.episodeClosed
  );
  const removedCount = blockEvent ? (blockEvent.count || 0) : 0;

  const historyNote = removedCount > 0
    ? ` Since this block was put in place, CookieGuard has intercepted and deleted ${removedCount} cookie${removedCount === 1 ? '' : 's'} from this domain — unblocking will allow it to set cookies again, including any cross-site trackers or advertising identifiers it previously used.`
    : ' This domain has not attempted to set cookies since being blocked, but unblocking removes all enforcement.';

  const confirmed = confirm(
    `Unblock ${domain} (${containerLabel})?${historyNote} CookieGuard will resume passive monitoring but will no longer auto-delete its cookies.`
  );
  if (!confirmed) return;

  await unblockDomain(domain, storeId);
}

async function unblockDomain(domain, storeId) {
  try {
    await browser.runtime.sendMessage({ type: 'UNBLOCK_DOMAIN', domain, storeId });
    await loadRules();
    await loadActiveCookies();
    await loadHistory();
  } catch (error) {
    console.error('Failed to unblock domain:', error);
    alert('Failed to unblock domain');
  }
}

async function cleanNow() {
  const filtered = getFilteredCookies();
  if (filtered.length === 0) return;

  const message = isFilterActive()
    ? `Delete ${filtered.length} cookie${filtered.length === 1 ? '' : 's'} matching the current filter?`
    : `This will delete ALL ${filtered.length} tracked cookies, including session and login cookies. Continue?`;

  if (!confirm(message)) return;

  try {
    const response = await browser.runtime.sendMessage({
      type: 'CLEAN_COOKIES',
      identityHashes: filtered.map(c => c.identityHash),
    });

    if (response.error) {
      alert(response.error);
      return;
    }

    await loadActiveCookies();
    await loadHistory();
  } catch (error) {
    console.error('Failed to clean cookies:', error);
    alert('Failed to clean cookies');
  }
}

async function clearHistory() {
  if (!confirm('Clear all cookie history? This cannot be undone.')) return;
  
  try {
    await browser.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
    state.history = [];
    renderHistory();
  } catch (error) {
    console.error('Failed to clear history:', error);
    alert('Failed to clear history');
  }
}

async function exportData(includeValues) {
  if (includeValues && !confirm('Export will include cookie values. This may contain sensitive data. Continue?')) {
    return;
  }
  
  try {
    const response = await browser.runtime.sendMessage({ type: 'EXPORT_DATA', includeValues });
    
    if (response.error) {
      alert(response.error);
      return;
    }
    
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cookieguard-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export data:', error);
    alert('Failed to export data');
  }
}

async function refreshActiveData() {
  await loadActiveCookies();
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function closeModals() {
  document.querySelectorAll('.modal, .detail-panel').forEach(modal => {
    modal.classList.remove('active');
  });
  state.selectedCookie = null;
}

function showCircuitBreakerAlerts(domains) {
  const container = document.getElementById('circuitBreakerAlerts');
  
  container.textContent = '';
  domains.forEach(domain => {
    const alert = createCircuitBreakerAlert(domain);
    container.appendChild(alert);
  });
}

function createCircuitBreakerAlert(domain) {
  const alert = document.createElement('div');
  alert.className = 'alert';
  
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 2L1 21h22L12 2zm0 3.5L19.5 19h-15L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z');
  svg.appendChild(path);
  
  const text = document.createElement('span');
  text.textContent = 'High activity from ';
  
  const strong = document.createElement('strong');
  strong.textContent = sanitizeInput(domain);
  
  text.appendChild(strong);
  text.appendChild(document.createTextNode(' has been muted temporarily'));
  
  alert.appendChild(svg);
  alert.appendChild(text);
  
  return alert;
}

function showFirstLaunchWizard() {
  const modal = document.getElementById('firstLaunchModal');
  modal.style.display = 'flex';
}

function completeWizard() {
  const modal = document.getElementById('firstLaunchModal');
  modal.style.display = 'none';
  window.location.href = 'popup.html';
}