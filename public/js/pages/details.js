/**
 * Detail Page — Movie/Series info, episodes, stream sources
 */

import API from '../api.js?v=1.3.8';
import store from '../store.js?v=1.3.8';
import { toast, renderContentRow, formatTime, renderResponsiveImage } from '../components.js?v=1.3.8';

function buildNextEpisode(season, episode, meta) {
  if (!season || !episode || !meta.seasons) return null;
  const epNum = parseInt(episode), sNum = parseInt(season);
  const cur = meta.seasons.find(s => s.number === sNum);
  if (cur && epNum < cur.episodes) return { season: sNum, episode: epNum + 1 };
  const next = meta.seasons.find(s => s.number === sNum + 1);
  return next ? { season: sNum + 1, episode: 1 } : null;
}

async function openWithPicker(meta, type, season, episode) {
  const title = meta.title + (season ? ` S${season}E${episode}` : '');
  toast('Finding streams…', 'info');
  try {
    const [streams, continueList] = await Promise.all([
      API.getStreams(type, meta.id, season, episode, meta.runtime, meta.tmdbId),
      API.getContinueWatching().catch(() => []),
    ]);
    if (!streams.length) { toast('No streams found', 'error'); return; }
    const continueId = meta.id + (season ? `:${season}:${episode}` : '');
    const saved = continueList.find(c => c.id === continueId);
    const resumeTime = saved?.currentTime > 10 ? saved.currentTime : 0;
    window.dispatchEvent(new CustomEvent('hs-open-picker', {
      detail: { streams, title, meta, season, episode, nextEpisode: buildNextEpisode(season, episode, meta), resumeTime },
    }));
  } catch (err) {
    toast('Failed to load streams: ' + err.message, 'error');
  }
}

