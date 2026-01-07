import { sanitizeInput, formatTime } from '../lib/utils.js';

const state = {
  cookies: [],
  history: [],
  mutedDomains: {},
  settings: {},
  filters: { search: '', risk: 'all' },
  currentTab: 'active',
  selectedCookie: null,
};

function createElementFromHTML(htmlString) {
  const template = document.createElement('template');
  template.innerHTML = htmlString.trim();
  return template.content.firstChild;
}

function setChildren(parent, htmlString) {
  parent.textContent = '';
  const template = document.createElement('template');
  template.innerHTML = htmlString.trim();
  parent.appendChild(template.content);
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
  document.getElementById('completeWizardBtn')?.addEventListener('click', completeWizard);
  
  document.getElementById('mutedList').addEventListener('click', (e) => {
    if (e.target.matches('[data-action="unmute"]')) {
      const domain = e.target.dataset.domain;
      if (domain) unmuteDomain(domain);
    }
  });

  document.querySelectorAll('.modal').forEach(modal => {
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
  await Promise.all([loadActiveCookies(), loadHistory(), loadMutedDomains()]);
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

async function loadMutedDomains() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response.error) {
      console.error('Failed to load settings:', response.error);
      return;
    }
    
    const result = await browser.storage.local.get('cg_muted_domains');
    state.mutedDomains = result.cg_muted_domains || {};
    
    renderMutedList();
    updateStats();
  } catch (error) {
    console.error('Failed to load muted domains:', error);
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

function renderCookieList() {
  const container = document.getElementById('cookieList');
  
  let filtered = state.cookies.filter(cookie => {
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
  
  const header = document.createElement('div');
  header.className = 'cookie-header';
  
  const info = document.createElement('div');
  info.className = 'cookie-info';
  
  const name = document.createElement('div');
  name.className = 'cookie-name';
  name.textContent = sanitizeInput(cookie.name);
  
  const domain = document.createElement('div');
  domain.className = 'cookie-domain';
  domain.textContent = sanitizeInput(cookie.domain);
  
  info.appendChild(name);
  info.appendChild(domain);
  
  const badges = document.createElement('div');
  badges.className = 'cookie-badges';
  
  const riskBadge = document.createElement('span');
  riskBadge.className = `badge badge-${cookie.riskLevel}`;
  riskBadge.textContent = cookie.riskLevel;
  badges.appendChild(riskBadge);
  
  if (cookie.isPartitioned) {
    const partBadge = document.createElement('span');
    partBadge.className = 'badge badge-partitioned';
    partBadge.textContent = 'PART';
    badges.appendChild(partBadge);
  }
  
  if (cookie.secure) {
    const secBadge = document.createElement('span');
    secBadge.className = 'badge badge-secure';
    secBadge.textContent = 'SEC';
    badges.appendChild(secBadge);
  }
  
  header.appendChild(info);
  header.appendChild(badges);
  
  const meta = document.createElement('div');
  meta.className = 'cookie-meta';
  
  const time = document.createElement('span');
  time.textContent = formatTime(cookie.timestamp);
  meta.appendChild(time);
  
  if (cookie.changeCount > 1) {
    const changes = document.createElement('span');
    changes.textContent = `${cookie.changeCount} changes`;
    meta.appendChild(changes);
  }
  
  item.appendChild(header);
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
  action.textContent = event.action.toUpperCase();
  
  const cookieName = document.createElement('strong');
  cookieName.textContent = sanitizeInput(event.name);
  
  const onText = document.createElement('span');
  onText.style.color = 'var(--text-tertiary)';
  onText.textContent = ' on ';
  
  const domainSpan = document.createElement('span');
  domainSpan.textContent = sanitizeInput(event.domain);
  
  mainDiv.appendChild(action);
  mainDiv.appendChild(document.createTextNode(' '));
  mainDiv.appendChild(cookieName);
  mainDiv.appendChild(onText);
  mainDiv.appendChild(domainSpan);
  
  const time = document.createElement('div');
  time.className = 'history-time';
  time.textContent = formatTime(event.timestamp);
  
  item.appendChild(mainDiv);
  item.appendChild(time);
  
  return item;
}

function renderMutedList() {
  const container = document.getElementById('mutedList');
  const mutedEntries = Object.entries(state.mutedDomains);
  
  if (mutedEntries.length === 0) {
    const emptyHTML = `
      <div class="empty-state">
        <svg class="empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>
        <p class="empty-title">No muted domains</p>
        <p class="empty-subtitle">Mute domains from cookie context menus</p>
      </div>
    `;
    setChildren(container, emptyHTML);
    return;
  }
  
  container.textContent = '';
  mutedEntries.forEach(([domain, info]) => {
    const item = createMutedItemElement(domain, info);
    container.appendChild(item);
  });
}

function createMutedItemElement(domain, info) {
  const item = document.createElement('div');
  item.className = 'muted-item';
  
  const infoDiv = document.createElement('div');
  
  const domainDiv = document.createElement('div');
  domainDiv.className = 'muted-domain';
  domainDiv.textContent = sanitizeInput(domain);
  
  const dateDiv = document.createElement('div');
  dateDiv.className = 'muted-date';
  dateDiv.textContent = `Muted ${formatTime(info.timestamp)}${info.manual ? ' (Manual)' : ''}`;
  
  infoDiv.appendChild(domainDiv);
  infoDiv.appendChild(dateDiv);
  
  const btn = document.createElement('button');
  btn.className = 'btn btn-secondary';
  btn.dataset.action = 'unmute';
  btn.dataset.domain = sanitizeInput(domain);
  btn.textContent = 'Unmute';
  
  item.appendChild(infoDiv);
  item.appendChild(btn);
  
  return item;
}

function updateStats() {
  document.getElementById('activeCookies').textContent = state.cookies.length;
  document.getElementById('highRiskCount').textContent = state.cookies.filter(c => c.riskLevel === 'high').length;
  document.getElementById('mutedCount').textContent = Object.keys(state.mutedDomains).length;
}

function switchTab(tabName) {
  state.currentTab = tabName;
  
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  document.getElementById(`${tabName}Tab`).classList.add('active');
  
  if (tabName === 'history' && state.history.length === 0) {
    loadHistory();
  } else if (tabName === 'muted' && Object.keys(state.mutedDomains).length === 0) {
    loadMutedDomains();
  }
}

function showCookieDetail(cookie) {
  state.selectedCookie = cookie;
  const modal = document.getElementById('detailModal');
  const content = document.getElementById('detailContent');
  
  content.textContent = '';
  
  const detailDiv = document.createElement('div');
  detailDiv.className = 'cookie-detail';
  
  const identitySection = createDetailSection('Identity', [
    ['Name', sanitizeInput(cookie.name)],
    ['Domain', sanitizeInput(cookie.domain)],
    ['Path', sanitizeInput(cookie.path)]
  ]);
  
  const classSection = createDetailSection('Classification', [
    ['Risk Level', cookie.riskLevel.toUpperCase(), `var(--risk-${cookie.riskLevel})`],
    ['Third Party', cookie.isThirdParty ? 'Yes' : 'No'],
    ['Partitioned', cookie.isPartitioned ? 'Yes' : 'No']
  ]);
  
  const secSection = createDetailSection('Security', [
    ['Secure', cookie.secure ? 'Yes' : 'No'],
    ['HttpOnly', cookie.httpOnly ? 'Yes' : 'No'],
    ['SameSite', cookie.sameSite || 'None']
  ]);
  
  const metaSection = createDetailSection('Metadata', [
    ['Created', new Date(cookie.timestamp).toLocaleString()],
    ['Session', cookie.session ? 'Yes' : 'No'],
    ['Changes', String(cookie.changeCount)]
  ]);
  
  detailDiv.appendChild(identitySection);
  detailDiv.appendChild(classSection);
  detailDiv.appendChild(secSection);
  detailDiv.appendChild(metaSection);
  
  content.appendChild(detailDiv);
  modal.classList.add('active');
}

function createDetailSection(title, rows) {
  const section = document.createElement('div');
  section.className = 'detail-section';
  
  const heading = document.createElement('h3');
  heading.textContent = title;
  section.appendChild(heading);
  
  rows.forEach(([label, value, color]) => {
    const row = document.createElement('div');
    row.className = 'detail-row';
    
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    
    const valueStrong = document.createElement('strong');
    valueStrong.textContent = value;
    if (color) valueStrong.style.color = color;
    
    row.appendChild(labelSpan);
    row.appendChild(valueStrong);
    section.appendChild(row);
  });
  
  return section;
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
    await loadMutedDomains();
    await loadActiveCookies();
  } catch (error) {
    console.error('Failed to mute domain:', error);
    alert('Failed to mute domain');
  }
}

async function unmuteDomain(domain) {
  try {
    await browser.runtime.sendMessage({ type: 'UNMUTE_DOMAIN', domain });
    await loadMutedDomains();
    await loadActiveCookies();
  } catch (error) {
    console.error('Failed to unmute domain:', error);
    alert('Failed to unmute domain');
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
  document.querySelectorAll('.modal').forEach(modal => {
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