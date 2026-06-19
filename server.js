require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getStreams } = require('./src/addons');
const { resolveStream, listTorrents, checkCachedBatch } = require('./src/torbox');
const { getMeta, getSeasonEpisodes, search } = require('./src/tmdb');

const app = express();
app.use(cors());
app.use(express.json());

// Block search engines from indexing
app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  next();
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

// ─── Cache headers — prevent Cloudflare from serving stale JS/CSS ───
app.use((req, res, next) => {
  // Never cache HTML (so new versions are always fetched)
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  // Cache JS/CSS with revalidation — browser checks ETag on each load
  // Version param in URL still works as a hard cache-buster
  else if (req.path.match(/\.(js|css)$/)) {
    res.set('Cache-Control', 'no-cache');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const CATALOG_URL = process.env.CATALOG_URL || 'http://localhost:7000';
const APP_NAME = process.env.APP_NAME || 'StreamApp';

// Load version info
let versionInfo = null;
try {
  versionInfo = require('./version.json');
} catch {
  versionInfo = { version: '1.0.0', app: APP_NAME };
}

// ─── Version ────────────────────────────────────────────────

app.get('/api/version', (req, res) => {
  res.json({ ...versionInfo, app: APP_NAME });
});

app.get('/api/catalogs', async (req, res) => {
  try {
    const r = await fetch(`${CATALOG_URL}/manifest.json`);
    const manifest = await r.json();
    res.json(manifest.catalogs || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/catalog/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  const skip = req.query.skip || 0;
  try {
    const r = await fetch(`${CATALOG_URL}/catalog/${type}/${id}.json?skip=${skip}`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TMDB Metadata ───────────────────────────────────────────────────

app.get('/api/meta/:type/:imdbId', async (req, res) => {
  try {
    const meta = await getMeta(req.params.type, req.params.imdbId);
    if (!meta) return res.status(404).json({ error: 'Not found' });
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/episodes/:tmdbId/:season', async (req, res) => {
  try {
    const episodes = await getSeasonEpisodes(
      parseInt(req.params.tmdbId),
      parseInt(req.params.season)
    );
    res.json(episodes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json([]);
  try {
    const results = await search(query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Subtitles ─────────────────────────────────────────────────────────
//
// Primary:  OpenSubtitles.com REST API v1 (requires free API key)
//           Set OPENSUBTITLES_API_KEY in .env — get one free at opensubtitles.com/consumers
// Fallback: Stremio OpenSubtitles v3 addon (no key, may have rate limits)
//           Works when primary key not configured
//
// Sub proxy converts SRT → VTT on the fly.

const OPENSUBTITLES_KEY = process.env.OPENSUBTITLES_API_KEY || '';
const OPENSUBTITLES_APP = process.env.OPENSUBTITLES_APP || `${APP_NAME} v1`;

const LANG_MAP = {
  en: 'English', ar: 'Arabic', fr: 'French', es: 'Spanish', de: 'German',
  it: 'Italian', pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean',
  zh: 'Chinese', nl: 'Dutch', pl: 'Polish', sv: 'Swedish', tr: 'Turkish',
  ms: 'Malay', id: 'Indonesian', th: 'Thai', hi: 'Hindi', fa: 'Persian',
  // ISO 639-2 three-letter codes (Stremio/OpenSubtitles fallback)
  eng: 'English', ara: 'Arabic', fra: 'French', spa: 'Spanish', deu: 'German',
  ita: 'Italian', por: 'Portuguese', rus: 'Russian', jpn: 'Japanese', kor: 'Korean',
  zho: 'Chinese', nld: 'Dutch', pol: 'Polish', swe: 'Swedish', tur: 'Turkish',
  msa: 'Malay', ind: 'Indonesian', tha: 'Thai', hin: 'Hindi', fas: 'Persian',
};

// OpenSubtitles.com REST API v1 — requires free API key
// https://opensubtitles.stoplight.io/docs/opensubtitles-api
async function fetchOSv1(params) {
  if (!OPENSUBTITLES_KEY) return [];
  try {
    const qs = new URLSearchParams(params).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(`https://api.opensubtitles.com/api/v1/subtitles?${qs}`, {
      headers: {
        'Api-Key': OPENSUBTITLES_KEY,
        'Content-Type': 'application/json',
        'User-Agent': OPENSUBTITLES_APP,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!r.ok) {
      console.warn(`[subtitles] OpenSubtitles.com ${r.status}:`, await r.text().catch(() => ''));
      return [];
    }
    const data = await r.json();
    return (data.data || []).map(s => {
      const attrs = s.attributes || {};
      const file = (attrs.files || [])[0] || {};
      const langCode = attrs.language || 'unknown';
      return {
        lang: langCode,
        langLabel: LANG_MAP[langCode] || langCode,
        release: attrs.release || attrs.feature_details?.title || '',
        hi: !!attrs.hearing_impaired,
        fileId: file.file_id,           // need download API call to get URL
        url: null,                       // resolved lazily in /api/sub-proxy
        rawUrl: `osv1:${file.file_id}`, // unique key for dedup
      };
    }).filter(s => s.fileId);
  } catch (e) {
    console.warn('[subtitles] fetchOSv1 error:', e.message);
    return [];
  }
}

// Stremio OpenSubtitles v3 addon — no key needed, used as fallback
async function fetchStremioSubs(type, imdbId, season, episode) {
  try {
    const subId = (type === 'series' && season && episode)
      ? `${imdbId}:${season}:${episode}` : imdbId;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(
      `https://opensubtitles-v3.strem.io/subtitles/${type}/${subId}.json`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.subtitles || []).map(s => ({
      lang: s.lang || 'unknown',
      langLabel: LANG_MAP[s.lang] || s.lang || 'Unknown',
      release: s.id || '',
      hi: false,
      fileId: null,
      url: `/api/sub-proxy?url=${encodeURIComponent(s.url)}`,
      rawUrl: s.url,
    }));
  } catch {
    return [];
  }
}

function dedupeSubtitles(subs) {
  const seen = new Set();
  return subs.filter(s => s.rawUrl && !seen.has(s.rawUrl) && seen.add(s.rawUrl));
}

// Resolve an OSv1 fileId to a download URL via /api/sub-download
async function resolveOSv1Download(fileId) {
  if (!OPENSUBTITLES_KEY) return null;
  try {
    const r = await fetch('https://api.opensubtitles.com/api/v1/download', {
      method: 'POST',
      headers: {
        'Api-Key': OPENSUBTITLES_KEY,
        'Content-Type': 'application/json',
        'User-Agent': OPENSUBTITLES_APP,
      },
      body: JSON.stringify({ file_id: fileId, sub_format: 'srt' }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.link || null;
  } catch {
    return null;
  }
}

// Auto-load subtitles by IMDb ID
app.get('/api/subtitles/:type/:imdbId', async (req, res) => {
  const { type, imdbId } = req.params;
  const season = req.query.s;
  const episode = req.query.e;

  const langParam = 'en,ar,ms,id,fr,es,de';

  // Try primary (OSv1) and fallback (Stremio) in parallel
  const params = { imdb_id: imdbId, languages: langParam, type: type === 'series' ? 'episode' : 'movie' };
  if (season) params.season_number = season;
  if (episode) params.episode_number = episode;

  const [osv1Subs, stremioSubs] = await Promise.all([
    fetchOSv1(params),
    fetchStremioSubs(type, imdbId, season, episode),
  ]);

  // For OSv1 results, build a /api/sub-proxy URL using the fileId
  const osv1WithUrls = osv1Subs.map(s => ({
    ...s,
    url: `/api/sub-proxy?fileid=${s.fileId}`,
    rawUrl: `osv1:${s.fileId}`,
  }));

  res.json(dedupeSubtitles([...osv1WithUrls, ...stremioSubs]));
});

// Manual subtitle search
app.get('/api/subtitles/search', async (req, res) => {
  const query = req.query.q || '';
  const imdbId = req.query.imdb_id || '';
  const lang = req.query.lang || 'en,ar,ms,id,fr,es,de';

  if (!query && !imdbId) return res.json([]);

  const seMatch = query.match(/s(\d+)\s*e(\d+)/i);
  const season = seMatch ? parseInt(seMatch[1]) : undefined;
  const episode = seMatch ? parseInt(seMatch[2]) : undefined;

  const params = { languages: lang };
  if (imdbId) params.imdb_id = imdbId;
  else params.query = query.replace(/s\d+e\d+/i, '').trim();
  if (season) params.season_number = season;
  if (episode) params.episode_number = episode;

  const osv1Subs = (await fetchOSv1(params)).map(s => ({
    ...s,
    url: `/api/sub-proxy?fileid=${s.fileId}`,
    rawUrl: `osv1:${s.fileId}`,
  }));

  // For search, also try Stremio if we have imdbId
  const stremioSubs = imdbId
    ? await fetchStremioSubs(imdbId.includes('tt') ? 'movie' : 'movie', imdbId, season, episode)
    : [];

  res.json(dedupeSubtitles([...osv1Subs, ...stremioSubs]).slice(0, 60));
});

// Subtitle file proxy — resolves OSv1 fileId to download URL, fetches SRT, converts to VTT
// Supports ?offset=N.N to shift all timestamps by N seconds (positive = delay, negative = advance)
app.get('/api/sub-proxy', async (req, res) => {
  try {
    let url = req.query.url || '';
    const fileId = req.query.fileid ? parseInt(req.query.fileid) : null;
    const offset = parseFloat(req.query.offset || '0') || 0;

    if (fileId) {
      url = await resolveOSv1Download(fileId);
      if (!url) return res.status(404).send('Could not resolve subtitle download URL');
    }

    if (!url) return res.status(400).send('Missing url or fileid');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const r = await fetch(url, { headers: { 'User-Agent': `${APP_NAME} v1` } });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const contentType = r.headers.get('content-type') || '';
    if (contentType.includes('zip') || url.toLowerCase().endsWith('.zip')) {
      return res.status(415).send('Zip archive not supported');
    }

    let text = await r.text();
    text = text.replace(/^\uFEFF/, '');

    // Convert SRT → VTT
    if (!text.trim().startsWith('WEBVTT')) {
      text = 'WEBVTT\n\n' + text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }

    // Apply timestamp offset if requested
    if (offset !== 0) {
      text = shiftVttTimestamps(text, offset);
    }

    // Offset responses are per-session, don't cache aggressively
    const cacheControl = offset !== 0 ? 'no-cache' : 'public, max-age=86400';
    res.set('Content-Type', 'text/vtt; charset=utf-8');
    res.set('Cache-Control', cacheControl);
    res.send(text);
  } catch (err) {
    res.status(500).send('Failed to fetch subtitle');
  }
});

// Shift all VTT timestamp pairs by `offsetSec` seconds
function shiftVttTimestamps(vtt, offsetSec) {
  // Matches: HH:MM:SS.mmm --> HH:MM:SS.mmm or MM:SS.mmm --> MM:SS.mmm
  return vtt.replace(
    /(\d{1,2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3})/g,
    (_, start, end) => `${shiftTs(start, offsetSec)} --> ${shiftTs(end, offsetSec)}`
  );
}

function shiftTs(ts, offsetSec) {
  // Parse HH:MM:SS.mmm
  const [time, ms] = ts.replace(',', '.').split('.');
  const parts = time.split(':').map(Number);
  let totalMs = (parts.length === 3
    ? parts[0] * 3600000 + parts[1] * 60000 + parts[2] * 1000
    : parts[0] * 60000 + parts[1] * 1000) + parseInt(ms || 0);
  totalMs = Math.max(0, totalMs + Math.round(offsetSec * 1000));
  const h = Math.floor(totalMs / 3600000); totalMs %= 3600000;
  const m = Math.floor(totalMs / 60000);   totalMs %= 60000;
  const s = Math.floor(totalMs / 1000);    totalMs %= 1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(totalMs).padStart(3,'0')}`;
}

// ─── Streams (from Stremio addons) ───────────────────────────────────

app.get('/api/streams/:type/:imdbId', async (req, res) => {
  const { type, imdbId } = req.params;
  const season = req.query.s;
  const episode = req.query.e;
  const runtime = parseInt(req.query.runtime) || (type === 'movie' ? 120 : 24);

  try {
    const streams = await getStreams(type, imdbId, season, episode);

    // Check which hashes are cached on TorBox
    const hashes = streams.filter((s) => s.infoHash).map((s) => s.infoHash);
    const cachedSet = hashes.length > 0 ? await checkCachedBatch(hashes) : new Set();

    // Tag streams
    const taggedStreams = streams
      .filter((s) => s.quality !== 'Unknown')
      .map((s) => ({
        ...s,
        cached: s.url ? true : (s.infoHash && cachedSet.has(s.infoHash.toLowerCase())),
      }));

    // Sort: cached first, then by quality, then by seeds
    const qualityOrder = { '4K': 0, '1080p': 1, '720p': 2, '480p': 3, CAM: 4, Unknown: 5 };
    taggedStreams.sort((a, b) => {
      if (a.cached && !b.cached) return -1;
      if (!a.cached && b.cached) return 1;
      const qDiff = (qualityOrder[a.quality] ?? 5) - (qualityOrder[b.quality] ?? 5);
      if (qDiff !== 0) return qDiff;
      return (b.seeds || 0) - (a.seeds || 0);
    });

    // Score streams for auto-selection
    let bestScore = -1;
    let bestIdx = -1;

    taggedStreams.forEach((s, i) => {
      if (!s.cached) return;
      let score = 0;

      // Browser compatibility (biggest factor)
      if (s.browserFriendly) score += 30;

      // Quality
      if (s.quality === '1080p') score += 20;
      else if (s.quality === '720p') score += 12;
      else if (s.quality === '4K') score += 8;
      else if (s.quality === '480p') score += 5;

      // Codec (H.264 works everywhere)
      if (s.codec === 'H.264' || s.codec === '') score += 15;
      else if (s.codec === 'HEVC') score += 5;
      else if (s.codec === 'AV1') score += 3;

      // Source (WEB-DL/WEBRip = browser-safe audio)
      if (/WEB-DL|WEBRip/.test(s.source)) score += 10;

      // Size sweet spot based on runtime
      const sizeMatch = (s.size || '').match(/([\d.]+)\s*(GB|MB)/i);
      if (sizeMatch) {
        const mb = sizeMatch[2].toUpperCase() === 'GB'
          ? parseFloat(sizeMatch[1]) * 1024
          : parseFloat(sizeMatch[1]);
        const idealMin = runtime * 8;   // ~8 MB/min
        const idealMax = runtime * 40;  // ~40 MB/min
        if (mb >= idealMin && mb <= idealMax) score += 20;
        else if (mb < idealMin * 0.5) score -= 10;
        else if (mb > idealMax * 2) score -= 5;
      }

      // Seeds (minor for cached)
      score += Math.min((s.seeds || 0) / 10, 5);

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });

    if (bestIdx >= 0) {
      taggedStreams[bestIdx].recommended = true;
      // Move recommended to the top
      const [rec] = taggedStreams.splice(bestIdx, 1);
      taggedStreams.unshift(rec);
    }

    res.json(taggedStreams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TorBox (resolve stream to playback URL) ─────────────────────────

app.post('/api/play', async (req, res) => {
  const { infoHash, fileIdx, url } = req.body;

  // If it's a direct URL stream, just return it
  if (url) return res.json({ playbackUrl: `/api/proxy?url=${encodeURIComponent(url)}` });

  if (!infoHash) return res.status(400).json({ error: 'Missing infoHash' });

  try {
    const torboxUrl = await resolveStream(infoHash, fileIdx || 0);
    // Return proxied URL so we bypass CORS
    res.json({ playbackUrl: `/api/proxy?url=${encodeURIComponent(torboxUrl)}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Video proxy — pipes TorBox stream through our server to bypass CORS
// Supports range requests for seeking
app.get('/api/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url');

  try {
    const headers = {};
    // Forward range header for seeking
    if (req.headers.range) headers.Range = req.headers.range;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);

    // Forward status and headers
    res.status(response.status);
    const contentType = response.headers.get('content-type');
    if (contentType) res.set('Content-Type', contentType);

    const contentLength = response.headers.get('content-length');
    if (contentLength) res.set('Content-Length', contentLength);

    const contentRange = response.headers.get('content-range');
    if (contentRange) res.set('Content-Range', contentRange);

    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) res.set('Accept-Ranges', acceptRanges);

    // Pipe the stream
    const reader = response.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); break; }
        if (!res.write(value)) {
          await new Promise((r) => res.once('drain', r));
        }
      }
    };
    pump().catch(() => res.end());

    req.on('close', () => { clearTimeout(timeout); controller.abort(); reader.cancel(); });
  } catch (err) {
    clearTimeout(timeout);
    res.status(500).send('Proxy error: ' + err.message);
  }
});

// ─── TorBox Library ──────────────────────────────────────────────────

app.get('/api/library', async (req, res) => {
  try {
    const torrents = await listTorrents();
    res.json(torrents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Online Users ────────────────────────────────────────────────────

const activeSessions = new Map(); // sessionId → lastSeen timestamp

app.post('/api/online/ping', (req, res) => {
  const sessionId = req.body.sessionId;
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });
  activeSessions.set(sessionId, Date.now());
  res.json({ count: activeSessions.size });
});

app.get('/api/online', (req, res) => {
  res.json({ count: activeSessions.size });
});

// Clean up sessions inactive for 90 seconds
setInterval(() => {
  const cutoff = Date.now() - 90000;
  for (const [id, ts] of activeSessions.entries()) {
    if (ts < cutoff) activeSessions.delete(id);
  }
}, 30000);

// ─── Watchlist & Continue Watching ──────────────────────────────────

const DATA_DIR = path.join(__dirname, 'data');
const WATCHLIST_FILE = path.join(DATA_DIR, 'watchlist.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');

function readJSON(file) {
  try { return JSON.parse(require('fs').readFileSync(file, 'utf-8')); }
  catch { return []; }
}
function writeJSON(file, data) {
  require('fs').mkdirSync(DATA_DIR, { recursive: true });
  require('fs').writeFileSync(file, JSON.stringify(data, null, 2));
}

// Watchlist
app.get('/api/watchlist', (req, res) => res.json(readJSON(WATCHLIST_FILE)));

app.post('/api/watchlist', (req, res) => {
  const item = req.body;
  if (!item?.id) return res.status(400).json({ error: 'Missing id' });
  const list = readJSON(WATCHLIST_FILE);
  const exists = list.findIndex(i => i.id === item.id);
  if (exists >= 0) {
    // Toggle off
    list.splice(exists, 1);
    writeJSON(WATCHLIST_FILE, list);
    return res.json({ added: false });
  }
  list.unshift({ ...item, addedAt: new Date().toISOString() });
  writeJSON(WATCHLIST_FILE, list);
  res.json({ added: true });
});

// Continue watching
app.get('/api/continue', (req, res) => {
  const list = readJSON(PROGRESS_FILE);

  // Deduplicate by base ID (strip :season:episode) — keep latest per show
  const seen = new Map();
  const deduped = [];
  for (const item of list) {
    const baseId = item.id.replace(/:\d+:\d+$/, '');
    if (!seen.has(baseId)) {
      seen.set(baseId, true);
      deduped.push(item);
    }
  }

  res.json(deduped);
});

app.post('/api/continue', (req, res) => {
  const { id, type, title, poster, backdrop, currentTime, duration } = req.body;
  if (!id || !currentTime || !duration) return res.status(400).json({ error: 'Missing fields' });

  const list = readJSON(PROGRESS_FILE);
  const idx = list.findIndex(i => i.id === id);
  const entry = { id, type, title, poster, backdrop, currentTime, duration,
    progress: currentTime / duration, updatedAt: new Date().toISOString() };

  if (idx >= 0) list.splice(idx, 1);
  list.unshift(entry);

  // Keep last 30 items
  writeJSON(PROGRESS_FILE, list.slice(0, 30));
  res.json({ ok: true });
});

app.delete('/api/continue/:id', (req, res) => {
  const list = readJSON(PROGRESS_FILE).filter(i => i.id !== req.params.id);
  writeJSON(PROGRESS_FILE, list);
  res.json({ ok: true });
});

// ─── SPA fallback ────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ───────────────────────────────────────────────────────────

app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`\n🎬 ${APP_NAME} running at http://localhost:${PORT}`);
  console.log(`   Catalog source: ${CATALOG_URL}`);
  console.log(`   TorBox: ${process.env.TORBOX_API_KEY ? '✅ configured' : '❌ missing'}`);
  console.log(`   TMDB:   ${process.env.TMDB_API_KEY ? '✅ configured' : '❌ missing'}`);
});