export default async function renderDetails(container, router, params) {
  const { type, id } = params;

  // Tear down any listeners from the previous details render
  container.dispatchEvent(new Event('hs-destroy'));

  container.innerHTML = `
    <div class="detail-hero">
      <div class="skeleton skeleton-hero"></div>
    </div>
    <div class="detail-body">
      <div class="skeleton" style="width:200px;height:24px;margin-bottom:20px;border-radius:6px"></div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${Array(3).fill('<div class="skeleton" style="height:60px;border-radius:12px"></div>').join('')}
      </div>
    </div>
  `;

  let meta;
  try {
    meta = await API.getMeta(type, id);
    if (!meta) throw new Error('Not found');
    store.set('currentMeta', meta);
  } catch (err) {
    container.innerHTML = `
      <div style="padding:80px 48px;text-align:center">
        <h2 style="font-family:var(--font-display);margin-bottom:8px">Not Found</h2>
        <p style="color:var(--text-dim)">Could not load metadata for this title.</p>
        <button class="btn btn-secondary" style="margin-top:16px" onclick="history.back()">← Go Back</button>
      </div>
    `;
    return;
  }

  const isInWatchlist = store.isInWatchlist(meta.id);
  const posterUrl = meta.poster || '';
  const backdropUrl = meta.backdrop || '';

  container.innerHTML = `
    <div class="detail-hero fade-in">
      ${backdropUrl ? renderResponsiveImage(backdropUrl, '', 'hero', 'detail-backdrop', 'loading="eager" fetchpriority="high"') : ''}
      <div class="detail-hero-grad"></div>
      <div class="detail-hero-content">
        ${posterUrl ? renderResponsiveImage(posterUrl, meta.title, 'poster', 'detail-poster', 'loading="eager"') : ''}
        <div class="detail-info">
          <h1 class="detail-title">${meta.title}</h1>
          <div class="detail-meta">
            ${meta.year ? `<span>${meta.year}</span>` : ''}
            ${meta.runtime ? `<span>•</span><span>${meta.runtime}m</span>` : ''}
            ${meta.rating ? `<span>•</span><span style="color:var(--warning);font-weight:600">★ ${meta.rating}</span>` : ''}
            ${meta.contentRating ? `<span>•</span><span class="content-rating-badge">${meta.contentRating}</span>` : ''}
            ${meta.totalSeasons ? `<span>•</span><span>${meta.totalSeasons} Season${meta.totalSeasons > 1 ? 's' : ''}</span>` : ''}
          </div>
          <div class="detail-genres">
            ${(meta.genres || []).map(g => `<span class="detail-genre-tag">${g}</span>`).join('')}
          </div>
          ${meta.tagline ? `<p style="font-size:0.85rem;color:var(--secondary);font-style:italic;margin-bottom:8px">${meta.tagline}</p>` : ''}
          <p class="detail-overview">${meta.overview || ''}</p>
          <div class="detail-actions">
            <button class="btn btn-primary" id="detail-play-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
              ${type === 'series' ? 'Play S1 E1' : 'Watch Now'}
            </button>
            ${meta.trailer ? `
              <a href="https://www.youtube.com/watch?v=${meta.trailer}" target="_blank" class="btn btn-secondary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21"/></svg>
                Trailer
              </a>
            ` : ''}
            <button class="btn-icon" id="detail-watchlist-btn" title="${isInWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="${isInWatchlist ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="detail-body">
      <!-- Cast -->
      ${meta.cast?.length ? `
        <div class="detail-section">
          <h3 class="detail-section-title">Cast</h3>
          <div class="cast-scroll-wrap">
          <div class="cast-scroll">
            ${meta.cast.map(c => `
              <div class="cast-card">
                <img class="cast-photo" src="${c.photo || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" fill="%231a1b26"><rect width="80" height="80"/></svg>')}" alt="${c.name}" loading="lazy">
                <div class="cast-name">${c.name}</div>
                <div class="cast-character">${c.character || ''}</div>
              </div>
            `).join('')}
          </div>
          </div>
        </div>
      ` : ''}

      <!-- Seasons (for series) -->
      ${type === 'series' && meta.seasons?.length ? `
        <div class="detail-section" id="seasons-section">
          <h3 class="detail-section-title">Episodes</h3>
          <div class="season-tabs" id="season-tabs">
            ${meta.seasons.map((s, i) => `
              <button class="season-tab ${i === 0 ? 'active' : ''}" data-season="${s.number}" data-tmdb="${meta.tmdbId}">
                Season ${s.number}
              </button>
            `).join('')}
          </div>
          <div class="episodes-list" id="episodes-list">
            <div style="padding:20px;text-align:center;color:var(--text-dim)">Loading episodes...</div>
          </div>
        </div>
      ` : ''}

      <!-- Streams -->
      <div class="detail-section" id="streams-section">
        <h3 class="detail-section-title" id="streams-title">
          ${type === 'series' ? 'Select an episode above to see streams' : 'Available Streams'}
        </h3>
        <div class="streams-list" id="streams-list">
          ${type === 'movie' ? '<div style="padding:20px;text-align:center;color:var(--text-dim)">Loading streams...</div>' : ''}
        </div>
      </div>

      <!-- Similar -->
      <div id="similar-section"></div>

      ${meta.director ? `
        <div class="detail-section">
          <h3 class="detail-section-title">Director</h3>
          <p style="color:var(--text-dim)">${meta.director}</p>
        </div>
      ` : ''}
    </div>
  `;

  // ─── Event: Watchlist ──────────────────────────────────────
  container.querySelector('#detail-watchlist-btn')?.addEventListener('click', async () => {
    const res = await API.toggleWatchlist({
      id: meta.id,
      type: meta.type,
      title: meta.title,
      poster: meta.poster,
    });
    toast(res.added ? 'Added to watchlist' : 'Removed from watchlist', res.added ? 'success' : 'info');
    const list = await API.getWatchlist();
    store.set('watchlist', list);

    // Update button
    const btn = container.querySelector('#detail-watchlist-btn svg');
    if (btn) btn.setAttribute('fill', res.added ? 'currentColor' : 'none');
  });

  // Streams section hidden — picker handles stream selection
  container.querySelector('#streams-section')?.classList.add('hidden');

  // ─── TASK-02: Smart Resume — update play button if previously watched ──
  try {
    const continueList = await API.getContinueWatching();
    const match = continueList.find(item => {
      const baseId = item.id.replace(/:\d+:\d+$/, '');
      return baseId === meta.id || item.id === meta.id;
    });

    if (match) {
      const playBtn = container.querySelector('#detail-play-btn');
      if (playBtn) {
        if (type === 'series' && match.id.includes(':')) {
          const parts = match.id.split(':');
          const rS = parts[parts.length - 2];
          const rE = parts[parts.length - 1];
          playBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
            Resume S${rS}E${rE}
          `;
          // Wire resume click to click the right episode
          playBtn.dataset.resumeSeason = rS;
          playBtn.dataset.resumeEpisode = rE;
        } else if (type === 'movie' && match.currentTime > 10) {
          const pct = Math.round((match.currentTime / match.duration) * 100);
          playBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
            Resume ${pct}%
          `;
          playBtn.dataset.resumeTime = match.currentTime;
        }
      }
    }
  } catch { /* non-critical */ }

  // ─── Seasons & Episodes (for series) ──────────────────────
  let episodesReady = false;
  // Fetch continue-watching once and share with loadEpisodes for progress bars
  const continueListForProgress = await API.getContinueWatching().catch(() => []);

  if (type === 'series' && meta.seasons?.length) {
    loadEpisodes(container, meta, meta.seasons[0].number, router, continueListForProgress).then(() => {
      episodesReady = true;
      // Auto-play if arriving from end card navigation
      if (sessionStorage.getItem('hs-resume-season')) {
        container.querySelector('#detail-play-btn')?.click();
      }
    });

    container.querySelectorAll('.season-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        episodesReady = false;
        container.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadEpisodes(container, meta, parseInt(tab.dataset.season), router, continueListForProgress).then(() => {
          episodesReady = true;
        });
      });
    });
  }

  // ─── Play Button ──────────────────────────────────────────
  container.querySelector('#detail-play-btn')?.addEventListener('click', () => {
    if (type === 'movie') {
      openWithPicker(meta, type, null, null);
    } else {
      // Check for resume episode (from end card navigation or continue-watching)
      const btn = container.querySelector('#detail-play-btn');
      const rS = sessionStorage.getItem('hs-resume-season') || btn?.dataset?.resumeSeason;
      const rE = sessionStorage.getItem('hs-resume-episode') || btn?.dataset?.resumeEpisode;
      sessionStorage.removeItem('hs-resume-season');
      sessionStorage.removeItem('hs-resume-episode');
      if (rS && rE) {
        // Find and click the specific episode
        const epEl = container.querySelector(`.episode-item[data-season="${rS}"][data-episode="${rE}"]`);
        if (epEl) { epEl.click(); return; }
      }
      // Default: click first episode
      const firstEp = container.querySelector('.episode-item');
      if (firstEp) {
        firstEp.click();
      } else if (!episodesReady) {
        const episodesSection = container.querySelector('#seasons-section');
        if (episodesSection) {
          const top = episodesSection.getBoundingClientRect().top + window.scrollY - 24;
          window.scrollTo({ top, behavior: 'smooth' });
        }
        toast('Loading episodes…', 'info');
      }
    }
  });

  // ─── Refresh play button after player closes ──────────────
  const _onPlayerClosed = (e) => {
    const { currentTime, duration, season: s, episode: ep } = e.detail;
    const playBtn = container.querySelector('#detail-play-btn');
    if (!playBtn) return;
    if (type === 'series' && s && ep) {
      playBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg> Resume S${s}E${ep}`;
      playBtn.dataset.resumeSeason = s;
      playBtn.dataset.resumeEpisode = ep;
    } else if (type === 'movie' && currentTime > 10 && duration > 0) {
      const pct = Math.round((currentTime / duration) * 100);
      playBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg> Resume ${pct}%`;
      playBtn.dataset.resumeTime = currentTime;
    }
  };
  window.addEventListener('hs-player-closed', _onPlayerClosed);
  container.addEventListener('hs-destroy', () => window.removeEventListener('hs-player-closed', _onPlayerClosed), { once: true });

  // ─── Similar Titles ───────────────────────────────────────
  if (meta.similar?.length) {
    const similar = meta.similar.map(s => ({
      id: s.tmdbId ? `tmdb:${s.tmdbId}` : null,
      tmdbId: s.tmdbId,
      type,
      title: s.title,
      poster: s.poster,
      year: s.year,
      rating: s.rating,
    })).filter(s => s.id);

    const row = renderContentRow('You Might Also Like', similar, {
      onItemClick: (item) => {
        const detailId = item.id || `tmdb:${item.tmdbId}`;
        router.navigate(`/details/${item.type}/${encodeURIComponent(detailId)}`);
      },
    });
    if (row) container.querySelector('#similar-section').appendChild(row);
  }
}

