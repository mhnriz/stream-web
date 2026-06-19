/**
 * Home Page — Hero section + content rows
 */

import API from '../api.js?v=1.3.8';
import store from '../store.js?v=1.3.8';
import { $, renderContentRow, renderSkeletonRow, renderTopBar, toast, renderResponsiveImage } from '../components.js?v=1.3.8';

// Popular titles to show in hero — fetched from catalogs or TMDB trending
const HERO_IMDB_IDS = [
  { type: 'movie', id: 'tt1375666', fallbackTitle: 'Inception' },
  { type: 'movie', id: 'tt0816692', fallbackTitle: 'Interstellar' },
  { type: 'series', id: 'tt0903747', fallbackTitle: 'Breaking Bad' },
  { type: 'movie', id: 'tt4154796', fallbackTitle: 'Avengers: Endgame' },
  { type: 'movie', id: 'tt6751668', fallbackTitle: 'Parasite' },
];

// Module-level cache — persists across SPA navigations, clears on full reload
// Structure: [{ name, metas[] }]
let _catalogCache = null;
// Hero metas cached after first load — prevents re-fetching and rate-limiting
let _heroCache = null;

export default async function renderHome(container, router) {
  window.splash?.progress(10);

  let appName = store.get('appName');
  if (!appName) {
    try {
      const v = await fetch('/api/version').then(r => r.json());
      appName = v.app || 'StreamApp';
      store.set('appName', appName);
    } catch {
      appName = 'StreamApp';
    }
  }
  container.innerHTML = renderTopBar(appName, 'Endless Entertainment, Anytime, Anywhere!');

  // Hero skeleton
  const heroEl = document.createElement('div');
  heroEl.className = 'hero';
  heroEl.innerHTML = '<div class="skeleton skeleton-hero"></div>';
  container.appendChild(heroEl);

  // Skeleton content rows
  for (let i = 0; i < 3; i++) {
    container.appendChild(renderSkeletonRow());
  }

  // Handle top bar search
  const searchInput = container.querySelector('.search-topbar-input');
  if (searchInput) {
    searchInput.addEventListener('focus', () => router.navigate('/search'));
  }

  // Navigate to details
  const goToDetails = (item) => {
    let id = item.id || (item.tmdbId ? `tmdb:${item.tmdbId}` : null);
    if (!id) return;
    id = id.replace(/:\d+:\d+$/, '');
    router.navigate(`/details/${item.type}/${encodeURIComponent(id)}`);
  };

  window.splash?.progress(20);

  // Load data concurrently
  const [continueList, watchlist] = await Promise.all([
    API.getContinueWatching().catch(() => []),
    API.getWatchlist().catch(() => []),
  ]);
  store.set('continueWatching', continueList);
  store.set('watchlist', watchlist);

  window.splash?.progress(35);

  // Load hero data (non-blocking — runs in background)
  loadHero(heroEl, router);

  // Remove skeleton rows
  container.querySelectorAll('.content-section').forEach(s => s.remove());

  // Continue Watching
  if (continueList.length > 0) {
    const row = renderContentRow('Continue Watching', continueList, {
      wide: true,
      showProgress: true,
      onItemClick: goToDetails,
    });
    if (row) container.appendChild(row);
  }

  // Load catalogs — use cache on return visits for instant render
  try {
    if (_catalogCache) {
      // Return visit — render from cache immediately
      const fragment = document.createDocumentFragment();
      for (const { name, metas } of _catalogCache) {
        const row = renderContentRow(name, metas, { onItemClick: goToDetails });
        if (row) fragment.appendChild(row);
      }
      container.appendChild(fragment);
    } else {
      // First visit to home (or hard reload landed on home)
      // If store already has catalogs (populated by browse on reload), skip manifest fetch
      window.splash?.progress(45);
      let catalogs = store.get('catalogs');
      if (!catalogs || catalogs.length === 0) {
        catalogs = await API.getCatalogs();
        store.set('catalogs', catalogs);
      }
      window.splash?.progress(55);

      const catalogResults = await Promise.allSettled(
        catalogs.slice(0, 20).map(cat => API.getCatalog(cat.type, cat.id).then(data => ({ cat, data })))
      );
      window.splash?.progress(90);

      const fragment = document.createDocumentFragment();
      _catalogCache = [];
      for (const result of catalogResults) {
        if (result.status !== 'fulfilled') continue;
        const { cat, data } = result.value;
        const metas = (data.metas || []).map(m => ({
          id: m.id,
          tmdbId: m.tmdbId,
          type: m.type || cat.type,
          title: m.name || m.title,
          poster: m.poster,
          year: m.releaseInfo || m.year,
          rating: m.imdbRating,
        }));
        if (metas.length > 0) {
          _catalogCache.push({ name: cat.name || cat.id, metas });
          const row = renderContentRow(cat.name || cat.id, metas, { onItemClick: goToDetails });
          if (row) fragment.appendChild(row);
        }
      }
      container.appendChild(fragment);
    }
  } catch {
    const fallback = document.createElement('div');
    fallback.style.cssText = 'padding:48px;text-align:center;color:var(--text-dim)';
    fallback.textContent = 'Configure CATALOG_URL to see content catalogs here.';
    container.appendChild(fallback);
  }

  // Watchlist row
  if (watchlist.length > 0) {
    const row = renderContentRow('Your Watchlist', watchlist, {
      onItemClick: goToDetails,
      seeAllHref: '/watchlist',
    });
    if (row) container.appendChild(row);
  }

  // All content rendered — dismiss splash
  window.splash?.dismiss();
}

