/**
 * Reusable UI Components
 */

import store from './store.js';

// ─── Utility ─────────────────────────────────────────────────

export function $(sel, parent = document) { return parent.querySelector(sel); }
export function $$(sel, parent = document) { return [...parent.querySelectorAll(sel)]; }

export function el(tag, attrs = {}, ...children) {
  const elem = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') elem.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(elem.style, v);
    else if (k.startsWith('on') && typeof v === 'function') elem.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'innerHTML') elem.innerHTML = v;
    else elem.setAttribute(k, v);
  }
  children.flat().forEach(child => {
    if (typeof child === 'string') elem.appendChild(document.createTextNode(child));
    else if (child instanceof Node) elem.appendChild(child);
  });
  return elem;
}

export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function toast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const t = el('div', { className: `toast ${type}`, role: 'status' }, message);
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, duration);
}

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ─── Responsive Images ───────────────────────────────────────

const TMDB_IMG_RE = /^(https?:\/\/image\.tmdb\.org\/t\/p\/)([^/]+)(\/.+)$/;

/** Swap the size segment of a TMDB image URL (w500 → w185, etc.). */
export function tmdbVariant(url, size) {
  const m = TMDB_IMG_RE.exec(url || '');
  return m ? `${m[1]}${size}${m[3]}` : url;
}

/**
 * Render a responsive image. Two strategies:
 *
 *  • TMDB URLs (the common case): rewrite the /t/p/<size>/ segment into a
 *    srcset so phones pull w185 (~10KB) instead of w500 (~60KB) posters and
 *    w780 backdrops instead of multi-MB originals — this is where the
 *    80%+ bandwidth reduction comes from.
 *
 *  • Local images (/images/...): emit a <picture> with the -m / -t WebP +
 *    JPEG variants produced by scripts/optimize-images.js.
 *
 * @param {string} src   image URL (TMDB or local)
 * @param {string} alt   alt text
 * @param {string} type  'poster' | 'hero' | 'thumb'
 * @param {string} cls   class for the <img>
 * @param {string} extra extra attributes for the <img> (e.g. loading)
 */