// ─── Load Episodes ───────────────────────────────────────────

async function loadEpisodes(container, meta, seasonNum, router, continueList = []) {
  const episodesList = container.querySelector('#episodes-list');
  episodesList.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:40px;color:var(--text-dim)">
      <div class="loader-ring" style="margin:0"><div></div><div></div><div></div></div>
      <span style="margin-left:12px">Loading episodes...</span>
    </div>
  `;

  try {
    const episodes = await API.getEpisodes(meta.tmdbId, seasonNum);

    if (!episodes.length) {
      episodesList.innerHTML = '<p style="color:var(--text-dim);padding:16px">No episodes found.</p>';
      return;
    }

    episodesList.innerHTML = episodes.map(ep => {
      // Find progress for this episode
      const progressKey = `${meta.id}:${seasonNum}:${ep.number}`;
      const progressItem = continueList.find(c => c.id === progressKey);
      const pct = progressItem && progressItem.duration > 0
        ? Math.round((progressItem.currentTime / progressItem.duration) * 100)
        : 0;
      const watched = pct >= 90;

      return `
        <div class="episode-item" data-season="${seasonNum}" data-episode="${ep.number}" data-title="${(ep.name || `Episode ${ep.number}`).replace(/"/g, '&quot;')}">
          <div class="episode-thumb-wrap">
            ${renderResponsiveImage(ep.still || '', '', 'thumb', 'episode-thumb', `loading="lazy" onerror="this.onerror=null;this.removeAttribute('srcset');this.style.background='var(--bg-elevated)'"` )}
            ${pct > 0 ? `<div class="episode-progress-bar" style="width:${pct}%"></div>` : ''}
            ${watched ? `<div class="episode-watched-badge">✓</div>` : ''}
          </div>
          <div class="episode-info">
            <div class="episode-number">Episode ${ep.number}</div>
            <div class="episode-title">${ep.name || `Episode ${ep.number}`}</div>
            <div class="episode-overview">${ep.overview || ''}</div>
            <div class="episode-meta">
              ${ep.runtime ? `${ep.runtime}m` : ''}
              ${ep.rating ? ` • ★ ${ep.rating}` : ''}
              ${ep.airDate ? ` • ${ep.airDate}` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Episode click → load streams in the bottom streams section and scroll to it
    episodesList.querySelectorAll('.episode-item').forEach(ep => {
      ep.addEventListener('click', () => {
        // Highlight selected
        episodesList.querySelectorAll('.episode-item').forEach(el => el.style.borderColor = '');
        ep.style.borderColor = 'var(--accent)';

        const s = ep.dataset.season;
        const e = ep.dataset.episode;
        const epTitle = ep.dataset.title;

        openWithPicker(meta, 'series', s, e);
      });
    });
  } catch {
    episodesList.innerHTML = '<p style="color:var(--text-dim);padding:16px">Failed to load episodes.</p>';
  }
}

