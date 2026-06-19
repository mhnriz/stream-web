/**
 * Watchlist Page
 */

import API from '../api.js?v=1.3.8';
import store from '../store.js?v=1.3.8';
import { renderCard, renderTopBar, toast } from '../components.js?v=1.3.8';

export default async function renderWatchlist(container, router) {
  container.innerHTML = renderTopBar('Watchlist', 'Your saved titles');

  const grid = document.createElement('div');
  grid.className = 'browse-grid stagger fade-in';
  grid.style.paddingTop = '24px';
  container.appendChild(grid);

  try {
    const list = await API.getWatchlist();
    store.set('watchlist', list);

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="watchlist-empty" style="grid-column:1/-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <h3>Your watchlist is empty</h3>
          <p>Start adding movies and series you want to watch later.</p>
        </div>
      `;
      return;
    }

    list.forEach(item => {
      const card = renderCard(item, {
        onClick: (itm) => {
          const id = itm.id || (itm.tmdbId ? `tmdb:${itm.tmdbId}` : null);
          if (id) router.navigate(`/details/${itm.type || 'movie'}/${encodeURIComponent(id)}`);
        },
      });
      grid.appendChild(card);
    });
  } catch {
    grid.innerHTML = '<p style="padding:48px;color:var(--text-dim)">Failed to load watchlist.</p>';
  }

  // Search from top bar
  const searchInput = container.querySelector('.search-topbar-input');
  if (searchInput) {
    searchInput.addEventListener('focus', () => router.navigate('/search'));
  }
}
