/**
 * Query Stremio addons (Torrentio, Comet, MediaFusion, etc.) for stream sources.
 *
 * Stremio addons expose: GET /stream/{type}/{id}.json
 * For series: GET /stream/series/{imdbId}:{season}:{episode}.json
 *
 * Returns stream objects with infoHash, title, quality info.
 */

// Configured addon sources
function getAddonUrls() {
  const addons = [];

  if (process.env.TORRENTIO_URL) {
    addons.push({ name: 'Torrentio', url: process.env.TORRENTIO_URL });
  }
  if (process.env.COMET_URL) {
    addons.push({ name: 'Comet', url: process.env.COMET_URL });
  }
  if (process.env.MEDIAFUSION_URL) {
    addons.push({ name: 'MediaFusion', url: process.env.MEDIAFUSION_URL });
  }

  // Default to Torrentio if nothing configured
  if (addons.length === 0) {
    addons.push({ name: 'Torrentio', url: 'https://torrentio.strem.fun' });
  }

  return addons;
}

/**
 * Parse stream title into structured quality info.
 * Torrentio titles look like: "Torrentio\n4K\nMovie.Name.2024.2160p.BluRay.x265"
 */
function parseStreamTitle(stream) {
  const title = stream.title || '';
  const name = stream.name || '';

  // Extract quality
  let quality = 'Unknown';
  if (/2160p|4k|uhd/i.test(title)) quality = '4K';
  else if (/1080p/i.test(title)) quality = '1080p';
  else if (/720p/i.test(title)) quality = '720p';
  else if (/480p/i.test(title)) quality = '480p';
  else if (/cam|ts|hdts/i.test(title)) quality = 'CAM';

  // Extract source
  let source = '';
  if (/bluray|bdremux|bdrip/i.test(title)) source = 'BluRay';
  else if (/web-?dl|webdl/i.test(title)) source = 'WEB-DL';
  else if (/web-?rip|webrip/i.test(title)) source = 'WEBRip';
  else if (/hdtv/i.test(title)) source = 'HDTV';
  else if (/dvdrip/i.test(title)) source = 'DVDRip';

  // Extract codec
  let codec = '';
  if (/x265|h\.?265|hevc/i.test(title)) codec = 'HEVC';
  else if (/x264|h\.?264|avc/i.test(title)) codec = 'H.264';
  else if (/av1/i.test(title)) codec = 'AV1';

  // Browser compatibility check — both audio AND video codec
  // Audio: DTS and TrueHD are unsupported, everything else (AC3, EAC3, AAC) works
  const hasDTSOrTrueHD = /\bdts[-\s]?hd\b|\bdts[-\s]?x\b|\bdts\b|truehd/i.test(title);
  const hasCompatibleAudioFallback = /aac|ac3|eac3|dd[+p]|opus|flac/i.test(title);
  const audioOk = !hasDTSOrTrueHD || hasCompatibleAudioFallback;

  // Video: H.264 is universal; HEVC only works in Safari/Edge; AV1 is growing but patchy
  const hasHEVC = /x265|h\.?265|hevc/i.test(title);
  const hasAV1 = /\bav1\b/i.test(title);
  const videoOk = !hasHEVC && !hasAV1;

  const browserFriendly = audioOk && videoOk;

  // Extract size
  const sizeMatch = title.match(/(\d+\.?\d*)\s*(GB|MB)/i);
  const size = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : '';

  // Extract seeds
  const seedMatch = title.match(/👤\s*(\d+)/);
  const seeds = seedMatch ? parseInt(seedMatch[1]) : null;

  // Extract tracker — handles both ⚙ (U+2699) and ⚙️ (U+2699+FE0F)
  let tracker = 'Unknown';
  const gearIdx = title.indexOf('\u2699'); // ⚙ base character
  if (gearIdx !== -1) {
    // Skip past ⚙ and optional variation selector FE0F
    let after = title.slice(gearIdx + 1);
    if (after.charCodeAt(0) === 0xFE0F) after = after.slice(1);
    tracker = after.trim().split(/[\s\/]/)[0].trim() || 'Unknown';
  } else if (name) {
    tracker = name.split('\n')[0].trim() || 'Unknown';
  }

  return {
    infoHash: stream.infoHash,
    fileIdx: stream.fileIdx || 0,
    quality,
    source,
    codec,
    size,
    seeds,
    tracker,
    title: title.replace(/\n/g, ' ').trim(),
    addonName: name.split('\n')[0] || 'Unknown',
    browserFriendly,
    url: stream.url || null,
  };
}

/**
 * Query all configured addons for streams.
 * @param {string} type - "movie" or "series"
 * @param {string} imdbId - IMDb ID (tt1234567)
 * @param {number} season - Season number (for series)
 * @param {number} episode - Episode number (for series)
 */
async function getStreams(type, imdbId, season, episode) {
  const addons = getAddonUrls();
  const streamId = type === 'series' ? `${imdbId}:${season}:${episode}` : imdbId;

  const results = await Promise.allSettled(
    addons.map(async (addon) => {
      const url = `${addon.url}/stream/${type}/${streamId}.json`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) return [];

        const data = await res.json();
        return (data.streams || []).map((s) => ({
          ...parseStreamTitle(s),
          addon: addon.name,
        }));
      } catch {
        clearTimeout(timeout);
        return [];
      }
    })
  );

  // Flatten and deduplicate by infoHash
  const allStreams = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  const seen = new Set();
  const filtered = allStreams.filter((s) => {
    if (!s.infoHash && !s.url) return false;
    const key = s.infoHash || s.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Remove obviously unrelated results using heuristics
  return filterRelevantStreams(filtered);
}

/**
 * Filter out completely unrelated streams.
 * Sometimes addons return results from other movies/shows by mistake.
 */
function filterRelevantStreams(streams) {
  if (streams.length === 0) return streams;

  // Common false positives: short titles that match many things
  const falsePositivePatterns = [
    /toy\.?story/i,
    /spider.?man/i,
    /batman/i,
    /iron.?man/i,
    /ant.?man/i,
    /x.?men/i,
    /a\s+\w+\s+place/i, // "A Quiet Place"
  ];

  // Title keywords that indicate low quality or irrelevant results
  const junkPatterns = [
    /\d+\s+movies?/i,
    /collection/i,
    /compilation/i,
    /part\s+\d+/i,
    /volume/i,
    /\d+\s+in\s+1/i,
    /french\.?sub/i,
    /swedish\.?dub/i,
    /kortfilmer/i, // Swedish shorts
  ];

  // Filter based on quality and uniqueness
  const qualityWeights = {
    '4K': 5,
    '1080p': 4,
    '720p': 3,
    '480p': 2,
    'CAM': 0.5,
    'Unknown': 1,
  };

  return streams
    .filter((stream) => {
      const title = stream.title.toLowerCase();

      // Remove if it's clearly junk/collection
      if (junkPatterns.some(p => p.test(title))) {
        return false;
      }

      // Keep if it doesn't match a known false positive, or if it has high quality
      const isFalsePositive = falsePositivePatterns.some(p => p.test(title));
      if (isFalsePositive) {
        // Only keep if it's very high quality (maybe it's a collection that includes what we want)
        return stream.quality === '4K' || stream.quality === '1080p';
      }

      return true;
    })
    .sort((a, b) => {
      // Sort by quality (descending) then by seeds (descending)
      const weightA = qualityWeights[a.quality] || 1;
      const weightB = qualityWeights[b.quality] || 1;
      if (weightA !== weightB) return weightB - weightA;
      return (b.seeds || 0) - (a.seeds || 0);
    });
}

module.exports = { getStreams };
