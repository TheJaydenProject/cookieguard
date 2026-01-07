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
    container.innerHTML = `
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
    return;
  }
  
  filtered.sort((a, b) => b.timestamp - a.timestamp);
  container.innerHTML = filtered.map(cookie => createCookieItemHTML(cookie)).join('');
  
  container.querySelectorAll('.cookie-item').forEach((item, index) => {
    item.addEventListener('click', () => showCookieDetail(filtered[index]));
  });
}

function createCookieItemHTML(cookie) {
  const riskBadge = `<span class="badge badge-${cookie.riskLevel}">${cookie.riskLevel}</span>`;
  const partitionedBadge = cookie.isPartitioned ? '<span class="badge badge-partitioned">PART</span>' : '';
  const secureBadge = cookie.secure ? '<span class="badge badge-secure">SEC</span>' : '';
  
  return `
    <div class="cookie-item" data-hash="${cookie.identityHash}">
      <div class="cookie-header">
        <div class="cookie-info">
          <div class="cookie-name">${sanitizeInput(cookie.name)}</div>
          <div class="cookie-domain">${sanitizeInput(cookie.domain)}</div>
        </div>
        <div class="cookie-badges">
          ${riskBadge}
          ${partitionedBadge}
          ${secureBadge}
        </div>
      </div>
      <div class="cookie-meta">
        <span>${formatTime(cookie.timestamp)}</span>
        ${cookie.changeCount > 1 ? `<span>${cookie.changeCount} changes</span>` : ''}
      </div>
    </div>
  `;
}

function renderHistory() {
  const container = document.getElementById('historyList');
  
  if (state.history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <p class="empty-title">No history yet</p>
        <p class="empty-subtitle">Cookie events will appear here</p>
      </div>
    `;
    return;
  }

  const RENDER_LIMIT = 100;
  const visibleHistory = state.history.slice(0, RENDER_LIMIT);
  
  container.innerHTML = visibleHistory.map(event => `
    <div class="history-item">
      <div>
        <span class="history-action ${event.action}">${event.action.toUpperCase()}</span>
        <strong>${sanitizeInput(event.name)}</strong>
        <span style="color: var(--text-tertiary)"> on </span>
        <span>${sanitizeInput(event.domain)}</span>
      </div>
      <div class="history-time">${formatTime(event.timestamp)}</div>
    </div>
  `).join('');

  if (state.history.length > RENDER_LIMIT) {
    const warning = document.createElement('div');
    warning.className = 'history-notice';
    warning.textContent = `Showing recent ${RENDER_LIMIT} of ${state.history.length} events. Export data to see full logs.`;
    container.appendChild(warning);
  }
}

function renderMutedList() {
  const container = document.getElementById('mutedList');
  const mutedEntries = Object.entries(state.mutedDomains);
  
  if (mutedEntries.length === 0) {
    container.innerHTML = `
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
    return;
  }
  
  container.innerHTML = mutedEntries.map(([domain, info]) => `
    <div class="muted-item">
      <div>
        <div class="muted-domain">${sanitizeInput(domain)}</div>
        <div class="muted-date">
          Muted ${formatTime(info.timestamp)}
          ${info.manual ? ' (Manual)' : ''}
        </div>
      </div>
      <button class="btn btn-secondary" data-action="unmute" data-domain="${sanitizeInput(domain)}">Unmute</button>
    </div>
  `).join('');
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
  
  content.innerHTML = `
    <div class="cookie-detail">
      <div class="detail-section">
        <h3>Identity</h3>
        <div class="detail-row">
          <span>Name</span>
          <strong>${sanitizeInput(cookie.name)}</strong>
        </div>
        <div class="detail-row">
          <span>Domain</span>
          <strong>${sanitizeInput(cookie.domain)}</strong>
        </div>
        <div class="detail-row">
          <span>Path</span>
          <strong>${sanitizeInput(cookie.path)}</strong>
        </div>
      </div>
      
      <div class="detail-section">
        <h3>Classification</h3>
        <div class="detail-row">
          <span>Risk Level</span>
          <strong style="color: var(--risk-${cookie.riskLevel})">${cookie.riskLevel.toUpperCase()}</strong>
        </div>
        <div class="detail-row">
          <span>Third Party</span>
          <strong>${cookie.isThirdParty ? 'Yes' : 'No'}</strong>
        </div>
        <div class="detail-row">
          <span>Partitioned</span>
          <strong>${cookie.isPartitioned ? 'Yes' : 'No'}</strong>
        </div>
      </div>
      
      <div class="detail-section">
        <h3>Security</h3>
        <div class="detail-row">
          <span>Secure</span>
          <strong>${cookie.secure ? 'Yes' : 'No'}</strong>
        </div>
        <div class="detail-row">
          <span>HttpOnly</span>
          <strong>${cookie.httpOnly ? 'Yes' : 'No'}</strong>
        </div>
        <div class="detail-row">
          <span>SameSite</span>
          <strong>${cookie.sameSite || 'None'}</strong>
        </div>
      </div>
      
      <div class="detail-section">
        <h3>Metadata</h3>
        <div class="detail-row">
          <span>Created</span>
          <strong>${new Date(cookie.timestamp).toLocaleString()}</strong>
        </div>
        <div class="detail-row">
          <span>Session</span>
          <strong>${cookie.session ? 'Yes' : 'No'}</strong>
        </div>
        <div class="detail-row">
          <span>Changes</span>
          <strong>${cookie.changeCount}</strong>
        </div>
      </div>
    </div>
  `;
  
  modal.classList.add('active');
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
  container.innerHTML = domains.map(domain => `
    <div class="alert">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L1 21h22L12 2zm0 3.5L19.5 19h-15L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
      </svg>
      <span>High activity from <strong>${sanitizeInput(domain)}</strong> has been muted temporarily</span>
    </div>
  `).join('');
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