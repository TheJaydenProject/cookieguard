import { classifyCookie } from './classifier.js';
import { StorageManager } from './storage.js';
import { createIdentityHash, sanitizeInput, isIncognito } from '../lib/utils.js';
import { getETLDPlus1, isThirdParty } from '../lib/psl.js';

let storageQueue = [];
const STORAGE_ALARM_NAME = 'batch_storage_write';
const storage = new StorageManager();

const state = {
  identityMap: new Map(),
  circuitBreakers: new Map(),
  tabDomainCache: new Map(),
  isRestored: false
};

const CIRCUIT_BREAKER_THRESHOLD = 50;
const CIRCUIT_BREAKER_COOLDOWN = 10000;
const NOTIFICATION_BUFFER_DELAY = 800;
const SESSION_BACKUP_KEY = 'cg_session_state';
const SAVE_ALARM_NAME = 'save_state_debounce';

let notificationTimers = new Map();
let notificationDomains = new Map();

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await browser.tabs.create({ url: browser.runtime.getURL('popup/popup.html?firstLaunch=true') });
  }
  await init();
});

browser.runtime.onStartup.addListener(init);

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SAVE_ALARM_NAME) {
    try {
      const serialized = Array.from(state.identityMap.entries());
      await browser.storage.session.set({ [SESSION_BACKUP_KEY]: serialized });
    } catch (e) {
      console.error('[CookieGuard] State save failed:', e);
    }
  }
  else if (alarm.name === STORAGE_ALARM_NAME) {
    await flushStorageQueue();
  }
});

async function flushStorageQueue() {
  if (storageQueue.length === 0) return;
  
  const batch = [...storageQueue];
  storageQueue = [];
  
  try {
    await storage.appendEvents(batch);
  } catch (e) {
    console.error('[CookieGuard] Storage flush failed:', e);
  }
}

async function init() {
  await storage.init();
  await restoreSessionState();
  
  if (state.identityMap.size === 0) {
    await hydrateCookies();
  }
  
  state.isRestored = true;
  console.log('[CookieGuard] System Initialized. Tracking:', state.identityMap.size, 'cookies');
}

browser.cookies.onChanged.addListener(async (changeInfo) => {
  if (!state.isRestored) await restoreSessionState();

  const { cookie, removed, cause } = changeInfo;
  
  const isPrivate = isIncognito(cookie.storeId);
  if (isPrivate) {
    const settings = await storage.getSettings();
    if (!settings.incognitoEnabled) return;
  }

  const etld = getETLDPlus1(cookie.domain);
  if (checkCircuitBreaker(etld)) return;

  const mutedDomains = await storage.getMutedDomains();
  if (mutedDomains[etld]) return;

  const identityHash = await createIdentityHash(cookie);
  const existing = state.identityMap.get(identityHash);

  if (existing && !removed) {
    existing.lastSeen = Date.now();
    existing.changeCount++;
    triggerStateSave();
    return;
  }

  let classification = 'low';
  let is3rdParty = false;

  if (!removed) {
    is3rdParty = isThirdParty(cookie.domain, null);
    classification = classifyCookie({
      ...cookie,
      value: cookie.value ? cookie.value.substring(0, 100) : ""
    }, is3rdParty);
  }

  const eventRecord = {
    identityHash,
    timestamp: Date.now(),
    action: removed ? 'removed' : 'added',
    cause: cause || 'unknown',
    name: sanitizeInput(cookie.name),
    domain: sanitizeInput(cookie.domain),
    path: sanitizeInput(cookie.path),
    etld,
    storeId: cookie.storeId,
    riskLevel: classification,
    isThirdParty: is3rdParty,
    isPartitioned: !!cookie.partitionKey,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    session: cookie.session,
    changeCount: 1,
    lastSeen: Date.now(),
    isIncognito: isPrivate
  };

  if (removed) {
    state.identityMap.delete(identityHash);
  } else {
    state.identityMap.set(identityHash, eventRecord);
  }

  triggerStateSave();

  if (!removed && classification === 'high' && !isPrivate) {
    scheduleNotification(etld);
  }

  if (!isPrivate) {
    storageQueue.push(eventRecord);

    const alarm = await browser.alarms.get(STORAGE_ALARM_NAME);
    if (!alarm) {
      browser.alarms.create(STORAGE_ALARM_NAME, { delayInMinutes: 0.05 });
    }
  }
});

async function restoreSessionState() {
  try {
    const data = await browser.storage.session.get(SESSION_BACKUP_KEY);
    if (data[SESSION_BACKUP_KEY]) {
      state.identityMap = new Map(data[SESSION_BACKUP_KEY]);
    }
  } catch (e) {
    console.warn('[CookieGuard] State restore failed:', e);
  }
}

function triggerStateSave() {
  browser.alarms.create(SAVE_ALARM_NAME, { delayInMinutes: 0.05 });
}

