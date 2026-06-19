/**
 * Refresh catalogs: generates new catalog definitions via Gemini,
 * then populates each with movies/series from TMDB.
 *
 * Can be run standalone: node refresh.js
 * Also called by the server's daily cron and /refresh endpoint.
 */

require('dotenv').config();
const { generateDailyCatalogs } = require('./src/gemini');
const { populateCatalog } = require('./src/tmdb');
const store = require('./src/store');

async function refreshCatalogs({ force = false } = {}) {
  const today = new Date().toISOString().split('T')[0];

  // Skip if already refreshed today (unless forced)
  if (!force && store.getLastRefresh() === today) {
    console.log(`⏭️  Already refreshed today (${today}). Use force=true to override.`);
    return store.loadCatalogs();
  }

  const profile = store.loadProfile();
  if (!profile) {
    throw new Error('No profile found. Run `node setup.js <netflix-csv>` first.');
  }

  const catalogCount = parseInt(process.env.CATALOG_COUNT || '50', 10);
  const moviesPerCatalog = parseInt(process.env.MOVIES_PER_CATALOG || '20', 10);

  console.log(`\n🎬 Generating ${catalogCount} catalogs for ${today}...`);

  // Step 1: Gemini generates catalog definitions
  console.log('🤖 Asking Gemini for catalog ideas...');
  const catalogDefs = await generateDailyCatalogs(profile, catalogCount);
  console.log(`   Got ${catalogDefs.length} catalog definitions`);

  // Step 2: Populate each catalog with TMDB content
  const catalogs = [];
  for (const def of catalogDefs) {
    console.log(`📽️  Populating: "${def.name}" (${def.type})...`);
    try {
      const metas = await populateCatalog(def, moviesPerCatalog);
      catalogs.push({
        ...def,
        metas,
        _populatedAt: new Date().toISOString(),
      });
      console.log(`   → ${metas.length} items`);
    } catch (err) {
      console.error(`   ⚠️  Failed: ${err.message}`);
      // Still add the catalog with empty metas so it shows up
      catalogs.push({ ...def, metas: [] });
    }
  }

  // Save
  const data = {
    date: today,
    generatedAt: new Date().toISOString(),
    catalogs,
  };
  store.saveCatalogs(data);
  store.setLastRefresh(today);

  const totalMovies = catalogs.reduce((sum, c) => sum + c.metas.length, 0);
  console.log(`\n✅ Saved ${catalogs.length} catalogs with ${totalMovies} total items`);

  return data;
}

// Run directly
if (require.main === module) {
  refreshCatalogs({ force: true }).catch((err) => {
    console.error('Refresh failed:', err.message);
    process.exit(1);
  });
}

module.exports = { refreshCatalogs };
