/**
 * StreamApp — Main Application Entry
 * Initializes router, player, session tracking, and global state.
 */

import Router from './router.js?v=1.3.8';
import API from './api.js?v=1.3.8';
import store from './store.js?v=1.3.8';
import { $, toast } from './components.js?v=1.3.8';
import { initPlayer } from './pages/player.js?v=1.3.8';

// ─── Boot ────────────────────────────────────────────────────

const router = new Router();
const container = $('#page-container');

// ─── Routes ──────────────────────────────────────────────────

router
  .add('/', async () => {
    const { default: renderHome } = await import('./pages/home.js?v=1.3.8');
    await renderHome(container, router);
    window.scrollTo(0, 0);
  })
  .add('/search', async () => {
    const { default: renderSearch } = await import('./pages/search.js?v=1.3.8');
    renderSearch(container, router);
    window.scrollTo(0, 0);
  })
  .add('/movies', async () => {
    const { default: renderBrowse } = await import('./pages/browse.js?v=1.3.8');
    await renderBrowse(container, router, 'movies');
    window.scrollTo(0, 0);
  })
  .add('/series', async () => {
    const { default: renderBrowse } = await import('./pages/browse.js?v=1.3.8');
    await renderBrowse(container, router, 'series');
    window.scrollTo(0, 0);
  })
  .add('/anime', async () => {
    const { default: renderBrowse } = await import('./pages/browse.js?v=1.3.8');
    await renderBrowse(container, router, 'anime');
    window.scrollTo(0, 0);
  })
  .add('/watchlist', async () => {
    const { default: renderWatchlist } = await import('./pages/watchlist.js?v=1.3.8');
    await renderWatchlist(container, router);
    window.scrollTo(0, 0);
  })
  .add('/library', async () => {
    const { default: renderLibrary } = await import('./pages/library.js?v=1.3.8');
    await renderLibrary(container, router);
    window.scrollTo(0, 0);
  })
  .add('/details/:type/:id', async (params) => {
    const { default: renderDetails } = await import('./pages/details.js?v=1.3.8');
    await renderDetails(container, router, params);
    window.scrollTo(0, 0);
  })
  .add('/settings', () => {
    container.innerHTML = `
      <div style="padding:48px;max-width:600px">
        <h1 style="font-family:var(--font-display);font-size:1.8rem;font-weight:800;margin-bottom:24px">Settings</h1>

        <div style="margin-bottom:28px">
          <h3 style="font-family:var(--font-display);font-size:1rem;margin-bottom:12px;color:var(--accent)">App Version</h3>
          <div style="display:flex;flex-direction:column;gap:8px" id="version-info">
            <div class="stream-item" style="cursor:default">
              <span style="font-size:1.2rem">📦</span>
              <div class="stream-info">
                <div class="stream-title-text" id="version-label">${store.get('appName') || 'StreamApp'}</div>
                <div class="stream-meta-row"><span id="version-number">Loading...</span></div>
              </div>
            </div>
          </div>
        </div>
        <div style="margin-bottom:28px">
          <h3 style="font-family:var(--font-display);font-size:1rem;margin-bottom:12px;color:var(--accent)">Server Status</h3>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div class="stream-item" style="cursor:default">
              <span style="font-size:1.2rem">🟢</span>
              <div class="stream-info">
                <div class="stream-title-text">Server</div>
                <div class="stream-meta-row"><span>Running and healthy</span></div>
              </div>
            </div>
            <div class="stream-item" style="cursor:default" id="torbox-status">
              <span style="font-size:1.2rem">⏳</span>
              <div class="stream-info">
                <div class="stream-title-text">TorBox</div>
                <div class="stream-meta-row"><span>Checking...</span></div>
              </div>
            </div>
          </div>
        </div>

        <div style="margin-bottom:28px">
          <h3 style="font-family:var(--font-display);font-size:1rem;margin-bottom:12px;color:var(--accent)">About</h3>
          <p style="color:var(--text-dim);font-size:0.88rem;line-height:1.6">
            <strong style="color:var(--text)" id="about-app-name">${store.get('appName') || 'StreamApp'}</strong> is a self-hosted streaming platform powered by
            TMDB metadata, TorBox content delivery, and Stremio addon integration.
          </p>
        </div>

        <div style="margin-bottom:28px">
          <h3 style="font-family:var(--font-display);font-size:1rem;margin-bottom:12px;color:var(--accent)">Keyboard Shortcuts (Player)</h3>
          <div style="display:grid;grid-template-columns:80px 1fr;gap:6px;font-size:0.82rem;color:var(--text-dim)">
            <span style="color:var(--text);font-weight:500">Space / K</span><span>Play / Pause</span>
            <span style="color:var(--text);font-weight:500">← / →</span><span>Seek ±10s</span>
            <span style="color:var(--text);font-weight:500">↑ / ↓</span><span>Volume</span>
            <span style="color:var(--text);font-weight:500">F</span><span>Fullscreen</span>
            <span style="color:var(--text);font-weight:500">M</span><span>Mute</span>
            <span style="color:var(--text);font-weight:500">C</span><span>Toggle subtitles</span>
            <span style="color:var(--text);font-weight:500">J / L</span><span>Seek ±10s</span>
            <span style="color:var(--text);font-weight:500">Esc</span><span>Exit player</span>
          </div>
        </div>

        <div style="margin-bottom:28px">
          <h3 style="font-family:var(--font-display);font-size:1rem;margin-bottom:12px;color:var(--accent)">Privacy & Appearance</h3>
          <p style="color:var(--text-dim);font-size:0.85rem;line-height:1.6">
            Use the <strong style="color:var(--text)">incognito</strong> (eye) and
            <strong style="color:var(--text)">theme</strong> (moon/sun) buttons in the top bar.
            While incognito is on, watch progress and search history are kept in memory only and
            vanish when the page reloads. Your watchlist is always saved — adding to it is intentional.
          </p>
        </div>

        <div>
          <h3 style="font-family:var(--font-display);font-size:1rem;margin-bottom:12px;color:var(--accent)">Data</h3>
          <button class="btn btn-secondary" id="clear-history" style="margin-right:8px">Clear Search History</button>
          <button class="btn btn-secondary" id="clear-continue">Clear Continue Watching</button>
        </div>
      </div>
    `;

    // Check TorBox status
    API.getLibrary()
      .then(() => {
        const el = container.querySelector('#torbox-status');
        if (el) el.innerHTML = `
          <span style="font-size:1.2rem">✅</span>
          <div class="stream-info">
            <div class="stream-title-text">TorBox</div>
            <div class="stream-meta-row"><span>Connected</span></div>
          </div>
        `;
      })
      .catch(() => {
        const el = container.querySelector('#torbox-status');
        if (el) el.innerHTML = `
          <span style="font-size:1.2rem">❌</span>
          <div class="stream-info">
            <div class="stream-title-text">TorBox</div>
            <div class="stream-meta-row"><span>Not configured or unreachable</span></div>
          </div>
        `;
      });

    // Fetch and display version
    fetch('/api/version')
      .then(r => r.json())
      .then(version => {
        const versionEl = container.querySelector('#version-number');
        const labelEl = container.querySelector('#version-label');
        if (versionEl) {
          versionEl.textContent = `v${version.version} • ${version.codeName || ''}`;
        }
        if (labelEl && version.app) {
          labelEl.textContent = version.app;
        }
        const aboutEl = container.querySelector('#about-app-name');
        if (aboutEl && version.app) aboutEl.textContent = version.app;
      })
      .catch(() => {
        const versionEl = container.querySelector('#version-number');
        if (versionEl) versionEl.textContent = 'v1.0.0';
      });

    container.querySelector('#clear-history')?.addEventListener('click', () => {
      localStorage.removeItem('hs_search_history');
      store.set('searchHistory', []);
      import('./components.js').then(m => m.toast('Search history cleared', 'success'));
    });

    container.querySelector('#clear-continue')?.addEventListener('click', async () => {
      const list = await API.getContinueWatching();
      for (const item of list) await API.removeContinue(item.id);
      store.set('continueWatching', []);
      import('./components.js').then(m => m.toast('Continue watching cleared', 'success'));
    });

    window.scrollTo(0, 0);
  });

