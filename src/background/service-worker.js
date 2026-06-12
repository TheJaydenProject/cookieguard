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
const SELF_REMOVAL_TTL = 2000;

let notificationTimers = new Map();
let notificationDomains = new Map();
const pendingSelfRemovals = new Map();

// In-memory mirror of cg_blocked_domains (Map<storeId, Set<etld>>) so the
// cookies.onChanged listener can make a synchronous block/circuit-breaker
// decision without crossing an async storage boundary on every event.
const blockedDomainsCache = new Map();

function isBlocked(storeId, etld) {
  const domains = blockedDomainsCache.get(storeId);
  return !!domains && domains.has(etld);
}

function cacheBlock(storeId, etld) {
  let domains = blockedDomainsCache.get(storeId);
  if (!domains) {
    domains = new Set();
    blockedDomainsCache.set(storeId, domains);
  }
  domains.add(etld);
}

function cacheUnblock(storeId, etld) {
  const domains = blockedDomainsCache.get(storeId);
  if (!domains) return;
  domains.delete(etld);
  if (domains.size === 0) {
    blockedDomainsCache.delete(storeId);
  }
}

async function loadBlockedDomainsCache() {
  blockedDomainsCache.clear();
  const blocked = await storage.getBlockedDomains();
  for (const [storeId, domains] of Object.entries(blocked)) {
    blockedDomainsCache.set(storeId, new Set(Object.keys(domains)));
  }
}

function buildCookieUrl(cookie) {
  const protocol = cookie.secure ? 'https' : 'http';
  const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
  return `${protocol}://${domain}${cookie.path}`;
}

async function removeCookieRecord(cookie, identityHash) {
  pendingSelfRemovals.set(identityHash, Date.now());
  setTimeout(() => pendingSelfRemovals.delete(identityHash), SELF_REMOVAL_TTL);

  try {
    const removeDetails = {
      url: buildCookieUrl(cookie),
      name: cookie.name,
      storeId: cookie.storeId,
    };
    if (cookie.partitionKey) {
      removeDetails.partitionKey = cookie.partitionKey;
    }
    await browser.cookies.remove(removeDetails);
  } catch (e) {
    console.error('[CookieGuard] Cookie removal failed:', e);
    pendingSelfRemovals.delete(identityHash);
  }
}

async function queueHistoryEvent(event, isPrivate) {
  if (isPrivate) return;

  storageQueue.push(event);

  const alarm = await browser.alarms.get(STORAGE_ALARM_NAME);
  if (!alarm) {
    browser.alarms.create(STORAGE_ALARM_NAME, { delayInMinutes: 0.05 });
  }
}

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
  await loadBlockedDomainsCache();
  await purgeBlockedDomainsOnStartup();
  await restoreSessionState();

  if (state.identityMap.size === 0) {
    await hydrateCookies();
  }

  state.isRestored = true;
  console.log('[CookieGuard] System Initialized. Tracking:', state.identityMap.size, 'cookies');
}

// Sweeps the live cookie jar (not the in-memory identityMap) for every
// (storeId, etld) pair currently blocked, so domains dropped from tracking by
// the circuit breaker or a missed event are still purged on restart.
async function purgeBlockedDomainsOnStartup() {
  for (const [storeId, domains] of blockedDomainsCache.entries()) {
    for (const etld of domains) {
      try {
        const matching = await browser.cookies.getAll({ domain: etld, storeId });
        for (const cookie of matching) {
          const identityHash = await createIdentityHash(cookie);
          state.identityMap.delete(identityHash);
          await removeCookieRecord(cookie, identityHash);
        }
      } catch (e) {
        console.error('[CookieGuard] Startup purge failed for', storeId, etld, e);
      }
    }
  }
}

