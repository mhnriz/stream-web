const fs = require('fs');
const { parse } = require('csv-parse/sync');

/**
 * Parse Netflix viewing history CSV.
 * Netflix exports have columns: Title, Date
 * Title format varies: "Movie Name" or "Series: Season X: Episode Title"
 */
function parseNetflixHistory(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const titles = new Map(); // deduplicate, track watch count

  for (const row of records) {
    const rawTitle = row.Title || row.title || '';
    if (!rawTitle) continue;

    // Extract the main title (before ":" for series)
    // "Breaking Bad: Season 1: Pilot" → "Breaking Bad"
    // "Inception" → "Inception"
    const mainTitle = rawTitle.split(':')[0].trim();

    if (titles.has(mainTitle)) {
      titles.get(mainTitle).count++;
    } else {
      titles.set(mainTitle, {
        title: mainTitle,
        fullTitle: rawTitle,
        count: 1,
        date: row.Date || row.date || '',
        isSeries: rawTitle.includes(':'),
      });
    }
  }

  const entries = [...titles.values()];

  // Sort by watch count (most watched first) for the profile
  entries.sort((a, b) => b.count - a.count);

  return {
    totalWatched: records.length,
    uniqueTitles: entries.length,
    // Send top 200 titles to Gemini for profile (enough for good analysis, keeps tokens low)
    topTitles: entries.slice(0, 200).map((e) => ({
      title: e.title,
      watchCount: e.count,
      isSeries: e.isSeries,
    })),
    // All titles for reference
    allTitles: entries.map((e) => e.title),
  };
}

module.exports = { parseNetflixHistory };
