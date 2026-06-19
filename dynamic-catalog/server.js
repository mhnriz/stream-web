require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const store = require('./src/store');
const { refreshCatalogs } = require('./refresh');
const { searchContent, resolveToMetas } = require('./src/tmdb');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 7000;
const HOST = process.env.HOST || '0.0.0.0';

// ─── Stremio Addon Protocol ─────────────────────────────────────────

/**
 * Build the manifest dynamically from today's catalogs.
 * Stremio fetches this on each session, so catalog names update daily.
 */
function buildManifest() {
  const data = store.loadCatalogs();
  const catalogs = data?.catalogs || [];

  // Generate version from timestamp so Stremio refetches when catalogs update
  const timestamp = data?.generatedAt ? new Date(data.generatedAt).getTime() : 0;
  const version = `1.0.${timestamp}`;

  return {
    id: 'community.dynamic-catalog',
    version,
    name: 'Dynamic Catalog',
    description: 'AI-powered daily Netflix-style catalogs personalized to your taste',
    logo: 'https://img.icons8.com/color/512/popcorn-time.png',
    resources: ['catalog', 'search'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: catalogs.map((cat) => ({
      type: cat.type === 'series' ? 'series' : 'movie', // mixed registers as movie
      id: cat.id,
      name: cat.name,
      extra: [{ name: 'skip', isRequired: false }],
    })),
    behaviorHints: {
      configurable: false,
      configurationRequired: false,
    },
  };
}

// Manifest endpoint (Stremio fetches this to discover the addon)
app.get('/manifest.json', (req, res) => {
  res.json(buildManifest());
});

// Catalog endpoint (Stremio fetches content for each catalog row)
app.get('/catalog/:type/:id.json', (req, res) => {
  const { type, id } = req.params;
  const skip = parseInt(req.query.skip || '0', 10);

  const data = store.loadCatalogs();
  if (!data) return res.json({ metas: [] });

  // Handle ID with extra params: "dynamic-0.json" or "dynamic-0/skip=20.json"
  const cleanId = id.replace('.json', '').split('/')[0];

  const catalog = data.catalogs.find((c) => c.id === cleanId);
  if (!catalog) return res.json({ metas: [] });

  // Mixed catalogs return all content; typed catalogs filter by type
  const metas = (catalog.metas || [])
    .filter((m) => catalog.type === 'mixed' || m.type === type || !m.type)
    .slice(skip, skip + 20);

  res.json({ metas });
});

// Also support the /catalog/:type/:id/:extra.json format
app.get('/catalog/:type/:id/:extra.json', (req, res) => {
  const { type, id, extra } = req.params;
  const skipMatch = extra.match(/skip=(\d+)/);
  const skip = skipMatch ? parseInt(skipMatch[1], 10) : 0;

  const data = store.loadCatalogs();
  if (!data) return res.json({ metas: [] });

  const catalog = data.catalogs.find((c) => c.id === id);
  if (!catalog) return res.json({ metas: [] });

  const metas = (catalog.metas || [])
    .filter((m) => catalog.type === 'mixed' || m.type === type || !m.type)
    .slice(skip, skip + 20);

  res.json({ metas });
});

// Search endpoint (like Netflix: search query + similar titles)
app.get('/search/:query.json', async (req, res) => {
  const { query } = req.params;
  if (!query || query.length < 2) return res.json({ metas: [] });

  try {
    const results = await searchContent(query, 20);
    const metas = await resolveToMetas(results, 'movie'); // Search returns mixed types, resolve as-is

    res.json({ metas });
  } catch (err) {
    console.error('Search error:', err.message);
    res.json({ metas: [] });
  }
});

// ─── Management Endpoints ────────────────────────────────────────────

// Manual refresh trigger
app.post('/refresh', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const data = await refreshCatalogs({ force });
    res.json({
      ok: true,
      date: data.date,
      catalogCount: data.catalogs.length,
      totalItems: data.catalogs.reduce((s, c) => s + c.metas.length, 0),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Status / health check
app.get('/status', (req, res) => {
  const data = store.loadCatalogs();
  res.json({
    ok: true,
    lastRefresh: store.getLastRefresh(),
    catalogCount: data?.catalogs?.length || 0,
    catalogs: (data?.catalogs || []).map((c) => ({
      name: c.name,
      type: c.type,
      items: c.metas?.length || 0,
    })),
  });
});

// ─── Cron Schedule ───────────────────────────────────────────────────

const hour = process.env.REFRESH_HOUR || '4';
const minute = process.env.REFRESH_MINUTE || '0';
cron.schedule(`${minute} ${hour} * * *`, async () => {
  console.log(`\n⏰ Daily refresh triggered at ${new Date().toISOString()}`);
  try {
    await refreshCatalogs();
  } catch (err) {
    console.error('Cron refresh failed:', err.message);
  }
});

// ─── Startup ─────────────────────────────────────────────────────────

async function start() {
  // Refresh catalogs on startup if none exist or they're stale
  const existing = store.loadCatalogs();
  const today = new Date().toISOString().split('T')[0];

  if (!existing || store.getLastRefresh() !== today) {
    const profile = store.loadProfile();
    if (profile) {
      console.log('🔄 Refreshing catalogs on startup...');
      try {
        await refreshCatalogs();
      } catch (err) {
        console.error('Startup refresh failed:', err.message);
        if (!existing) {
          console.error('No cached catalogs available. Run setup.js first.');
        }
      }
    } else {
      console.warn('⚠️  No profile found. Run: node setup.js <netflix-csv>');
    }
  }

  app.listen(PORT, HOST, () => {
    const data = store.loadCatalogs();
    const count = data?.catalogs?.length || 0;
    console.log(`\n🎬 Dynamic Catalog addon running at http://${HOST}:${PORT}`);
    console.log(`   Manifest:  http://${HOST}:${PORT}/manifest.json`);
    console.log(`   Status:    http://${HOST}:${PORT}/status`);
    console.log(`   Catalogs:  ${count} active`);
    console.log(`   Refresh:   daily at ${hour}:${minute.padStart(2, '0')}`);
    console.log(`\n📱 Add to Stremio: ${process.env.PUBLIC_URL || `http://localhost:${PORT}`}/manifest.json`);
  });
}

start();
