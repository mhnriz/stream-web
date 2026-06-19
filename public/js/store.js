/**
 * StreamApp v1.3.0 — Reactive store with incognito-aware persistence.
 *
 * Two layers:
 *   1. Reactive in-memory state (get / set / on) — unchanged API from
 *      v1.2.1, used by every page for watchlist / catalogs / etc.
 *   2. Persistence (persist / load / removePersisted) — a localStorage
 *      wrapper that respects incognito mode: blacklisted keys go to an
 *      in-memory map instead of disk while incognito is ON, so they
 *      evaporate on reload.
 *
 * NOTE: Continue-watching progress is saved SERVER-side via
 * /api/continue — the player checks store.isIncognito() before calling
 * API.saveProgress() (see pages/player.js). This store handles the
 * local keys (search history, playback prefs, etc.).
 */

const STORAGE_PREFIX = 'hs_';

// Keys that must never touch localStorage while incognito is ON
const INCOGNITO_BLACKLIST = [
  'watchHistory',
  'continueWatching',
  'lastWatchedItem',
  'playbackProgress',
  'search_history',
];

function storageKey(key) {
  return key.startsWith(STORAGE_PREFIX) ? key : STORAGE_PREFIX + key;
}

const store = {
  // ─── Reactive state ────────────────────────────────────────
  _state: {
    watchlist: [],
    continueWatching: [],
    catalogs: [],
    onlineCount: 0,
    searchHistory: [],
    currentMeta: null,
  },

  _listeners: new Map(),

  // ─── Incognito ─────────────────────────────────────────────
  _memory: {},          // in-memory fallback while incognito
  _incognito: false,

  init() {
    // Incognito state itself always persists (it's a preference, not history)
    try {
      this._incognito = localStorage.getItem('incognitoMode') === 'true';
    } catch { this._incognito = false; }

    // Hydrate search history only when NOT incognito
    this._state.searchHistory = this._incognito
      ? []
      : this.load('search_history', []);
  },

  isIncognito() {
    return this._incognito;
  },

  toggleIncognito() {
    this._incognito = !this._incognito;
    try {
      localStorage.setItem('incognitoMode', String(this._incognito));
    } catch { /* private browsing — keep in memory only */ }

    if (this._incognito) {
      // Entering incognito: stop showing/recording session history
      this._memory = {};
    } else {
      // Leaving incognito: discard everything captured during the session
      this._memory = {};
      this._state.searchHistory = this.load('search_history', []);
      this._emit('searchHistory', this._state.searchHistory);
    }

    window.dispatchEvent(new CustomEvent('incognito-changed', {
      detail: { incognito: this._incognito },
    }));
    return this._incognito;
  },

  // ─── Persistence layer (incognito-aware) ───────────────────

  persist(key, value) {
    if (this._incognito && INCOGNITO_BLACKLIST.includes(key)) {
      this._memory[key] = value;       // memory only — gone on reload
      return;
    }
    try {
      localStorage.setItem(storageKey(key), JSON.stringify(value));
    } catch (e) {
      console.warn('[store] localStorage write failed, using memory:', e);
      this._memory[key] = value;
    }
  },

  load(key, fallback = null) {
    if (key in this._memory) return this._memory[key];
    try {
      const raw = localStorage.getItem(storageKey(key));
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },

  removePersisted(key) {
    delete this._memory[key];
    try { localStorage.removeItem(storageKey(key)); } catch { /* noop */ }
  },

  // ─── Reactive API (unchanged from v1.2.1) ──────────────────

  get(key) {
    return this._state[key];
  },

  set(key, value) {
    this._state[key] = value;
    this._emit(key, value);
  },

  _emit(key, value) {
    const listeners = this._listeners.get(key) || [];
    listeners.forEach(fn => fn(value));
  },

  on(key, fn) {
    if (!this._listeners.has(key)) this._listeners.set(key, []);
    this._listeners.get(key).push(fn);
    return () => {
      const arr = this._listeners.get(key);
      const idx = arr.indexOf(fn);
      if (idx > -1) arr.splice(idx, 1);
    };
  },

  // ─── Helpers ───────────────────────────────────────────────

  isInWatchlist(id) {
    return this._state.watchlist.some(i => i.id === id);
  },

  addSearchHistory(query) {
    const hist = this._state.searchHistory.filter(q => q !== query);
    hist.unshift(query);
    const trimmed = hist.slice(0, 10);
    this._state.searchHistory = trimmed;
    this.persist('search_history', trimmed); // memory-only while incognito
  },

  removeSearchHistory(query) {
    const hist = this._state.searchHistory.filter(q => q !== query);
    this._state.searchHistory = hist;
    this.persist('search_history', hist);
  },
};

store.init();

export default store;