async function loadHero(heroEl, router) {
  // Use cached hero data on return visits — prevents TMDB rate-limiting
  if (!_heroCache) {
    const results = await Promise.allSettled(
      HERO_IMDB_IDS.slice(0, 5).map(h => API.getMeta(h.type, h.id))
    );
    _heroCache = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
  }
  const heroMetas = _heroCache;

  if (heroMetas.length === 0) {
    heroEl.innerHTML = `
      <div class="hero-gradient" style="background:linear-gradient(135deg,#1a1b2e 0%,#0F1118 100%)"></div>
      <div class="hero-content">
        <div class="hero-badge">Welcome</div>
        <h1 class="hero-title">${appName}</h1>
        <p class="hero-overview">Your self-hosted streaming platform. Search for movies and series to get started.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" onclick="document.querySelector('[data-page=search]').click()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Browse
          </button>
        </div>
      </div>
    `;
    return;
  }

  let currentSlide = 0;

  function renderHeroSlides() {
    heroEl.innerHTML = heroMetas.map((meta, i) => `
      <div class="hero-slide ${i === 0 ? 'active' : ''}" data-slide="${i}">
        ${meta.backdrop ? renderResponsiveImage(meta.backdrop, '', 'hero', 'hero-backdrop', `loading="${i === 0 ? 'eager' : 'lazy'}" ${i === 0 ? 'fetchpriority="high"' : ''}`) : ''}
        <div class="hero-gradient"></div>
        <div class="hero-content">
          <div class="hero-badge">Trending Now</div>
          <h1 class="hero-title">${meta.title}</h1>
          <div class="hero-meta">
            <span>${meta.year}</span>
            <span class="hero-meta-dot">•</span>
            <span>${meta.genres?.slice(0, 3).join(', ') || ''}</span>
            <span class="hero-meta-dot">•</span>
            ${meta.runtime ? `<span>${meta.runtime}m</span><span class="hero-meta-dot">•</span>` : ''}
            ${meta.rating ? `<span class="hero-rating">★ ${meta.rating}</span>` : ''}
          </div>
          <p class="hero-overview">${meta.overview || ''}</p>
          <div class="hero-actions">
            <button class="btn btn-primary hero-play-btn" data-idx="${i}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
              Watch
            </button>
            <button class="btn btn-secondary hero-info-btn" data-idx="${i}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              More Info
            </button>
          </div>
        </div>
      </div>
    `).join('') + `
      <div class="hero-nav">
        <button class="hero-arrow hero-prev">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        ${heroMetas.map((_, i) => `<button class="hero-nav-dot ${i === 0 ? 'active' : ''}" data-dot="${i}"></button>`).join('')}
        <button class="hero-arrow hero-next">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    `;

    // Event listeners
    heroEl.querySelectorAll('.hero-play-btn, .hero-info-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const meta = heroMetas[parseInt(btn.dataset.idx)];
        router.navigate(`/details/${meta.type}/${encodeURIComponent(meta.id)}`);
      });
    });

    heroEl.querySelector('.hero-prev')?.addEventListener('click', () => {
      currentSlide = (currentSlide - 1 + heroMetas.length) % heroMetas.length;
      showSlide(currentSlide);
    });

    heroEl.querySelector('.hero-next')?.addEventListener('click', () => {
      currentSlide = (currentSlide + 1) % heroMetas.length;
      showSlide(currentSlide);
    });

    heroEl.querySelectorAll('.hero-nav-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        currentSlide = parseInt(dot.dataset.dot);
        showSlide(currentSlide);
      });
    });
  }

  function showSlide(idx) {
    heroEl.querySelectorAll('.hero-slide').forEach(s => s.classList.remove('active'));
    heroEl.querySelectorAll('.hero-nav-dot').forEach(d => d.classList.remove('active'));
    heroEl.querySelector(`[data-slide="${idx}"]`)?.classList.add('active');
    heroEl.querySelector(`[data-dot="${idx}"]`)?.classList.add('active');
  }

  renderHeroSlides();

  // Auto-rotate
  const interval = setInterval(() => {
    currentSlide = (currentSlide + 1) % heroMetas.length;
    showSlide(currentSlide);
  }, 8000);

  // Cleanup on page change
  const orig = heroEl.remove.bind(heroEl);
  heroEl.remove = () => { clearInterval(interval); orig(); };
}