// ─── Load Streams ────────────────────────────────────────────

async function loadStreams(container, imdbId, type, season, episode, meta, router) {
  const streamsList = container.querySelector('#streams-list');
  streamsList.innerHTML = `
    <div style="width:100%;min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--text-dim)">
      <div class="loader-ring"></div>
      <span style="font-size:0.85rem">Finding streams...</span>
    </div>
  `;

  try {
    const streams = await API.getStreams(type, imdbId, season, episode, meta.runtime, meta.tmdbId);

    if (!streams.length) {
      streamsList.innerHTML = '<p style="color:var(--text-dim);padding:16px">No streams found for this title.</p>';
      return;
    }

    const recIdx = streams.findIndex(s => s.recommended);

    streamsList.innerHTML = streams.map((s, i) => {
      const tracker = s.tracker || s.addonName || 'Unknown';
      return `
        <div class="stream-item ${s.cached ? 'cached' : ''} ${s.recommended ? 'recommended' : ''}" data-idx="${i}">
          <span class="stream-quality-badge">${s.quality}</span>
          <div class="stream-info">
            <div class="stream-title-text">${tracker}</div>
            <div class="stream-meta-row">
              ${s.source ? `<span>${s.source}</span>` : ''}
              ${s.codec ? `<span>${s.codec}</span>` : ''}
              ${s.size ? `<span>${s.size}</span>` : ''}
              ${s.seeds != null ? `<span>👤 ${s.seeds}</span>` : ''}
            </div>
          </div>
          ${s.recommended ? '<span class="stream-rec-badge">★ Best Pick</span>' : ''}
          ${s.cached ? '<span class="stream-cached-badge">⚡ Instant</span>' : ''}
          ${s.browserFriendly ? '<span class="stream-cached-badge" style="color:var(--accent);background:var(--accent-dim)">🌐 Browser</span>' : ''}
          <button class="stream-play-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
          </button>
        </div>
      `;
    }).join('');

    // Click to play
    const playStream = async (stream, streamIdx = 0) => {
      const streamInfo = {
        quality: stream.quality,
        source: stream.source,
        codec: stream.codec,
        size: stream.size,
        tracker: stream.tracker || stream.addonName,
      };
      const baseDetail = {
        title: meta.title + (season ? ` S${season}E${episode}` : ''),
        meta, season, episode,
        nextEpisode: buildNextEpisode(season, episode, meta),
        streams, currentStreamIdx: streamIdx, streamInfo,
      };

      // Embed source — open iframe player directly, no server call
      if (stream.embedUrl) {
        window.dispatchEvent(new CustomEvent('hs-play', {
          detail: { ...baseDetail, embedUrl: stream.embedUrl, embedSource: stream.embedSource },
        }));
        return;
      }

      toast('Resolving stream...', 'info');
      try {
        const playbackUrl = await API.resolvePlayback(stream);
        window.dispatchEvent(new CustomEvent('hs-play', {
          detail: { ...baseDetail, url: playbackUrl },
        }));
      } catch (err) {
        toast('Failed to resolve stream: ' + err.message, 'error');
      }
    };

    streamsList.querySelectorAll('.stream-item').forEach((el, i) => {
      el.addEventListener('click', () => playStream(streams[i], i));
    });
  } catch (err) {
    streamsList.innerHTML = `<p style="color:var(--danger);padding:16px">Error: ${err.message}</p>`;
  }
}
