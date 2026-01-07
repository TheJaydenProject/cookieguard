const MAX_RETAINED_EVENTS = 5000;
const PRUNE_THRESHOLD = 5500;
const STORAGE_KEYS = {
  SETTINGS: 'cg_settings',
  MUTED_DOMAINS: 'cg_muted_domains',
  HISTORY: 'cg_history',
  METADATA: 'cg_metadata',
};

const DEFAULT_SETTINGS = {
  incognitoEnabled: false,
  developerMode: false,
  notificationsEnabled: true,
  autoMuteBigTech: false,
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
      
      const updated = [...history, ...events];
      
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