/**
 * One-time setup: Parse your Netflix viewing history and generate a viewer profile.
 *
 * Usage:
 *   node setup.js path/to/NetflixViewingHistory.csv
 *
 * This creates data/profile.json which is used daily for catalog generation.
 */

require('dotenv').config();
const path = require('path');
const { parseNetflixHistory } = require('./src/netflix');
const { generateProfile } = require('./src/gemini');
const store = require('./src/store');

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node setup.js <path-to-netflix-csv>');
    console.error('  Download from: https://www.netflix.com/account/getmyinfo');
    process.exit(1);
  }

  console.log('📄 Parsing Netflix history...');
  const history = parseNetflixHistory(path.resolve(csvPath));
  console.log(`   Found ${history.totalWatched} watch events, ${history.uniqueTitles} unique titles`);
  console.log(`   Top 5: ${history.topTitles.slice(0, 5).map((t) => t.title).join(', ')}`);

  console.log('\n🤖 Generating viewer profile with Gemini...');
  const profile = await generateProfile(history);

  // Attach raw title list for potential future use
  profile._titles = history.allTitles;
  profile._generatedAt = new Date().toISOString();

  store.saveProfile(profile);
  console.log('\n✅ Profile saved to data/profile.json');
  console.log('\nYour profile:');
  console.log(`   Genres:    ${profile.favoriteGenres?.join(', ')}`);
  console.log(`   Themes:    ${profile.favoriteThemes?.join(', ')}`);
  console.log(`   Moods:     ${profile.preferredMoods?.join(', ')}`);
  console.log(`   Languages: ${profile.preferredLanguages?.join(', ')}`);
  console.log(`   Viewer:    ${profile.personalityNotes}`);

  console.log('\nNext step: run `npm start` to launch the addon server.');
  console.log('The first catalog refresh happens automatically on startup.');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