browser.cookies.onChanged.addListener(async (changeInfo) => {
  const { cookie, removed, cause } = changeInfo;

  const etld = getETLDPlus1(cookie.domain);
  const blocked = isBlocked(cookie.storeId, etld);

  // Circuit breaker is evaluated synchronously, before any await/storage I/O,
  // for every domain. For non-blocked domains it's a hard stop. For blocked
  // domains it does NOT gate enforcement below (createIdentityHash,
  // pendingSelfRemovals, removeCookieRecord) — a tracker spamming writes to
  // trip the breaker must not be rewarded with a cookie that survives the
  // cooldown. It only gates the optional history/alarm bookkeeping further
  // down, since the coalesced 'blocked' row already reflects the episode.
  const breakerTripped = checkCircuitBreaker(etld);

  if (!blocked && breakerTripped) return;

  if (!state.isRestored) await restoreSessionState();

  const isPrivate = isIncognito(cookie.storeId);
  const identityHash = await createIdentityHash(cookie);

  if (removed && pendingSelfRemovals.delete(identityHash)) {
    return;
  }

  if (blocked) {
    if (removed) {
      return;
    }

    state.identityMap.delete(identityHash);
    await removeCookieRecord(cookie, identityHash);

    // History/alarm bookkeeping is rate-limited once the breaker trips:
    // skipping extra increments here avoids redundant storage/alarm IPC
    // during a storm without affecting enforcement, which already ran above.
    if (breakerTripped) return;

    // Enforcement runs uniformly regardless of settings.incognitoEnabled.
    // queueHistoryEvent no-ops for private events, so the RAM-only promise
    // for private browsing is preserved without skipping the removal itself.
    await queueHistoryEvent({
      identityHash: `blocked:${cookie.storeId}:${etld}`,
      timestamp: Date.now(),
      action: 'blocked',
      domain: sanitizeInput(etld),
      etld,
      storeId: cookie.storeId,
      count: 1,
      lastSeen: Date.now(),
      isIncognito: isPrivate
    }, isPrivate);

    return;
  }

  if (isPrivate) {
    const settings = await storage.getSettings();
    if (!settings.incognitoEnabled) return;
  }

  const mutedDomains = await storage.getMutedDomains();
  if (mutedDomains[etld]) return;

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
    partitionKey: cookie.partitionKey || null,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    session: cookie.session,
    expirationDate: cookie.expirationDate || null,
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

  await queueHistoryEvent(eventRecord, isPrivate);
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
      const etld = getETLDPlus1(cookie.domain);

      // Blocked-domain enforcement runs uniformly regardless of incognito
      // tracking settings; purgeBlockedDomainsOnStartup() should already have
      // caught these, this is a defense-in-depth fallback.
      if (isBlocked(cookie.storeId, etld)) {
        const identityHash = await createIdentityHash(cookie);
        await removeCookieRecord(cookie, identityHash);
        continue;
      }

      const isPrivate = isIncognito(cookie.storeId);
      if (isPrivate && !settings.incognitoEnabled) continue;

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
        partitionKey: cookie.partitionKey || null,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        session: cookie.session,
        expirationDate: cookie.expirationDate || null,
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
      else if (message.type === 'DELETE_COOKIE') {
        const record = state.identityMap.get(message.identityHash);
        if (!record) {
          sendResponse({ error: 'Cookie not found' });
          return;
        }

        await removeCookieRecord(record, message.identityHash);
        state.identityMap.delete(message.identityHash);
        triggerStateSave();

        await queueHistoryEvent({
          identityHash: message.identityHash,
          timestamp: Date.now(),
          action: 'deleted',
          name: record.name,
          domain: record.domain,
          etld: record.etld,
          riskLevel: record.riskLevel,
          isThirdParty: record.isThirdParty,
          changeCount: 1,
          lastSeen: Date.now(),
          isIncognito: record.isIncognito
        }, record.isIncognito);

        sendResponse({ success: true });
      }
      else if (message.type === 'BLOCK_DOMAIN') {
        const domain = message.domain;
        const storeId = message.storeId;

        if (!domain || !storeId) {
          sendResponse({ error: 'domain and storeId are required' });
          return;
        }

        await storage.blockDomain(storeId, domain, true);
        cacheBlock(storeId, domain);

        // Purge sweep queries the live cookie jar directly rather than the
        // in-memory identityMap, guaranteeing completeness even for cookies
        // the circuit breaker previously caused us to drop from tracking.
        let removedCount = 0;
        try {
          const matchingCookies = await browser.cookies.getAll({ domain, storeId });
          for (const cookie of matchingCookies) {
            const identityHash = await createIdentityHash(cookie);
            state.identityMap.delete(identityHash);
            await removeCookieRecord(cookie, identityHash);
            removedCount++;
          }
        } catch (e) {
          console.error('[CookieGuard] Block purge sweep failed:', e);
        }

        triggerStateSave();

        const isPrivate = isIncognito(storeId);
        await queueHistoryEvent({
          identityHash: `blocked:${storeId}:${domain}`,
          timestamp: Date.now(),
          action: 'blocked',
          domain: sanitizeInput(domain),
          etld: domain,
          storeId,
          count: removedCount,
          lastSeen: Date.now(),
          isIncognito: isPrivate
        }, isPrivate);

        sendResponse({ success: true, removedCount });
      }
      else if (message.type === 'UNBLOCK_DOMAIN') {
        const domain = message.domain;
        const storeId = message.storeId;

        if (!domain || !storeId) {
          sendResponse({ error: 'domain and storeId are required' });
          return;
        }

        await storage.unblockDomain(storeId, domain);
        cacheUnblock(storeId, domain);

        // Close out the history episode so a future block on this domain
        // starts a fresh entry rather than resuming the old running count.
        await storage.closeBlockEpisode(`blocked:${storeId}:${domain}`);

        sendResponse({ success: true });
      }
      else if (message.type === 'GET_DOMAIN_STATS') {
        const domain = message.domain;
        const storeId = message.storeId;

        try {
          const query = storeId ? { domain, storeId } : { domain };
          const cookiesForDomain = await browser.cookies.getAll(query);

          const stats = {
            cookieCount: cookiesForDomain.length,
            thirdPartyCount: 0,
            riskCounts: { low: 0, medium: 0, high: 0 },
          };

          for (const cookie of cookiesForDomain) {
            const is3rdParty = isThirdParty(cookie.domain, null);
            const classification = classifyCookie({ ...cookie, value: '' }, is3rdParty);

            if (is3rdParty) stats.thirdPartyCount++;
            if (stats.riskCounts[classification] !== undefined) {
              stats.riskCounts[classification]++;
            }
          }

          sendResponse({ stats });
        } catch (e) {
          sendResponse({ error: e.message });
        }
      }
      else if (message.type === 'CLEAN_COOKIES') {
        const hashes = message.identityHashes || [];
        const domains = new Set();
        let removedCount = 0;

        for (const hash of hashes) {
          const record = state.identityMap.get(hash);
          if (!record) continue;

          await removeCookieRecord(record, hash);
          state.identityMap.delete(hash);
          domains.add(record.etld);
          removedCount++;
        }

        triggerStateSave();

        if (removedCount > 0) {
          await queueHistoryEvent({
            identityHash: `bulk_deleted:${Date.now()}`,
            timestamp: Date.now(),
            action: 'bulk_deleted',
            cookiesRemoved: removedCount,
            domainsAffected: domains.size,
            lastSeen: Date.now(),
            isIncognito: false
          }, false);
        }

        sendResponse({ success: true, removedCount });
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