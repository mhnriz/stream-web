/**
 * Search Page — Instant search with debounce, filters, popular/recent suggestions
 */

import API from '../api.js?v=1.3.8';
import store from '../store.js?v=1.3.8';
import { debounce, renderResponsiveImage } from '../components.js?v=1.3.8';

const POPULAR_SEARCHES = ['Oppenheimer', 'Breaking Bad', 'The Last of Us', 'Inception', 'Attack on Titan'];

export default function renderSearch(container, router) {
  container.innerHTML = `
    <div class="search-page fade-in">
      <div class="search-container">
        <svg class="search-icon-lg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="search-input-lg" id="search-input" placeholder="Search movies, series, anime..." autofocus>
        <button class="search-clear hidden" id="search-clear">&times;</button>
      </div>

      <div class="search-filters-row" id="search-filters" style="display:none">
        <button class="chip active" data-filter="all">All</button>
        <button class="chip" data-filter="movie">Movies</button>
        <button class="chip" data-filter="series">TV Series</button>
      </div>

      <div class="search-layout">
        <div id="search-results" class="search-results-list"></div>
        <div class="search-sidebar" id="search-sidebar">
          <div class="search-sidebar-section">
            <div class="search-sidebar-title">Popular Searches</div>
            ${POPULAR_SEARCHES.map(q => `
              <div class="search-sidebar-item popular-search" data-query="${q}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
                ${q}
              </div>
            `).join('')}
          </div>
          <div class="search-sidebar-section" id="recent-searches-section">
            <div class="search-sidebar-title">Recent Searches</div>
            <div id="recent-searches-list"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const input = container.querySelector('#search-input');
  const clearBtn = container.querySelector('#search-clear');
  const resultsEl = container.querySelector('#search-results');
  const filtersRow = container.querySelector('#search-filters');
  const sidebar = container.querySelector('#search-sidebar');

  let allResults = [];
  let currentFilter = 'all';

  // Render recent searches
  function renderRecent() {
    const history = store.get('searchHistory') || [];
    const list = container.querySelector('#recent-searches-list');
    if (!list) return;
    if (history.length === 0) {
      container.querySelector('#recent-searches-section').style.display = 'none';
      return;
    }
    container.querySelector('#recent-searches-section').style.display = 'block';
    list.innerHTML = history.slice(0, 5).map(q => `
      <div class="search-sidebar-item recent-search" data-query="${q}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ${q}
      </div>
    `).join('');

    list.querySelectorAll('.recent-search svg').forEach(svg => {
      svg.addEventListener('click', (e) => {
        e.stopPropagation();
        const query = svg.closest('.recent-search').dataset.query;
        store.removeSearchHistory(query);
        renderRecent();
      });
    });

    list.querySelectorAll('.recent-search').forEach(el => {
      el.addEventListener('click', () => {
        input.value = el.dataset.query;
        doSearch(el.dataset.query);
      });
    });
  }

  renderRecent();

  // Popular search clicks
  container.querySelectorAll('.popular-search').forEach(el => {
    el.addEventListener('click', () => {
      input.value = el.dataset.query;
      doSearch(el.dataset.query);
    });
  });

  // Search logic
  const doSearch = debounce(async (query) => {
    if (!query.trim()) {
      resultsEl.innerHTML = '';
      filtersRow.style.display = 'none';
      sidebar.style.display = '';
      return;
    }

    resultsEl.innerHTML = `
      <div style="padding:20px;text-align:center;color:var(--text-dim)">
        <div class="loader-ring" style="margin:0 auto"><div></div><div></div><div></div></div>
        <p style="margin-top:12px">Searching...</p>
      </div>
    `;

    try {
      allResults = await API.search(query);
      store.addSearchHistory(query);
      renderRecent();
      filtersRow.style.display = 'flex';
      sidebar.style.display = 'none';
      renderResults();
    } catch {
      resultsEl.innerHTML = '<p style="color:var(--text-dim);padding:20px">Search failed. Please try again.</p>';
    }
  }, 350);

  function renderResults() {
    let filtered = allResults;
    if (currentFilter !== 'all') {
      filtered = allResults.filter(r => r.type === currentFilter);
    }

    // Update filter counts
    container.querySelectorAll('#search-filters .chip').forEach(chip => {
      const f = chip.dataset.filter;
      if (f === 'all') chip.textContent = `All (${allResults.length})`;
      else if (f === 'movie') chip.textContent = `Movies (${allResults.filter(r => r.type === 'movie').length})`;
      else if (f === 'series') chip.textContent = `TV Series (${allResults.filter(r => r.type === 'series').length})`;
    });

    if (filtered.length === 0) {
      resultsEl.innerHTML = '<p style="color:var(--text-dim);padding:20px">No results found.</p>';
      return;
    }

    resultsEl.innerHTML = filtered.map(item => `
      <div class="search-result-item" data-type="${item.type}" data-id="${item.tmdbId ? 'tmdb:' + item.tmdbId : item.id}">
        ${renderResponsiveImage(item.poster || '', item.title || '', 'thumb', 'search-result-poster', `loading="lazy" onerror="this.onerror=null;this.removeAttribute('srcset');this.style.opacity='0.2'"`)}
        <div class="search-result-info">
          <div class="search-result-title">${item.title}</div>
          <div class="search-result-meta">
            ${item.year || ''} • ${item.type === 'series' ? 'TV Series' : 'Movie'}
            ${item.rating ? ` • ★ ${item.rating}` : ''}
          </div>
          <div class="search-result-overview">${item.overview || ''}</div>
        </div>
      </div>
    `).join('');

    // Click handlers
    resultsEl.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const type = el.dataset.type;
        router.navigate(`/details/${type}/${encodeURIComponent(id)}`);
      });
    });
  }

  // Input events
  input.addEventListener('input', () => {
    const val = input.value;
    clearBtn.classList.toggle('hidden', !val);
    doSearch(val);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    resultsEl.innerHTML = '';
    filtersRow.style.display = 'none';
    sidebar.style.display = '';
    input.focus();
  });

  // Filter clicks
  container.querySelectorAll('#search-filters .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('#search-filters .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderResults();
    });
  });

  // Focus input on mount
  setTimeout(() => input.focus(), 100);
}
