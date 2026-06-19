/**
 * TorBox API integration.
 * Only shows cached (instant) streams. No waiting for downloads.
 */

const TORBOX_BASE = 'https://api.torbox.app/v1/api';

async function torboxFetch(endpoint, options = {}) {
  const url = `${TORBOX_BASE}${endpoint}`;
  const headers = {
    Authorization: `Bearer ${process.env.TORBOX_API_KEY}`,
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });
  const data = await res.json();
  return data;
}

/**
 * Batch check which infoHashes are instantly available (cached) on TorBox.
 * Uses POST endpoint for unlimited hashes and object format for reliable parsing.
 * @param {string[]} hashes - Array of info hashes to check
 * @returns {Set<string>} - Set of cached hashes (lowercase)
 */
async function checkCachedBatch(hashes) {
  if (!hashes.length) return new Set();

  try {
    const data = await torboxFetch('/torrents/checkcached?format=object', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes }),
    });

    const cached = new Set();
    if (data.success && data.data && typeof data.data === 'object') {
      // Object format: { "hash1": { name, size, hash, files }, "hash2": null, ... }
      // A hash is cached if its value is truthy (non-null, non-empty)
      for (const [hash, info] of Object.entries(data.data)) {
        if (info) {
          cached.add(hash.toLowerCase());
        }
      }
    }
    return cached;
  } catch (err) {
    console.error('TorBox cache check failed:', err.message);
    return new Set();
  }
}

/**
 * Add a cached torrent to TorBox and get a playback link.
 * Since we only show cached streams, this should be instant.
 */
async function resolveStream(infoHash, fileIdx = 0) {
  const magnet = `magnet:?xt=urn:btih:${infoHash}`;

  // Step 1: Add torrent (instant for cached)
  const formData = new URLSearchParams();
  formData.append('magnet', magnet);
  formData.append('seed', '1');

  const addResult = await torboxFetch('/torrents/createtorrent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  const torrentId = addResult.data?.torrent_id || addResult.data?.id;
  if (!torrentId) throw new Error('Failed to add torrent to TorBox');

  // Step 2: Get file list to find the right file
  const listData = await torboxFetch(`/torrents/mylist?id=${torrentId}`);
  const torrent = listData.data;

  let fileId = 0;
  if (torrent && torrent.files && torrent.files.length > 0) {
    // Find the largest video file (most likely the movie)
    const videoExts = ['.mkv', '.mp4', '.avi', '.mov', '.webm'];
    const videoFiles = torrent.files.filter((f) =>
      videoExts.some((ext) => (f.name || f.short_name || '').toLowerCase().endsWith(ext))
    );

    if (videoFiles.length > 0) {
      // Sort by size, pick largest
      videoFiles.sort((a, b) => (b.size || 0) - (a.size || 0));
      fileId = videoFiles[0].id || fileIdx;
    }
  }

  // Step 3: Get download link
  const params = new URLSearchParams({
    token: process.env.TORBOX_API_KEY,
    torrent_id: torrentId.toString(),
    file_id: fileId.toString(),
    zip_link: 'false',
  });

  const dlData = await torboxFetch(`/torrents/requestdl?${params}`);
  return dlData.data; // Direct streaming URL
}

/**
 * List all torrents on the user's TorBox account.
 */
async function listTorrents() {
  const data = await torboxFetch('/torrents/mylist');
  return data.data || [];
}

module.exports = { checkCachedBatch, resolveStream, listTorrents };
