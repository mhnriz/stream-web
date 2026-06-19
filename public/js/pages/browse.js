/**
 * Browse Page — Movies / Series / Anime
 */

import API from '../api.js?v=1.3.8';
import store from '../store.js?v=1.3.8';
import { renderCard, renderTopBar, renderSkeletonRow } from '../components.js?v=1.3.8';

const GENRES = ['Action','Adventure','Animation','Comedy','Crime','Documentary','Drama','Family','Fantasy','History','Horror','Music','Mystery','Romance','Sci-Fi','Thriller','War','Western'];

// Module-level cache: { movies: [...], series: [...], anime: [...] }
const _browseCache = {};

export default async function renderBrowse(container, router, pageType) {
  const titles = {
    movies: 'Movies',
    series: 'TV Series',
    anime: 'Anime',
  };
  const catalogType = pageType === 'movies' ? 'movie' : 'series';

  container.innerHTML = renderTopBar(titles[pageType], `Browse ${titles[pageType]}`);

  // Browse header
  const header = document.createElement('div');
  header.className = 'browse-header fade-in';
  header.innerHTML = `
    <div class="browse-tabs">
      <a href="/movies" class="browse-tab ${pageType === 'movies' ? 'active' : ''}">Movies</a>
      <a href="/series" class="browse-tab ${pageType === 'series' ? 'active' : ''}">TV Series</a>
      <a href="/anime" class="browse-tab ${pageType === 'anime' ? 'active' : ''}">Anime</a>
    </div>
    <div class="browse-filters">
      <select class="filter-select" id="filter-genre">
        <option value="">Genre</option>
        ${GENRES.map(g => `<option value="${g}">${g}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-year">
        <option value="">Year</option>
        ${Array.from({length: 30}, (_, i) => 2026 - i).map(y => `<option value="${y}">${y}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-sort">
        <option value="">Sort by</option>
        <option value="rating">Rating</option>
        <option value="year">Year</option>
        <option value="title">Title</option>
      </select>
      <div class="browse-view-toggle">
        <button class="view-btn active" data-view="grid" title="Grid view">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </button>
        <button class="view-btn" data-view="list" title="List view">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </button>
      </div>
    </div>
  `;
  container.appendChild(header);

  // Grid container
  const grid = document.createElement('div');
  grid.className = 'browse-grid stagger';
  grid.innerHTML = Array(12).fill('').map(() => `
    <div class="skeleton-card" style="width:100%">
      <div class="skeleton skeleton-poster"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text-sm"></div>
    </div>
  `).join('');
  container.appendChild(grid);

  // Load content — use cache on return visits for instant render
  let allItems = [];

  try {
    if (_browseCache[pageType]) {
      // Return visit — use cached items instantly
      allItems = _browseCache[pageType];
    } else {
      // Fresh load — fetch catalogs directly (don't rely on store being populated)
      let catalogs = store.get('catalogs');
      if (!catalogs || catalogs.length === 0) {
        catalogs = await API.getCatalogs();
        store.set('catalogs', catalogs); // populate store for other pages
      }

      const relevant = catalogs.filter(c => c.type === catalogType);

      if (relevant.length === 0) {
        // No matching catalogs — leave allItems empty, show empty state
      } else {
        const results = await Promise.allSettled(
          relevant.slice(0, 6).map(cat =>
            API.getCatalog(cat.type, cat.id).then(data => ({ cat, data }))
          )
        );

        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          const { cat, data } = r.value;
          const metas = (data.metas || []).map(m => ({
            id: m.id,
            tmdbId: m.tmdbId,
            type: cat.type,
            title: m.name || m.title,
            poster: m.poster,
            year: m.releaseInfo || m.year,
            rating: m.imdbRating,
            genres: m.genres || [],
            catalogName: cat.name,
          }));
          allItems.push(...metas);
        }

        // Deduplicate by id
        const seen = new Set();
        allItems = allItems.filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });

        // Anime filter
        if (pageType === 'anime') {
          const animeGenres = ['animation', 'anime'];
          allItems = allItems.filter(item =>
            (item.genres || []).some(g => animeGenres.includes(g.toLowerCase())) ||
            item.catalogName?.toLowerCase().includes('anime')
          );
        }

        // Cache for next visit
        if (allItems.length > 0) _browseCache[pageType] = allItems;
      }
    }
  } catch {
    // Catalogs not available — empty state shown below
  }

  renderGrid(grid, allItems, router);

  // Filter handlers
  const filterGenre = header.querySelector('#filter-genre');
  const filterYear = header.querySelector('#filter-year');
  const filterSort = header.querySelector('#filter-sort');

  function applyFilters() {
    let filtered = [...allItems];
    const genre = filterGenre.value;
    const year = filterYear.value;
    const sort = filterSort.value;

    if (genre) {
      filtered = filtered.filter(i =>
        (i.genres || []).some(g => g.toLowerCase().includes(genre.toLowerCase()))
      );
    }
    if (year) {
      filtered = filtered.filter(i => i.year?.toString().startsWith(year));
    }
    if (sort === 'rating') {
      filtered.sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0));
    } else if (sort === 'year') {
      filtered.sort((a, b) => (b.year || 0) - (a.year || 0));
    } else if (sort === 'title') {
      filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    renderGrid(grid, filtered, router);
  }

  filterGenre.addEventListener('change', applyFilters);
  filterYear.addEventListener('change', applyFilters);
  filterSort.addEventListener('change', applyFilters);

  // Search from top bar
  const searchInput = container.querySelector('.search-topbar-input');
  if (searchInput) {
    searchInput.addEventListener('focus', () => router.navigate('/search'));
  }
}

function renderGrid(grid, items, router) {
  grid.innerHTML = '';
  if (items.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-dim)">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 12px"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
        <p>No content found. Configure your catalog source to populate this page.</p>
      </div>
    `;
    return;
  }

  items.forEach(item => {
    const card = renderCard(item, {
      onClick: (itm) => {
        const id = itm.id || (itm.tmdbId ? `tmdb:${itm.tmdbId}` : null);
        if (id) router.navigate(`/details/${itm.type}/${encodeURIComponent(id)}`);
      },
    });
    grid.appendChild(card);
  });
}