export function renderResponsiveImage(src, alt = '', type = 'poster', cls = '', extra = 'loading="lazy"') {
  const safeAlt = String(alt).replace(/"/g, '&quot;');
  if (!src) return `<img class="${cls}" src="" alt="${safeAlt}" ${extra}>`;

  // ── TMDB CDN: srcset of pre-sized variants ──
  if (TMDB_IMG_RE.test(src)) {
    if (type === 'hero') {
      return `<img class="${cls}"
        src="${tmdbVariant(src, 'w1280')}"
        srcset="${tmdbVariant(src, 'w780')} 780w, ${tmdbVariant(src, 'w1280')} 1280w, ${tmdbVariant(src, 'original')} 1920w"
        sizes="100vw"
        alt="${safeAlt}" ${extra}>`;
    }
    if (type === 'thumb') {
      return `<img class="${cls}"
        src="${tmdbVariant(src, 'w185')}"
        srcset="${tmdbVariant(src, 'w92')} 92w, ${tmdbVariant(src, 'w185')} 185w, ${tmdbVariant(src, 'w342')} 342w"
        sizes="(max-width: 430px) 30vw, 185px"
        alt="${safeAlt}" ${extra}>`;
    }
    // poster (default)
    return `<img class="${cls}"
      src="${tmdbVariant(src, 'w342')}"
      srcset="${tmdbVariant(src, 'w185')} 185w, ${tmdbVariant(src, 'w342')} 342w, ${tmdbVariant(src, 'w500')} 500w"
      sizes="(max-width: 430px) 33vw, (max-width: 1024px) 165px, 220px"
      alt="${safeAlt}" ${extra}>`;
  }

  // ── Local optimized assets: <picture> with WebP + JPEG fallbacks ──
  if (src.startsWith('/images/')) {
    const basePath = src.replace(/\.[^/.]+$/, '');
    const bpSmall = type === 'hero' ? '600px' : '430px';
    return `
      <picture>
        <source srcset="${basePath}-m.webp" media="(max-width: ${bpSmall})" type="image/webp">
        <source srcset="${basePath}-m.jpg"  media="(max-width: ${bpSmall})">
        <source srcset="${basePath}-t.webp" media="(max-width: 1024px)" type="image/webp">
        <source srcset="${basePath}-t.jpg"  media="(max-width: 1024px)">
        <source srcset="${basePath}.webp" type="image/webp">
        <img class="${cls}" src="${basePath}.jpg" alt="${safeAlt}" ${extra}>
      </picture>`;
  }

  // ── Anything else (data: URIs, third-party) — pass through ──
  return `<img class="${cls}" src="${src}" alt="${safeAlt}" ${extra}>`;
}

// ─── Card Component ──────────────────────────────────────────

export function renderCard(item, options = {}) {
  const { wide = false, showProgress = false, onClick } = options;

  const poster = item.poster || 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="270" fill="%231a1b26"><rect width="180" height="270"/><text x="90" y="140" text-anchor="middle" fill="%23444" font-size="14">No Poster</text></svg>'
  );

  const card = el('div', { className: `card ${wide ? 'card-wide' : ''}` });
  card.innerHTML = `
    <div class="card-poster-wrap">
      ${item.poster
        ? renderResponsiveImage(poster, item.title || '', 'poster', 'card-poster',
            `loading="lazy" onerror="this.onerror=null;this.removeAttribute('srcset');this.style.opacity='0.3'"`)
        : `<img class="card-poster" src="${poster}" alt="${item.title || ''}" loading="lazy">`}
      <div class="card-overlay">
        <div class="card-quick-actions">
          <button class="card-action-btn play-btn" data-action="play" title="Play" aria-label="Play ${item.title || ''}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21"/></svg>
          </button>
          <button class="card-action-btn" data-action="info" title="More Info" aria-label="More info about ${item.title || ''}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          </button>
          <button class="card-action-btn ${store.isInWatchlist(item.id) ? 'saved' : ''}" data-action="watchlist" title="Watchlist" aria-label="${store.isInWatchlist(item.id) ? 'Remove from' : 'Add to'} watchlist" aria-pressed="${store.isInWatchlist(item.id)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${store.isInWatchlist(item.id) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </button>
        </div>
      </div>
      ${showProgress && item.progress ? `
        <div class="card-progress">
          <div class="card-progress-bar" style="width:${Math.round(item.progress * 100)}%"></div>
        </div>
      ` : ''}
    </div>
    <div class="card-info">
      <div class="card-title">${item.title || 'Unknown'}</div>
      <div class="card-meta">
        ${item.year ? `<span>${item.year}</span>` : ''}
        ${item.rating ? `<span class="card-rating">
          <svg viewBox="0 0 24 24" fill="#E5C77C"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          ${item.rating}
        </span>` : ''}
        ${item.type === 'series' && item.seasons ? `<span>${item.seasons}S</span>` : ''}
      </div>
      ${wide && showProgress && item.progress ? `
        <div class="card-remaining">${Math.round((1 - item.progress) * (item.duration || 0) / 60)}m remaining</div>
      ` : ''}
    </div>
  `;

  card.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'watchlist') {
      e.stopPropagation();
      import('./api.js').then(({ default: API }) => {
        API.toggleWatchlist({ id: item.id, type: item.type, title: item.title, poster: item.poster })
          .then(r => {
            if (r.added) toast('Added to watchlist', 'success');
            else toast('Removed from watchlist');
            // Refresh watchlist in store
            API.getWatchlist().then(list => store.set('watchlist', list));
          });
      });
      return;
    }

    if (onClick) onClick(item, action);
  });

  return card;
}

