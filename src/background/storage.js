const MAX_RETAINED_EVENTS = 5000;
const PRUNE_THRESHOLD = 5500;
const STORAGE_KEYS = {
  SETTINGS: 'cg_settings',
  MUTED_DOMAINS: 'cg_muted_domains',
  BLOCKED_DOMAINS: 'cg_blocked_domains',
  HISTORY: 'cg_history',
  METADATA: 'cg_metadata',
};

const DEFAULT_SETTINGS = {
  incognitoEnabled: false,
  developerMode: false,
  notificationsEnabled: true,
  theme: 'auto',
};

export class StorageManager {
  constructor() {
    this.initialized = false;
  }
  
  async init() {
    if (this.initialized) return;
    
    try {
      const stored = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
      if (!stored[STORAGE_KEYS.SETTINGS]) {
        await browser.storage.local.set({
          [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
        });
      }
      
      const muted = await browser.storage.local.get(STORAGE_KEYS.MUTED_DOMAINS);
      if (!muted[STORAGE_KEYS.MUTED_DOMAINS]) {
        await browser.storage.local.set({
          [STORAGE_KEYS.MUTED_DOMAINS]: {},
        });
      }

      const blocked = await browser.storage.local.get(STORAGE_KEYS.BLOCKED_DOMAINS);
      if (!blocked[STORAGE_KEYS.BLOCKED_DOMAINS]) {
        await browser.storage.local.set({
          [STORAGE_KEYS.BLOCKED_DOMAINS]: {},
        });
      }

      const history = await browser.storage.local.get(STORAGE_KEYS.HISTORY);
      if (!history[STORAGE_KEYS.HISTORY]) {
        await browser.storage.local.set({
          [STORAGE_KEYS.HISTORY]: [],
        });
      }
      
      await browser.storage.local.set({
        [STORAGE_KEYS.METADATA]: {
          version: '1.0.0',
          lastPrune: Date.now(),
          totalEvents: 0,
        },
      });
      
      this.initialized = true;
    } catch (error) {
      console.error('[StorageManager] Init failed:', error);
      throw error;
    }
  }
  
  async appendEvents(events) {
    if (events.length === 0) return;

    try {
      const stored = await browser.storage.local.get(STORAGE_KEYS.HISTORY);
      const history = stored[STORAGE_KEYS.HISTORY] || [];

      const newEntries = this.coalesceBlockedEvents(events, history);
      const updated = [...history, ...newEntries];

      let final = updated;
      if (updated.length > PRUNE_THRESHOLD) {
        final = this.pruneHistory(updated);
      }

      await browser.storage.local.set({
        [STORAGE_KEYS.HISTORY]: final,
      });

      const meta = await this.getMetadata();
      meta.totalEvents += events.length;
      meta.lastWrite = Date.now();
      await browser.storage.local.set({
        [STORAGE_KEYS.METADATA]: meta,
      });

    } catch (error) {
      console.error('[StorageManager] Append failed:', error);
      throw error;
    }
  }

  // 'blocked' events are coalesced into a single per-domain entry (with a running
  // count) so a domain repeatedly retrying after being blocked can't flood the
  // rolling history buffer. Entries marked `episodeClosed` (via closeBlockEpisode,
  // triggered on unblock) are skipped so a future block on the same domain starts
  // a fresh tactical episode with its own counter instead of resuming the old one.
  // Mutates matching entries in `history` in place and returns only the entries
  // that still need to be appended.
  coalesceBlockedEvents(events, history) {
    const toAppend = [];

    for (const event of events) {
      if (event.action !== 'blocked') {
        toAppend.push(event);
        continue;
      }

      const count = event.count ?? 1;
      const existing = history.find(e => e.action === 'blocked' && e.identityHash === event.identityHash && !e.episodeClosed)
        || toAppend.find(e => e.action === 'blocked' && e.identityHash === event.identityHash && !e.episodeClosed);

      if (existing) {
        existing.count = (existing.count ?? 1) + count;
        existing.timestamp = event.timestamp;
        existing.lastSeen = event.timestamp;
      } else {
        toAppend.push({ ...event, count });
      }
    }

    return toAppend;
  }
  
  pruneHistory(events) {
    const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);
    const pruned = sorted.slice(0, MAX_RETAINED_EVENTS);
    
    browser.storage.local.get(STORAGE_KEYS.METADATA).then(stored => {
      const meta = stored[STORAGE_KEYS.METADATA] || {};
      meta.lastPrune = Date.now();
      meta.prunedCount = (meta.prunedCount || 0) + (events.length - pruned.length);
      browser.storage.local.set({ [STORAGE_KEYS.METADATA]: meta });
    });
    
    return pruned;
  }
  