// ─── Initialize ──────────────────────────────────────────────

// ─── Incognito Mode ──────────────────────────────────────────
// The toggle lives in the top bar, which is re-rendered by every page —
// so we use event delegation on document instead of binding per render.

function updateIncognitoUI() {
  const btn = document.getElementById('incognito-toggle');
  if (!btn) return;
  const on = store.isIncognito();
  btn.classList.toggle('active', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on
    ? 'Incognito ON — watch history is not being saved (click to turn off)'
    : 'Incognito OFF (click to turn on)';
}

function initIncognitoMode() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#incognito-toggle');
    if (!btn) return;
    const on = store.toggleIncognito();
    updateIncognitoUI();
    toast(
      on ? 'Incognito ON — watch history won\u2019t be saved' : 'Incognito OFF — history saving resumed',
      'info',
      2500
    );
  });
  window.addEventListener('incognito-changed', updateIncognitoUI);
  updateIncognitoUI();
}

// ─── Theme Toggle ────────────────────────────────────────────

function setTheme(theme, persistChoice = true) {
  const root = document.documentElement;

  // Animate only during the switch — a global "* { transition }" rule
  // would tank scroll performance (see themes.css note)
  root.classList.add('theme-transition');
  root.dataset.theme = theme;
  setTimeout(() => root.classList.remove('theme-transition'), 400);

  if (persistChoice) {
    try { localStorage.setItem('theme', theme); } catch { /* noop */ }
  }

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.content = theme === 'dark' ? '#0F1118' : '#F7F8FA';
  }
}

