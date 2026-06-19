const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

async function tmdbFetch(endpoint, params = {}) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${endpoint}: ${res.status}`);
  return res.json();
}

/**
 * Get full metadata for a movie or series.
 * Accepts IMDb IDs (tt1234567) or TMDB IDs (tmdb:12345).
 */
async function getMeta(type, id) {
  let isMovie = type === 'movie';
  let tmdbId;
  let imdbId = null;

  if (id.startsWith('tmdb:')) {
    tmdbId = parseInt(id.replace('tmdb:', ''));
  } else {
    imdbId = id;
    const findData = await tmdbFetch(`/find/${imdbId}`, { external_source: 'imdb_id' });
    let results = isMovie ? findData.movie_results : findData.tv_results;

    // Fallback: if no results, try the other type
    if (!results || results.length === 0) {
      isMovie = !isMovie;
      results = isMovie ? findData.movie_results : findData.tv_results;
    }
    if (!results || results.length === 0) return null;
    tmdbId = results[0].id;
  }

  const actualType = isMovie ? 'movie' : 'series';

  // Get detailed info
  const details = await tmdbFetch(
    isMovie ? `/movie/${tmdbId}` : `/tv/${tmdbId}`,
    { append_to_response: 'credits,videos,similar,external_ids,release_dates,content_ratings' }
  );

  // Resolve IMDb ID if we don't have it
  if (!imdbId) {
    imdbId = details.imdb_id || details.external_ids?.imdb_id || `tmdb:${tmdbId}`;
  }

  // Content rating — US certification (PG-13, TV-MA, etc.)
  let contentRating = null;
  if (isMovie) {
    // Movies: release_dates.results → find US → certifications
    const usRelease = (details.release_dates?.results || []).find(r => r.iso_3166_1 === 'US');
    contentRating = (usRelease?.release_dates || []).find(d => d.certification)?.certification || null;
  } else {
    // Series: content_ratings.results → find US
    const usRating = (details.content_ratings?.results || []).find(r => r.iso_3166_1 === 'US');
    contentRating = usRating?.rating || null;
  }

  return {
    id: imdbId,
    tmdbId,
    type: actualType,
    title: details.title || details.name,
    tagline: details.tagline || '',
    overview: details.overview || '',
    poster: details.poster_path ? `${IMG_BASE}/w500${details.poster_path}` : null,
    backdrop: details.backdrop_path ? `${IMG_BASE}/original${details.backdrop_path}` : null,
    releaseDate: details.release_date || details.first_air_date || '',
    year: (details.release_date || details.first_air_date || '').split('-')[0],
    rating: details.vote_average ? details.vote_average.toFixed(1) : null,
    contentRating,
    runtime: details.runtime || (details.episode_run_time?.[0]) || null,
    genres: (details.genres || []).map((g) => g.name),
    cast: (details.credits?.cast || []).slice(0, 10).map((c) => ({
      name: c.name,
      character: c.character,
      photo: c.profile_path ? `${IMG_BASE}/w185${c.profile_path}` : null,
    })),
    director: (details.credits?.crew || []).find((c) => c.job === 'Director')?.name || null,
    trailer: (details.videos?.results || []).find(
      (v) => v.type === 'Trailer' && v.site === 'YouTube'
    )?.key || null,
    similar: (details.similar?.results || []).slice(0, 10).map((s) => ({
      tmdbId: s.id,
      title: s.title || s.name,
      poster: s.poster_path ? `${IMG_BASE}/w300${s.poster_path}` : null,
      year: (s.release_date || s.first_air_date || '').split('-')[0],
      rating: s.vote_average?.toFixed(1),
    })),
    // Series-specific
    seasons: details.seasons
      ? details.seasons
          .filter((s) => s.season_number > 0)
          .map((s) => ({
            number: s.season_number,
            name: s.name,
            episodes: s.episode_count,
            poster: s.poster_path ? `${IMG_BASE}/w300${s.poster_path}` : null,
          }))
      : null,
    totalSeasons: details.number_of_seasons || null,
  };
}

/**
 * Get episodes for a specific season.
 */
async function getSeasonEpisodes(tmdbId, seasonNumber) {
  const data = await tmdbFetch(`/tv/${tmdbId}/season/${seasonNumber}`);
  return (data.episodes || []).map((ep) => ({
    number: ep.episode_number,
    name: ep.name,
    overview: ep.overview,
    still: ep.still_path ? `${IMG_BASE}/w400${ep.still_path}` : null,
    airDate: ep.air_date,
    runtime: ep.runtime,
    rating: ep.vote_average?.toFixed(1),
  }));
}

/**
 * Search TMDB for movies and series.
 */
async function search(query) {
  const data = await tmdbFetch('/search/multi', {
    query,
    include_adult: false,
    page: 1,
  });

  return (data.results || [])
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, 20)
    .map((r) => ({
      tmdbId: r.id,
      type: r.media_type === 'tv' ? 'series' : 'movie',
      title: r.title || r.name,
      poster: r.poster_path ? `${IMG_BASE}/w300${r.poster_path}` : null,
      backdrop: r.backdrop_path ? `${IMG_BASE}/w780${r.backdrop_path}` : null,
      year: (r.release_date || r.first_air_date || '').split('-')[0],
      rating: r.vote_average?.toFixed(1),
      overview: r.overview,
    }));
}

module.exports = { getMeta, getSeasonEpisodes, search };
