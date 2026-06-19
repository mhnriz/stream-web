const { GoogleGenerativeAI } = require('@google/generative-ai');
const { MOVIE_GENRES, SERIES_GENRES, SORT_OPTIONS, LANGUAGE_CODES } = require('./constants');

let genai = null;

function getModel() {
  if (!genai) genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genai.getGenerativeModel({ model: 'gemini-3.5-flash' });
}

/**
 * One-time: Analyze Netflix history and generate a viewer profile.
 * This profile is reused daily for catalog generation.
 */
async function generateProfile(netflixData) {
  const model = getModel();

  const prompt = `You are analyzing a user's Netflix viewing history to build a viewer taste profile.

Here are their most-watched titles (sorted by watch frequency):
${netflixData.topTitles.map((t) => `- "${t.title}" (watched ${t.watchCount}x, ${t.isSeries ? 'series' : 'movie'})`).join('\n')}

Total items watched: ${netflixData.totalWatched}
Unique titles: ${netflixData.uniqueTitles}

Analyze their viewing patterns and respond with ONLY valid JSON (no markdown, no backticks):
{
  "favoriteGenres": ["genre1", "genre2", ...],
  "favoriteThemes": ["theme1", "theme2", ...],
  "preferredMoods": ["mood1", "mood2", ...],
  "preferredLanguages": ["English", ...],
  "preferredEras": ["2020s", "2010s", ...],
  "watchingPatterns": "brief description of their viewing habits",
  "personalityNotes": "brief description of what kind of viewer they are",
  "avoidGenres": ["genres they seem to avoid"],
  "topRecommendationDirections": [
    "direction1 for future recommendations",
    "direction2",
    "direction3"
  ]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

/**
 * Daily: Generate catalog definitions based on viewer profile.
 * Returns catalog metadata + TMDB discover parameters.
 */
async function generateDailyCatalogs(profile, catalogCount = 20) {
  const model = getModel();

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });

  const genreList = Object.entries(MOVIE_GENRES)
    .map(([id, name]) => `${id}: ${name}`)
    .join(', ');

  const sortList = SORT_OPTIONS.join(', ');
  const langList = Object.entries(LANGUAGE_CODES)
    .map(([name, code]) => `${code}: ${name}`)
    .join(', ');

  const prompt = `You are Netflix's catalog curator AI. Generate ${catalogCount} creative, dynamic catalog rows for a Stremio addon.

TODAY: ${dateStr} (${dayOfWeek})
Use today's date as a creative seed — vary the catalogs each day. Be creative and unpredictable.

VIEWER PROFILE:
${JSON.stringify(profile, null, 2)}

AVAILABLE TMDB GENRE IDS (movies):
${genreList}

AVAILABLE TMDB GENRE IDS (series/TV):
${Object.entries(SERIES_GENRES).map(([id, name]) => `${id}: ${name}`).join(', ')}

SORT OPTIONS: ${sortList}
NAMING RULES (CRITICAL — follow exactly):
Study these REAL Netflix row titles and match their style:
  "Your Next Watch", "Exciting Western Family Sci-Fi", "Crowd Pleasers",
  "Watch-Party Picks to Get the Crew Talking", "POV: Your Crush Asks You to Pick a Movie",
  "What We Were Like in the '90s", "Boredom Busters", "Imaginative Movies",
  "Visually-Striking Family Sci-Fi", "Adventures with a Fantasy Twist",
  "Blockbuster US Action Sci-Fi & Fantasy", "US Family Adventure Movies",
  "US Action Sci-Fi & Fantasy Based on Comics", "Top Picks for You"

- NEVER use "Title: Subtitle" colon format. WRONG: "Epic Fantasy: Movies to Get Lost In". RIGHT: "Epic Fantasy Movies to Get Lost In"
  (Exception: "POV:" or "TFW" style intros are fine)
- NEVER put "(Series)" or "(Movies)" or "(Anime)" in parentheses at the end
- Most names should be 2-6 words. Some can be longer and playful.
- Don't over-explain — "Crowd Pleasers" is better than "Crowd-Pleasing Movies Everyone Loves"

CATALOG RULES:
1. Mix personalized (based on profile) with discovery (stretch their taste)
2. Vary specificity — some narrow ("Korean Revenge Thrillers"), some broad ("Trending Now")
3. Include 5-8 trending/popular catalogs that aren't profile-dependent
4. Each catalog MUST have different TMDB parameters — vary genre combos, sort orders, decades, languages, and vote thresholds to ensure every row feels distinct
5. For type, use "movie", "series", or "mixed" (mixed = both movies and series in one row)
   - Use "mixed" for broad catalogs like "Your Next Watch", "Crowd Pleasers", "Trending Now"
   - Use "movie" or "series" for specific ones like "US Family Adventure Movies"
   - Aim for roughly: 20 movie, 20 series, 10 mixed
6. For "mixed" type, provide BOTH movie_genres AND series_genres in tmdb params

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "catalogs": [
    {
      "name": "Catalog Name Here",
      "type": "movie",
      "tmdb": {
        "with_genres": "28,878",
        "sort_by": "popularity.desc",
        "vote_average_gte": 6.0,
        "vote_count_gte": 100,
        "with_original_language": "en",
        "primary_release_year_gte": null,
        "primary_release_year_lte": null
      }
    },
    {
      "name": "Mixed Catalog Name",
      "type": "mixed",
      "tmdb": {
        "movie_genres": "28,12",
        "series_genres": "10759",
        "sort_by": "popularity.desc",
        "vote_average_gte": 6.0,
        "vote_count_gte": 50,
        "with_original_language": "en"
      }
    }
  ]
}

CRITICAL RULES FOR TMDB PARAMS:
- with_original_language: MUST be a SINGLE language code ("en", "ja", "ko", etc). NEVER comma-separated.
- For mixed type: use movie_genres for movies, series_genres for TV shows
- All genre IDs should be comma-separated within their field (with_genres, movie_genres, series_genres)

Generate exactly ${catalogCount} catalogs.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(text);

  // Assign stable IDs to each catalog
  return parsed.catalogs.map((cat, i) => ({
    id: `dynamic-${i}`,
    name: cat.name,
    type: cat.type || 'movie',
    description: cat.description || '',
    tmdb: cat.tmdb,
  }));
}

module.exports = { generateProfile, generateDailyCatalogs };