async function hydrateCookies() {
  try {
    const allCookies = await browser.cookies.getAll({});
    const settings = await storage.getSettings();
    
    for (const cookie of allCookies) {
      const isPrivate = isIncognito(cookie.storeId);
      if (isPrivate && !settings.incognitoEnabled) continue;
      
      const etld = getETLDPlus1(cookie.domain);
      const is3rdParty = isThirdParty(cookie.domain, null);
      
      const classification = classifyCookie({
        ...cookie,
        value: ""
      }, is3rdParty);

      const identityHash = await createIdentityHash(cookie);
      
      state.identityMap.set(identityHash, {
        identityHash,
        timestamp: Date.now(),
        action: 'hydrated',
        name: sanitizeInput(cookie.name),
        domain: sanitizeInput(cookie.domain),
        path: sanitizeInput(cookie.path),
        etld,
        storeId: cookie.storeId,
        riskLevel: classification,
        isThirdParty: is3rdParty,
        isPartitioned: !!cookie.partitionKey,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        session: cookie.session,
        changeCount: 1,
        lastSeen: Date.now(),
        isIncognito: isPrivate
      });
    }
    triggerStateSave();
  } catch (e) {
    console.error('[CookieGuard] Hydration failed:', e);
  }
}

function checkCircuitBreaker(domain) {
  const now = Date.now();
  const breaker = state.circuitBreakers.get(domain) || { count: 0, resetTime: now + 1000 };

  if (now > breaker.resetTime) {
    breaker.count = 1;
    breaker.resetTime = now + 1000;
  } else {
    breaker.count++;
  }

  state.circuitBreakers.set(domain, breaker);

  if (breaker.count > CIRCUIT_BREAKER_THRESHOLD) {
    if (!breaker.tripTime) {
      breaker.tripTime = now;
      console.warn(`[CookieGuard] Circuit breaker tripped: ${domain}`);
    }
    return (now - breaker.tripTime) < CIRCUIT_BREAKER_COOLDOWN;
  }
  return false;
}

function scheduleNotification(domain) {
  if (notificationTimers.has(domain)) return;
  
  const id = setTimeout(() => {
    const notificationId = `cg-alert-${domain}-${Date.now()}`;
    notificationDomains.set(notificationId, domain);
    
    browser.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: '../assets/icons/icon48.png',
      title: 'CookieGuard Alert',
      message: `High-risk tracking detected: ${domain}`
    });
    notificationTimers.delete(domain);
  }, NOTIFICATION_BUFFER_DELAY);
  
  notificationTimers.set(domain, id);
}

browser.notifications.onClicked.addListener(async (notificationId) => {
  const domain = notificationDomains.get(notificationId);
  
  await browser.windows.create({
    url: browser.runtime.getURL(`popup/popup.html?domain=${encodeURIComponent(domain || '')}`),
    type: 'popup',
    width: 616,
    height: 600,
    top: 0,
    left: screen.width - 380
  });
  
  browser.notifications.clear(notificationId);
  notificationDomains.delete(notificationId);
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'GET_COOKIES') {
        if (!state.isRestored) await restoreSessionState();
        sendResponse({
          cookies: Array.from(state.identityMap.values()),
          circuitBreakers: Array.from(state.circuitBreakers.entries())
            .filter(([_, b]) => b.tripTime && (Date.now() - b.tripTime < CIRCUIT_BREAKER_COOLDOWN))
            .map(([d]) => d)
        });
      }
      else if (message.type === 'GET_HISTORY') {
        const history = await storage.getHistory(message.limit || 100);
        sendResponse({ history });
      }
      else if (message.type === 'MUTE_DOMAIN') {
        await storage.muteDomain(message.domain, true);
        sendResponse({ success: true });
      }
      else if (message.type === 'UNMUTE_DOMAIN') {
        await storage.unmuteDomain(message.domain);
        sendResponse({ success: true });
      }
      else if (message.type === 'GET_SETTINGS') {
        const settings = await storage.getSettings();
        sendResponse({ settings });
      }
      else if (message.type === 'UPDATE_SETTINGS') {
        await storage.updateSettings(message.settings);
        sendResponse({ success: true });
      }
      else if (message.type === 'CLEAR_HISTORY') {
        await storage.clearHistory();
        sendResponse({ success: true });
      }
      else if (message.type === 'EXPORT_DATA') {
        const data = await storage.exportData(message.includeValues);
        sendResponse({ data });
      }
      else if (message.type === 'TRIGGER_TEST_NOTIFICATION') {
        const testDomain = 'tracker-test-site.com';
        
        scheduleNotification(testDomain);
        
        const testHash = "test-notification-hash";
        const testEvent = {
          identityHash: testHash,
          timestamp: Date.now(),
          action: 'added',
          name: 'TEST_TRACKER_COOKIE',
          domain: testDomain,
          etld: testDomain,
          riskLevel: 'high',
          isThirdParty: true,
          isPartitioned: false,
          changeCount: 1,
          lastSeen: Date.now(),
          storeId: '0',
          isIncognito: false
        };
        
        state.identityMap.set(testHash, testEvent);
        storageQueue.push(testEvent);
        
        const alarm = await browser.alarms.get(STORAGE_ALARM_NAME);
        if (!alarm) {
          browser.alarms.create(STORAGE_ALARM_NAME, { delayInMinutes: 0.05 });
        }

        sendResponse({ success: true });
        return true;
      }
    } catch (e) {
      sendResponse({ error: e.message });
    }
  })();
  return true;
});