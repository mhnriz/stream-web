// TMDB genre ID mappings — provided to Gemini so it can specify exact genres

const MOVIE_GENRES = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

const SERIES_GENRES = {
  10759: 'Action & Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  10762: 'Kids',
  9648: 'Mystery',
  10765: 'Sci-Fi & Fantasy',
  10768: 'War & Politics',
  37: 'Western',
};

const SORT_OPTIONS = [
  'popularity.desc',
  'vote_average.desc',
  'primary_release_date.desc',
  'revenue.desc',
  'vote_count.desc',
];

const LANGUAGE_CODES = {
  English: 'en', Hindi: 'hi', Korean: 'ko', Japanese: 'ja',
  Spanish: 'es', French: 'fr', German: 'de', Italian: 'it',
  Portuguese: 'pt', Chinese: 'zh', Thai: 'th', Turkish: 'tr',
  Arabic: 'ar', Russian: 'ru', Malay: 'ms', Tamil: 'ta',
  Telugu: 'te', Indonesian: 'id',
};

module.exports = { MOVIE_GENRES, SERIES_GENRES, SORT_OPTIONS, LANGUAGE_CODES };
