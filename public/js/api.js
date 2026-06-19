/**
 * StreamApp API Client
 * Wraps all backend endpoints in a clean async interface.
 */

const API = {
  // ─── TMDB Metadata ─────────────────────────────────────────
  async getMeta(type, id) {
    const res = await fetch(`/api/meta/${type}/${id}`);
    if (!res.ok) throw new Error('Not found');
    return res.json();
  },

  async getEpisodes(tmdbId, season) {
    const res = await fetch(`/api/episodes/${tmdbId}/${season}`);
    return res.json();
  },

  async search(query) {
    if (!query?.trim()) return [];
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    return res.json();
  },

  // ─── Catalogs ──────────────────────────────────────────────
  async getCatalogs() {
    const res = await fetch('/api/catalogs');
    return res.json();
  },

  async getCatalog(type, id, skip = 0) {
    const res = await fetch(`/api/catalog/${type}/${id}?skip=${skip}`);
    return res.json();
  },

  // ─── Streams ───────────────────────────────────────────────
  async getStreams(type, imdbId, season, episode, runtime) {
    let url = `/api/streams/${type}/${imdbId}`;
    const params = new URLSearchParams();
    if (season) params.set('s', season);
    if (episode) params.set('e', episode);
    if (runtime) params.set('runtime', runtime);
    if (params.toString()) url += `?${params}`;
    const res = await fetch(url);
    return res.json();
  },

  // ─── Play ──────────────────────────────────────────────────
  async resolvePlayback(stream) {
    const res = await fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        infoHash: stream.infoHash,
        fileIdx: stream.fileIdx,
        url: stream.url,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.playbackUrl;
  },

  // ─── Subtitles ─────────────────────────────────────────────
  async getSubtitles(type, imdbId, season, episode) {
    let url = `/api/subtitles/${type}/${imdbId}`;
    const params = new URLSearchParams();
    if (season) params.set('s', season);
    if (episode) params.set('e', episode);
    if (params.toString()) url += `?${params}`;
    const res = await fetch(url);
    return res.json();
  },

  // ─── Watchlist ─────────────────────────────────────────────
  async getWatchlist() {
    const res = await fetch('/api/watchlist');
    return res.json();
  },

  async toggleWatchlist(item) {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    return res.json();
  },

  // ─── Continue Watching ─────────────────────────────────────
  async getContinueWatching() {
    const res = await fetch('/api/continue');
    return res.json();
  },

  async saveProgress(data) {
    return fetch('/api/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  async removeContinue(id) {
    return fetch(`/api/continue/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // ─── Library ───────────────────────────────────────────────
  async getLibrary() {
    const res = await fetch('/api/library');
    return res.json();
  },

  // ─── Online ────────────────────────────────────────────────
  async ping(sessionId) {
    const res = await fetch('/api/online/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    return res.json();
  },

  async getOnline() {
    const res = await fetch('/api/online');
    return res.json();
  },
};

export default API;