function initThemeToggle() {
  // index.html bootstraps data-theme inline before CSS paints; here we
  // only need the click handler + system-preference follow-up.
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#theme-toggle')) return;
    const current = document.documentElement.dataset.theme || 'dark';
    setTheme(current === 'dark' ? 'light' : 'dark');
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch { /* noop */ }
    if (!saved) setTheme(e.matches ? 'dark' : 'light', false); // follow system until user chooses
  });
}

// ─── Accessibility ───────────────────────────────────────────

function initA11y() {
  // Keep aria-current on the active nav item in sync with navigation
  const syncNav = () => {
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.classList.contains('active')) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  };
  syncNav();
  window.addEventListener('popstate', () => setTimeout(syncNav, 0));
  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item')) setTimeout(syncNav, 0);
  });
}

initIncognitoMode();
initThemeToggle();
initA11y();

// Init player once
initPlayer();

// Session tracking
const sessionId = 'hs_' + Math.random().toString(36).slice(2);

function pingOnline() {
  API.ping(sessionId).then(data => {
    const badge = document.getElementById('online-badge');
    if (badge) badge.innerHTML = `<span>👤 ${data.count} online</span>`;
    store.set('onlineCount', data.count);
  }).catch(() => {});
}

// ─── Splash Screen ───────────────────────────────────────────

// Expose a global so home.js can report progress and dismiss the splash
window.splash = {
  _el: null,
  _bar: null,
  init() {
    this._el = document.getElementById('loading-overlay');
    this._bar = document.getElementById('splash-bar');
  },
  progress(pct) {
    if (this._bar) this._bar.style.width = Math.min(100, pct) + '%';
  },
  dismiss() {
    if (!this._el) return;
    this._bar && (this._bar.style.width = '100%');
    setTimeout(() => {
      this._el.classList.add('fade-out');
      setTimeout(() => this._el?.remove(), 650);
    }, 200);
  },
};
window.splash.init();

// Fetch app name from server config and apply to title + splash
fetch('/api/version')
  .then(r => r.json())
  .then(v => {
    const name = v.app || 'StreamApp';
    store.set('appName', name);
    document.title = name;
    const splashTitle = document.querySelector('.splash-title');
    if (splashTitle) splashTitle.textContent = name;
  })
  .catch(() => {});

// Safety net: dismiss after 8s regardless (catalog fetch might fail/hang)
setTimeout(() => window.splash?.dismiss(), 8000);

// Also dismiss splash when any non-home route renders (they don't call dismiss themselves)
const _origResolve = router.resolve.bind(router);
router.resolve = function() {
  const path = window.location.pathname;
  if (path !== '/' && !path.startsWith('/#')) {
    // Non-home route on hard reload — dismiss splash after a short delay
    // (let the page render first so there's no blank flash)
    setTimeout(() => window.splash?.dismiss(), 800);
  }
  return _origResolve();
};

// Handle hs-navigate from player end card (next episode)
window.addEventListener('hs-navigate', (e) => {
  const { path } = e.detail;
  if (path) router.navigate(path);
});

pingOnline();
setInterval(pingOnline, 30000);

// Start router
router.resolve();

// Handle sidebar nav clicks
document.querySelectorAll('.nav-item[href]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    router.navigate(link.getAttribute('href'));
  });
});
