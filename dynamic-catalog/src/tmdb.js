const TMDB_BASE = 'https://api.themoviedb.org/3';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tmdbFetch(endpoint, params = {}) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (res.status === 429) {
    // Rate limited — wait and retry
    await sleep(2000);
    return tmdbFetch(endpoint, params);
  }
  if (!res.ok) throw new Error(`TMDB ${endpoint}: ${res.status}`);
  return res.json();
}

/**
 * Search TMDB and return similar titles.
 */
async function searchContent(query, limit = 20) {
  // Search for the query
  const searchData = await tmdbFetch('/search/multi', {
    query,
    page: 1,
    include_adult: false,
  });

  const results = searchData.results || [];
  if (results.length === 0) return [];

  // Get the top result
  const topResult = results.find((r) => r.media_type === 'movie' || r.media_type === 'tv');
  if (!topResult) return [];

  const contentType = topResult.media_type === 'tv' ? 'series' : 'movie';
  const resultId = topResult.id;

  // Fetch similar titles
  const endpoint = contentType === 'series' ? `/tv/${resultId}/similar` : `/movie/${resultId}/similar`;
  const similarData = await tmdbFetch(endpoint, { page: 1 });

  const similarResults = (similarData.results || []).slice(0, limit - 1);

  // Combine: top result + similar
  return [topResult, ...similarResults];
}

/**
 * Discover movies/series using TMDB parameters from Gemini.
 */
async function discoverContent(catalogDef, perPage = 20) {
  const isMovie = catalogDef.type === 'movie';
  const endpoint = isMovie ? '/discover/movie' : '/discover/tv';
  const tmdb = catalogDef.tmdb || {};

  const params = {
    sort_by: tmdb.sort_by || 'popularity.desc',
    page: 1,
    'vote_count.gte': tmdb.vote_count_gte || 50,
    include_adult: false,
  };

  // Handle genres: use movie_genres for movies, series_genres for series, fall back to with_genres
  let genres = null;
  if (isMovie && tmdb.movie_genres) genres = tmdb.movie_genres;
  else if (!isMovie && tmdb.series_genres) genres = tmdb.series_genres;
  else if (tmdb.with_genres) genres = tmdb.with_genres;

  if (genres) params.with_genres = genres;
  if (tmdb.without_genres) params.without_genres = tmdb.without_genres;

  // Language: TMDB only accepts single codes, not comma-separated
  if (tmdb.with_original_language) {
    const langs = tmdb.with_original_language.split(',').map((l) => l.trim());
    params.with_original_language = langs[0]; // Use first language only
  }

  if (tmdb.vote_average_gte) params['vote_average.gte'] = tmdb.vote_average_gte;

  if (isMovie) {
    if (tmdb.primary_release_year_gte)
      params['primary_release_date.gte'] = `${tmdb.primary_release_year_gte}-01-01`;
    if (tmdb.primary_release_year_lte)
      params['primary_release_date.lte'] = `${tmdb.primary_release_year_lte}-12-31`;
  } else {
    if (tmdb.primary_release_year_gte)
      params['first_air_date.gte'] = `${tmdb.primary_release_year_gte}-01-01`;
    if (tmdb.primary_release_year_lte)
      params['first_air_date.lte'] = `${tmdb.primary_release_year_lte}-12-31`;
  }

  const data = await tmdbFetch(endpoint, params);
  return (data.results || []).slice(0, perPage);
}

/**
 * Get external IDs (including IMDb) for a TMDB movie/series.
 */
async function getExternalIds(tmdbId, type = 'movie') {
  const endpoint = type === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
  try {
    const data = await tmdbFetch(endpoint, { append_to_response: 'external_ids' });
    return {
      imdbId: data.imdb_id || data.external_ids?.imdb_id || null,
      title: data.title || data.name || '',
      overview: data.overview || '',
      posterPath: data.poster_path,
      releaseDate: data.release_date || data.first_air_date || '',
      voteAverage: data.vote_average,
      genres: (data.genres || []).map((g) => g.name),
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a list of TMDB results to Stremio metas with IMDb IDs.
 */
async function resolveToMetas(results, contentType) {
  const metas = [];
  for (const item of results) {
    const details = await getExternalIds(item.id, contentType);
    if (!details || !details.imdbId) continue;

    metas.push({
      id: details.imdbId,
      type: contentType === 'series' ? 'series' : 'movie',
      name: details.title,
      poster: details.posterPath
        ? `https://image.tmdb.org/t/p/w500${details.posterPath}`
        : null,
      posterShape: 'regular',
      description: details.overview,
      releaseInfo: details.releaseDate ? details.releaseDate.split('-')[0] : '',
      imdbRating: details.voteAverage ? details.voteAverage.toFixed(1) : undefined,
      genres: details.genres,
    });

    // Small delay to stay under TMDB rate limits (40 req / 10 sec)
    await sleep(260);
  }
  return metas;
}

/**
 * Full pipeline: discover content and resolve to Stremio metas.
 * Supports "mixed" type — fetches both movies and series, interleaved.
 */
async function populateCatalog(catalogDef, moviesPerCatalog = 20) {
  if (catalogDef.type === 'mixed') {
    // Fetch both movies and series, split the count
    const half = Math.ceil(moviesPerCatalog / 2);

    const movieDef = { ...catalogDef, type: 'movie' };
    const seriesDef = {
      ...catalogDef,
      type: 'series',
      tmdb: {
        ...catalogDef.tmdb,
        // Use series_genres if provided, otherwise fall back to with_genres
        with_genres: catalogDef.tmdb.series_genres || catalogDef.tmdb.with_genres,
      },
    };

    const [movieResults, seriesResults] = await Promise.all([
      discoverContent(movieDef, half),
      discoverContent(seriesDef, half),
    ]);

    const [movieMetas, seriesMetas] = await Promise.all([
      resolveToMetas(movieResults, 'movie'),
      resolveToMetas(seriesResults, 'series'),
    ]);

    // Interleave: movie, series, movie, series...
    const metas = [];
    const maxLen = Math.max(movieMetas.length, seriesMetas.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < movieMetas.length) metas.push(movieMetas[i]);
      if (i < seriesMetas.length) metas.push(seriesMetas[i]);
    }
    return metas.slice(0, moviesPerCatalog);
  }

  // Single type (movie or series)
  const results = await discoverContent(catalogDef, moviesPerCatalog);
  return resolveToMetas(results, catalogDef.type);
}

module.exports = { searchContent, discoverContent, getExternalIds, populateCatalog, resolveToMetas };