  async getHistory(limit = 100) {
    try {
      const stored = await browser.storage.local.get(STORAGE_KEYS.HISTORY);
      const history = stored[STORAGE_KEYS.HISTORY] || [];
      
      return history
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (error) {
      return [];
    }
  }
  
  async clearHistory() {
    try {
      await browser.storage.local.set({
        [STORAGE_KEYS.HISTORY]: [],
      });
      
      const meta = await this.getMetadata();
      meta.totalEvents = 0;
      meta.lastClear = Date.now();
      await browser.storage.local.set({
        [STORAGE_KEYS.METADATA]: meta,
      });
    } catch (error) {
      throw error;
    }
  }
  
  async getMutedDomains() {
    try {
      const stored = await browser.storage.local.get(STORAGE_KEYS.MUTED_DOMAINS);
      return stored[STORAGE_KEYS.MUTED_DOMAINS] || {};
    } catch (error) {
      return {};
    }
  }
  
  async muteDomain(domain, manual = false) {
    try {
      const muted = await this.getMutedDomains();
      muted[domain] = {
        timestamp: Date.now(),
        manual,
      };
      
      await browser.storage.local.set({
        [STORAGE_KEYS.MUTED_DOMAINS]: muted,
      });
    } catch (error) {
      throw error;
    }
  }
  
  async unmuteDomain(domain) {
    try {
      const muted = await this.getMutedDomains();
      delete muted[domain];

      await browser.storage.local.set({
        [STORAGE_KEYS.MUTED_DOMAINS]: muted,
      });
    } catch (error) {
      throw error;
    }
  }

  // Shape: { [storeId]: { [etld]: { timestamp, manual } } }. Indexing by cookie
  // store (container/private-browsing identity) keeps a block scoped to the
  // context it was created in instead of leaking across containers.
  async getBlockedDomains() {
    try {
      const stored = await browser.storage.local.get(STORAGE_KEYS.BLOCKED_DOMAINS);
      return stored[STORAGE_KEYS.BLOCKED_DOMAINS] || {};
    } catch (error) {
      return {};
    }
  }

  async blockDomain(storeId, domain, manual = false) {
    try {
      const blocked = await this.getBlockedDomains();
      if (!blocked[storeId]) {
        blocked[storeId] = {};
      }
      blocked[storeId][domain] = {
        timestamp: Date.now(),
        manual,
      };

      await browser.storage.local.set({
        [STORAGE_KEYS.BLOCKED_DOMAINS]: blocked,
      });
    } catch (error) {
      throw error;
    }
  }

  async unblockDomain(storeId, domain) {
    try {
      const blocked = await this.getBlockedDomains();
      if (blocked[storeId]) {
        delete blocked[storeId][domain];
        if (Object.keys(blocked[storeId]).length === 0) {
          delete blocked[storeId];
        }
      }

      await browser.storage.local.set({
        [STORAGE_KEYS.BLOCKED_DOMAINS]: blocked,
      });
    } catch (error) {
      throw error;
    }
  }

  // Marks any open 'blocked' history entry for this identityHash as closed so
  // coalesceBlockedEvents will not resume it. Called when a domain is unblocked,
  // ensuring a future re-block starts a brand-new tactical episode/counter.
  async closeBlockEpisode(identityHash) {
    try {
      const stored = await browser.storage.local.get(STORAGE_KEYS.HISTORY);
      const history = stored[STORAGE_KEYS.HISTORY] || [];

      let changed = false;
      for (const event of history) {
        if (event.action === 'blocked' && event.identityHash === identityHash && !event.episodeClosed) {
          event.episodeClosed = true;
          changed = true;
        }
      }

      if (changed) {
        await browser.storage.local.set({
          [STORAGE_KEYS.HISTORY]: history,
        });
      }
    } catch (error) {
      console.error('[StorageManager] closeBlockEpisode failed:', error);
    }
  }


  async getSettings() {
    try {
      const stored = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
      return { ...DEFAULT_SETTINGS, ...stored[STORAGE_KEYS.SETTINGS] };
    } catch (error) {
      return DEFAULT_SETTINGS;
    }
  }
  
  async updateSettings(updates) {
    try {
      const current = await this.getSettings();
      const merged = { ...current, ...updates };
      
      await browser.storage.local.set({
        [STORAGE_KEYS.SETTINGS]: merged,
      });
    } catch (error) {
      throw error;
    }
  }
  
  async getMetadata() {
    try {
      const stored = await browser.storage.local.get(STORAGE_KEYS.METADATA);
      return stored[STORAGE_KEYS.METADATA] || {
        version: '1.0.0',
        totalEvents: 0,
        lastPrune: null,
        prunedCount: 0,
      };
    } catch (error) {
      return {};
    }
  }
  
  async exportData(includeValues = false) {
    try {
      const settings = await this.getSettings();
      
      if (!settings.developerMode) {
        throw new Error('Developer mode required for export');
      }
      
      const history = await browser.storage.local.get(STORAGE_KEYS.HISTORY);
      const muted = await this.getMutedDomains();
      const blocked = await this.getBlockedDomains();
      const metadata = await this.getMetadata();

      const exportData = {
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        metadata,
        settings: {
          ...settings,
          developerMode: undefined,
        },
        mutedDomains: muted,
        blockedDomains: blocked,
        history: includeValues
          ? history[STORAGE_KEYS.HISTORY]
          : history[STORAGE_KEYS.HISTORY].map(e => ({
              ...e,
              value: '[REDACTED]',
            })),
        disclaimer: includeValues
          ? 'WARNING: This export includes cookie values. Handle with care.'
          : 'Cookie values have been redacted for privacy.',
      };
      
      return exportData;
    } catch (error) {
      throw error;
    }
  }
  
  async getStorageStats() {
    try {
      const bytesInUse = await browser.storage.local.getBytesInUse();
      const stored = await browser.storage.local.get(STORAGE_KEYS.HISTORY);
      const history = stored[STORAGE_KEYS.HISTORY] || [];
      const metadata = await this.getMetadata();
      
      return {
        bytesInUse,
        bytesAvailable: browser.storage.local.QUOTA_BYTES - bytesInUse,
        percentUsed: ((bytesInUse / browser.storage.local.QUOTA_BYTES) * 100).toFixed(2),
        eventCount: metadata.totalEvents,
        retainedEvents: history.length,
        lastPrune: metadata.lastPrune ? new Date(metadata.lastPrune).toISOString() : 'never',
      };
    } catch (error) {
      return null;
    }
  }
}