// ─── Content Row ─────────────────────────────────────────────

export function renderContentRow(title, items, options = {}) {
  const { wide = false, showProgress = false, onItemClick, seeAllHref } = options;
  if (!items || items.length === 0) return null;

  const section = el('div', { className: 'content-section fade-in' });
  section.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">${title}</h2>
      ${seeAllHref ? `<a href="${seeAllHref}" class="section-see-all">See all →</a>` : ''}
    </div>
    <div class="content-row">
      <button class="scroll-btn left" aria-label="Scroll left">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="content-scroll stagger"></div>
      <button class="scroll-btn right" aria-label="Scroll right">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  `;

  const scroll = section.querySelector('.content-scroll');
  items.forEach(item => {
    const card = renderCard(item, {
      wide,
      showProgress,
      onClick: (itm, action) => {
        if (onItemClick) onItemClick(itm, action);
      },
    });
    scroll.appendChild(card);
  });

  // Scroll buttons — hide at the respective edge using a class
  // (inline style.visibility is overridden by the :hover opacity rule in CSS)
  const leftBtn = section.querySelector('.scroll-btn.left');
  const rightBtn = section.querySelector('.scroll-btn.right');

  function updateScrollBtns() {
    const atStart = scroll.scrollLeft <= 4;
    const atEnd = scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 4;
    leftBtn.classList.toggle('scroll-btn-hidden', atStart);
    rightBtn.classList.toggle('scroll-btn-hidden', atEnd);
  }

  updateScrollBtns();
  scroll.addEventListener('scroll', updateScrollBtns, { passive: true });
  // Re-check once layout settles
  setTimeout(updateScrollBtns, 100);

  leftBtn.addEventListener('click', () => {
    scroll.scrollBy({ left: -400, behavior: 'smooth' });
  });
  rightBtn.addEventListener('click', () => {
    scroll.scrollBy({ left: 400, behavior: 'smooth' });
  });

  return section;
}

// ─── Skeleton Rows ───────────────────────────────────────────

export function renderSkeletonRow(count = 7) {
  const section = el('div', { className: 'content-section' });
  section.innerHTML = `
    <div class="section-header">
      <div class="skeleton" style="width:160px;height:20px;border-radius:6px"></div>
    </div>
    <div class="content-row">
      <div class="content-scroll">
        ${Array(count).fill('').map(() => `
          <div class="skeleton-card">
            <div class="skeleton skeleton-poster"></div>
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text-sm"></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  return section;
}

// ─── Top Bar ─────────────────────────────────────────────────

export function renderTopBar(title, subtitle) {
  const incognitoOn = store.isIncognito();
  return `
    <div class="top-bar">
      <div>
        <div class="top-bar-title">${title}</div>
        ${subtitle ? `<div class="top-bar-subtitle">${subtitle}</div>` : ''}
      </div>
      <div class="top-bar-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="What are you looking for?" class="search-topbar-input" aria-label="Search">
      </div>
      <div class="top-bar-actions">
        <button id="incognito-toggle" class="top-bar-btn ${incognitoOn ? 'active' : ''}"
                title="${incognitoOn ? 'Incognito ON — watch history is not being saved' : 'Toggle incognito mode (don\u2019t save watch history)'}"
                aria-label="Toggle incognito mode" aria-pressed="${incognitoOn}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
          <span class="incognito-label">Incognito</span>
        </button>
        <button id="theme-toggle" class="top-bar-btn" title="Toggle dark/light mode" aria-label="Toggle dark or light theme">
          <svg class="theme-icon-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
          <svg class="theme-icon-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        </button>
      </div>
      <div class="top-bar-status">
        <div class="status-badge">
          <span class="status-dot"></span>
          <span>Server Healthy</span>
        </div>
        <div class="status-badge" id="online-badge">
          <span>👤 1 online</span>
        </div>
      </div>
    </div>
  `;
}
