/**
 * Video Player Controller
 * Handles playback, subtitles, keyboard shortcuts, progress saving.
 */

import API from '../api.js?v=1.3.8';
import store from '../store.js?v=1.3.8';
import { formatTime, toast, $ } from '../components.js?v=1.3.8';
import { TouchGestureHandler } from '../services/touch-gestures.js?v=1.3.8';

let hideTimer = null;
let progressInterval = null;
let currentPlayData = null;
let gestureHandler = null;
let isEmbedMode = false;
let _pickerScanTimer = null;
let _pickerCountTimer = null;
let _playerHistoryPushed = false;
let _embedLastTime = 0;
let _embedLastDuration = 0;
let _embedProgressSaveAt = 0;

function closePicker() {
  document.getElementById('stream-picker')?.classList.add('hidden');
  clearInterval(_pickerScanTimer);
  clearInterval(_pickerCountTimer);
  _pickerScanTimer = null;
  _pickerCountTimer = null;
}
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

/** Incognito-aware progress save — no-op while incognito is ON. */
function saveProgressIfAllowed(payload) {
  if (store.isIncognito()) return Promise.resolve(); // privacy: don't record
  return API.saveProgress(payload).catch(() => {});
}

export function initPlayer() {
  const overlay = $('#player-overlay');
  const video = $('#video-player');
  const ui = $('#player-ui');

  const playPauseBtn = $('#player-play-pause');
  const playIcon = $('#play-icon');
  const pauseIcon = $('#pause-icon');
  const seekBar = $('#player-seek');
  const progressBar = $('#player-progress');
  const bufferBar = $('#player-buffer');
  const currentTimeEl = $('#player-current-time');
  const durationEl = $('#player-duration');
  const volumeSlider = $('#player-volume');
  const backBtn = $('#player-back');
  const fullscreenBtn = $('#player-fullscreen');
  const pipBtn = $('#player-pip');
  const rwBtn = $('#player-rw');
  const ffBtn = $('#player-ff');
  const speedBtn = $('#player-speed');
  const speedLabel = $('#speed-label');
  const subsBtn = null; // removed — consolidated into Audio & Subtitles panel
  const settingsBtn = $('#player-settings-btn');
  const settingsPanel = $('#settings-panel');

  // ─── Show/Hide UI ─────────────────────────────────────────

  function showUI() {
    ui.classList.remove('hide-cursor');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (isEmbedMode) ui.classList.add('hide-cursor');        // embed: hide top bar after 5s
      else if (!video.paused) ui.classList.add('hide-cursor'); // video: hide controls when playing
    }, isEmbedMode ? 6000 : 3000);
  }

  overlay.addEventListener('mousemove', showUI);
  overlay.addEventListener('touchstart', showUI);

  // ─── Play/Pause ───────────────────────────────────────────

  function togglePlay() {
    // play() returns a promise — swallow rejections (autoplay block / bad src)
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function updatePlayState() {
    playIcon.classList.toggle('hidden', !video.paused);
    pauseIcon.classList.toggle('hidden', video.paused);
  }

  playPauseBtn.addEventListener('click', togglePlay);
  video.addEventListener('play', updatePlayState);
  video.addEventListener('pause', updatePlayState);

  // Click video area to play/pause — mouse only. On touch devices a
  // single tap shows the UI and DOUBLE-tap toggles play (gesture handler).
  video.addEventListener('click', (e) => {
    if (IS_TOUCH) return;
    if (e.target === video) togglePlay();
  });

  // Double-click to fullscreen (mouse only — double-tap is play/pause)
  video.addEventListener('dblclick', () => { if (!IS_TOUCH) toggleFullscreen(); });

  // ─── Touch Gestures (mobile only) ─────────────────────────
  // Swipe horizontally to seek, vertically for brightness (left half)
  // or volume (right half); double-tap to play/pause.
  if (IS_TOUCH) {
    gestureHandler = new TouchGestureHandler(overlay, {
      onVolumeChange: (v) => { volumeSlider.value = v; },
      onPlayToggle: togglePlay,
    });
  }

  // ─── Progress / Seeking ───────────────────────────────────

  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    progressBar.style.width = pct + '%';
    seekBar.value = pct;
    currentTimeEl.textContent = formatTime(video.currentTime);
  });

  video.addEventListener('loadedmetadata', () => {
    durationEl.textContent = formatTime(video.duration);
  });

  video.addEventListener('durationchange', () => {
    durationEl.textContent = formatTime(video.duration);
  });

  // Buffer progress
  video.addEventListener('progress', () => {
    if (video.buffered.length > 0 && video.duration) {
      const buffered = video.buffered.end(video.buffered.length - 1);
      bufferBar.style.width = (buffered / video.duration * 100) + '%';
    }
  });

  seekBar.addEventListener('change', () => {
    if (!video.duration) return;
    video.currentTime = (seekBar.value / 100) * video.duration;
  });

  // ─── Volume ───────────────────────────────────────────────

  const volIconOn = $('#vol-icon-on');
  const volIconOff = $('#vol-icon-off');

  function updateVolumeIcon() {
    const muted = video.muted || video.volume === 0;
    volIconOn?.classList.toggle('hidden', muted);
    volIconOff?.classList.toggle('hidden', !muted);
  }

  volumeSlider.addEventListener('input', () => {
    video.volume = parseFloat(volumeSlider.value);
    video.muted = video.volume === 0;
    updateVolumeIcon();
  });

  video.addEventListener('volumechange', () => {
    volumeSlider.value = video.muted ? 0 : video.volume;
    updateVolumeIcon();
  });

  $('#player-volume-btn')?.addEventListener('click', () => {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) {
      video.volume = 0.5;
      volumeSlider.value = 0.5;
    }
    updateVolumeIcon();
  });

  // ─── Skip Forward/Back ────────────────────────────────────

  rwBtn.addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 10); });
  ffBtn.addEventListener('click', () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); });

  // ─── Fullscreen ───────────────────────────────────────────

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      overlay.requestFullscreen?.() || overlay.webkitRequestFullscreen?.();
    }
  }

  fullscreenBtn.addEventListener('click', toggleFullscreen);

  // ─── PiP ──────────────────────────────────────────────────

  pipBtn.addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch { toast('PiP not supported', 'error'); }
  });

  // ─── Speed ────────────────────────────────────────────────

  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  let speedIdx = 2;

  settingsPanel.querySelectorAll('[data-speed]').forEach(item => {
    item.addEventListener('click', () => {
      const speed = parseFloat(item.dataset.speed);
      video.playbackRate = speed;
      speedLabel.textContent = `Speed (${speed}x)`;
      // Keep speedIdx in sync so the bottom-bar cycle button picks up correctly
      speedIdx = speeds.indexOf(speed);
      if (speedIdx === -1) speedIdx = 2; // fallback to 1x if somehow not in array
      settingsPanel.querySelectorAll('.panel-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      settingsPanel.classList.add('hidden');
    });
  });

  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % speeds.length;
    const speed = speeds[speedIdx];
    video.playbackRate = speed;
    speedLabel.textContent = `Speed (${speed}x)`;
    // Sync active state in settings panel
    settingsPanel.querySelectorAll('[data-speed]').forEach(item => {
      item.classList.toggle('active', parseFloat(item.dataset.speed) === speed);
    });
  });

  // ─── Audio & Subtitles ────────────────────────────────────

  const audioSubsBtnEl = $('#player-audio-subs');
  const audioPanel = document.createElement('div');
  audioPanel.className = 'player-panel hidden';
  audioPanel.id = 'audio-panel';
  audioPanel.innerHTML = `
    <div class="panel-header">
      <h3>Audio & Subtitles</h3>
      <button class="panel-close">&times;</button>
    </div>
    <div class="panel-section-label">Audio</div>
    <div id="audio-list" class="panel-list">
      <div class="panel-item active" data-audio="default">Default</div>
    </div>
    <div class="panel-section-label" style="margin-top:8px">
      Subtitles
      <span id="sub-loading" style="display:none;margin-left:6px;font-size:0.65rem;color:var(--accent)">Loading…</span>
    </div>
    <div id="panel-subs-list" class="panel-list">
      <div class="panel-item active" data-sub="off">Off</div>
    </div>
    <div style="padding:10px;border-top:1px solid var(--border);margin-top:4px">
      <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:6px">Manual search (title + S01E01)</div>
      <div style="display:flex;gap:6px">
        <input id="sub-search-input" type="text" placeholder="e.g. Breaking Bad S01E01"
          style="flex:1;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px;color:var(--text);font-size:0.75rem;outline:none">
        <select id="sub-lang-select" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 8px;color:var(--text);font-size:0.72rem;cursor:pointer">
          <option value="">All</option>
          <option value="en">English</option>
          <option value="ar">Arabic</option>
          <option value="ms">Malay</option>
          <option value="id">Indonesian</option>
          <option value="fr">French</option>
          <option value="es">Spanish</option>
          <option value="de">German</option>
          <option value="it">Italian</option>
          <option value="pt">Portuguese</option>
          <option value="ru">Russian</option>
          <option value="ja">Japanese</option>
          <option value="ko">Korean</option>
          <option value="zh">Chinese</option>
        </select>
        <button id="sub-search-btn" style="padding:6px 12px;border-radius:var(--radius-sm);background:var(--accent);color:var(--bg);font-size:0.72rem;font-weight:600;white-space:nowrap;cursor:pointer">Search</button>
      </div>
      <div id="sub-search-results" class="panel-list" style="max-height:180px;overflow-y:auto;margin-top:6px"></div>
    </div>
    <div style="padding:10px;border-top:1px solid var(--border)">
      <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:6px">Subtitle offset</div>
      <div style="display:flex;align-items:center;gap:8px">
        <button id="sub-offset-minus" style="width:32px;height:32px;border-radius:var(--radius-sm);background:var(--bg-elevated);border:1px solid var(--border);color:var(--text);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center">−</button>
        <span id="sub-offset-label" style="flex:1;text-align:center;font-size:0.78rem;font-weight:600;color:var(--text)">0.0s</span>
        <button id="sub-offset-plus" style="width:32px;height:32px;border-radius:var(--radius-sm);background:var(--bg-elevated);border:1px solid var(--border);color:var(--text);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center">+</button>
        <button id="sub-offset-reset" style="padding:0 10px;height:32px;border-radius:var(--radius-sm);background:var(--bg-elevated);border:1px solid var(--border);color:var(--text-dim);font-size:0.7rem;cursor:pointer">Reset</button>
      </div>
    </div>
  `;
  ui.appendChild(audioPanel);

  audioSubsBtnEl?.addEventListener('click', () => {
    audioPanel.classList.toggle('hidden');
    settingsPanel.classList.add('hidden');
  });

  audioPanel.querySelector('.panel-close')?.addEventListener('click', () => audioPanel.classList.add('hidden'));

  // Audio track selection
  const audioList = audioPanel.querySelector('#audio-list');
  audioList?.querySelector('[data-audio="default"]')?.addEventListener('click', function() {
    audioList.querySelectorAll('.panel-item').forEach(item => item.classList.remove('active'));
    this.classList.add('active');
  });

  // ─── Subtitle activation helper ───────────────────────────

  let _subOffset = 0;       // current offset in seconds
  let _subCurrentUrl = null; // last activated subtitle base URL (without offset)

  function activateSubtitle(url, langCode, langLabel, targetList) {
    // Clear all existing tracks
    video.querySelectorAll('track').forEach(t => t.remove());
    for (let t of video.textTracks) t.mode = 'disabled';

    const allLists = audioPanel.querySelectorAll('.panel-list');
    allLists.forEach(list => list.querySelectorAll('.panel-item').forEach(p => p.classList.remove('active')));

    if (!url) {
      _subCurrentUrl = null;
      audioPanel.querySelector('[data-sub="off"]')?.classList.add('active');
      return;
    }

    // Store base URL (without offset) so offset changes can reload it
    _subCurrentUrl = url;
    const finalUrl = _subOffset !== 0 ? `${url}&offset=${_subOffset}` : url;

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = langLabel || langCode || 'sub';
    track.srclang = langCode || 'en';
    track.src = finalUrl;
    track.default = true;
    video.appendChild(track);
    requestAnimationFrame(() => {
      for (let t of video.textTracks) {
        if (t.label === track.label) t.mode = 'showing';
      }
    });

    if (targetList) {
      const items = targetList.querySelectorAll('.panel-item');
      items.forEach(item => { if (item.dataset.subUrl === url) item.classList.add('active'); });
    }
  }

  function reloadSubtitleWithOffset() {
    if (!_subCurrentUrl) return;
    const finalUrl = _subOffset !== 0 ? `${_subCurrentUrl}&offset=${_subOffset}` : _subCurrentUrl;
    video.querySelectorAll('track').forEach(t => t.remove());
    for (let t of video.textTracks) t.mode = 'disabled';
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.srclang = 'xx';
    track.src = finalUrl;
    track.default = true;
    video.appendChild(track);
    requestAnimationFrame(() => {
      for (let t of video.textTracks) t.mode = 'showing';
    });
  }

  // Offset controls
  const offsetLabel = audioPanel.querySelector('#sub-offset-label');
  audioPanel.querySelector('#sub-offset-minus')?.addEventListener('click', () => {
    _subOffset = Math.round((_subOffset - 0.5) * 10) / 10;
    offsetLabel.textContent = _subOffset === 0 ? '0.0s' : `${_subOffset > 0 ? '+' : ''}${_subOffset.toFixed(1)}s`;
    reloadSubtitleWithOffset();
  });
  audioPanel.querySelector('#sub-offset-plus')?.addEventListener('click', () => {
    _subOffset = Math.round((_subOffset + 0.5) * 10) / 10;
    offsetLabel.textContent = _subOffset === 0 ? '0.0s' : `${_subOffset > 0 ? '+' : ''}${_subOffset.toFixed(1)}s`;
    reloadSubtitleWithOffset();
  });
  audioPanel.querySelector('#sub-offset-reset')?.addEventListener('click', () => {
    _subOffset = 0;
    offsetLabel.textContent = '0.0s';
    reloadSubtitleWithOffset();
  });

  // ─── Render subtitle list from API results ────────────────

  function renderSubList(subs, targetList) {
    // Keep the Off row
    const offItem = targetList.querySelector('[data-sub="off"]');
    targetList.innerHTML = '';
    if (offItem) targetList.appendChild(offItem);

    if (!subs.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:10px 12px;font-size:0.75rem;color:var(--text-dim)';
      empty.textContent = 'No subtitles found';
      targetList.appendChild(empty);
      return;
    }

    // Group by language label
    const byLang = {};
    subs.forEach(s => {
      const key = s.langLabel || s.lang || 'Unknown';
      if (!byLang[key]) byLang[key] = [];
      byLang[key].push(s);
    });

    // Sort: English first, then alphabetical
    const orderedLangs = Object.keys(byLang).sort((a, b) => {
      if (a === 'English') return -1;
      if (b === 'English') return 1;
      return a.localeCompare(b);
    });

    orderedLangs.forEach(langLabel => {
      byLang[langLabel].forEach((sub, i) => {
        const item = document.createElement('div');
        item.className = 'panel-item';
        item.dataset.subUrl = sub.url;

        const badge = sub.hi ? ' <span style="font-size:0.62rem;opacity:0.6">[CC]</span>' : '';
        const suffix = byLang[langLabel].length > 1 ? ` <span style="font-size:0.68rem;color:var(--text-dim)">${sub.release?.slice(0, 30) || `#${i + 1}`}</span>` : '';
        item.innerHTML = `<span style="font-weight:500">${langLabel}</span>${badge}${suffix}`;

        item.addEventListener('click', () => {
          activateSubtitle(sub.url, sub.lang, langLabel, targetList);
          item.classList.add('active');
        });
        targetList.appendChild(item);
      });
    });
  }

  // ─── Auto-load subtitles when player opens ────────────────

  async function loadAudioSubtitles(meta, season, episode, streamFilename) {
    const subsList = audioPanel.querySelector('#panel-subs-list');
    const subLoading = audioPanel.querySelector('#sub-loading');
    const searchInput = audioPanel.querySelector('#sub-search-input');

    // Reset
    subsList.innerHTML = '<div class="panel-item active" data-sub="off">Off</div>';
    audioPanel.querySelector('#sub-search-results').innerHTML = '';

    // Pre-fill search box
    if (searchInput) {
      searchInput.value = meta.title + (season ? ` S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}` : '');
    }

    // Off handler
    subsList.querySelector('[data-sub="off"]')?.addEventListener('click', () => {
      activateSubtitle(null, null, null, subsList);
    });

    if (subLoading) subLoading.style.display = '';

    try {
      // Build query — pass filename for better matching when available
      let url = `/api/subtitles/${meta.type}/${encodeURIComponent(meta.id)}`;
      const params = new URLSearchParams();
      if (season) params.set('s', season);
      if (episode) params.set('e', episode);
      if (streamFilename) params.set('filename', streamFilename);
      const qs = params.toString();
      if (qs) url += '?' + qs;

      const res = await fetch(url);
      const subs = await res.json();
      renderSubList(subs, subsList);
    } catch {
      const errItem = document.createElement('div');
      errItem.style.cssText = 'padding:10px 12px;font-size:0.75rem;color:var(--text-dim)';
      errItem.textContent = 'Could not load subtitles';
      subsList.appendChild(errItem);
    } finally {
      if (subLoading) subLoading.style.display = 'none';
    }
  }

  // ─── Manual subtitle search ───────────────────────────────

  async function doSubSearch() {
    const query = audioPanel.querySelector('#sub-search-input')?.value?.trim();
    const lang = audioPanel.querySelector('#sub-lang-select')?.value || '';
    const resultsEl = audioPanel.querySelector('#sub-search-results');
    const subsList = audioPanel.querySelector('#panel-subs-list');
    if (!query || !resultsEl) return;

    resultsEl.innerHTML = '<div style="padding:8px 12px;color:var(--text-dim);font-size:0.75rem">Searching subtitles…</div>';

    try {
      const params = new URLSearchParams({ q: query });
      if (lang) params.set('lang', lang);
      // If we have current meta, also pass imdb_id for precision
      if (window._currentSubMeta?.id) params.set('imdb_id', window._currentSubMeta.id);
      const res = await fetch('/api/subtitles/search?' + params.toString());
      const subs = await res.json();

      resultsEl.innerHTML = '';
      if (!subs.length) {
        resultsEl.innerHTML = '<div style="padding:8px 12px;color:var(--text-dim);font-size:0.75rem">No results found</div>';
        return;
      }

      // Add a small header
      const hdr = document.createElement('div');
      hdr.style.cssText = 'padding:6px 12px 2px;font-size:0.68rem;color:var(--text-dim);text-transform:uppercase;font-weight:600';
      hdr.textContent = `${subs.length} subtitle results`;
      resultsEl.appendChild(hdr);

      subs.forEach(sub => {
        const item = document.createElement('div');
        item.className = 'panel-item';
        item.dataset.subUrl = sub.url;
        const badge = sub.hi ? ' <span style="font-size:0.62rem;opacity:0.6">[CC]</span>' : '';
        item.innerHTML = `<span style="font-weight:500">${sub.langLabel || sub.lang?.toUpperCase() || '?'}</span>${badge} <span style="color:var(--text-dim);font-size:0.68rem;margin-left:4px">${sub.release?.slice(0, 35) || ''}</span>`;
        item.addEventListener('click', () => {
          activateSubtitle(sub.url, sub.lang, sub.langLabel, null);
        });
        resultsEl.appendChild(item);
      });
    } catch {
      resultsEl.innerHTML = '<div style="padding:8px 12px;color:var(--text-dim);font-size:0.75rem">Search failed</div>';
    }
  }

  audioPanel.querySelector('#sub-search-btn')?.addEventListener('click', doSubSearch);
  audioPanel.querySelector('#sub-search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); doSubSearch(); }
  });

  window.loadAudioSubtitles = loadAudioSubtitles;

  // ─── Panel Controls ───────────────────────────────────────

  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
    audioPanel.classList.add('hidden');
  });

  // Close panels
  settingsPanel.querySelector('.panel-close')?.addEventListener('click', () => settingsPanel.classList.add('hidden'));
  audioPanel.querySelector('.panel-close')?.addEventListener('click', () => audioPanel.classList.add('hidden'));

  // ─── Back / Close ─────────────────────────────────────────

  backBtn.addEventListener('click', closePlayer);

  // Intercept browser back button — close player instead of navigating away
  window.addEventListener('popstate', () => {
    if (!overlay.classList.contains('hidden')) closePlayer();
  }, { capture: true });

  // ─── Keyboard Shortcuts ───────────────────────────────────

  let lastSubtitleUrl = null; // remembered so "C" can re-enable the last track

  function toggleSubtitlesShortcut() {
    const tracks = [...video.textTracks];
    const showing = tracks.find(t => t.mode === 'showing');
    if (showing) {
      lastSubtitleUrl = video.querySelector('track')?.src || lastSubtitleUrl;
      tracks.forEach(t => { t.mode = 'disabled'; });
      toast('Subtitles off');
    } else if (video.querySelector('track')) {
      tracks.forEach(t => { t.mode = 'showing'; });
      toast('Subtitles on');
    } else {
      toast('No subtitle track loaded — open Audio & Subtitles');
    }
  }

  function handleKeyboard(e) {
    if (overlay.classList.contains('hidden')) return;
    if (isEmbedMode) { if (e.key === 'Escape') closePlayer(); return; }
    // Never hijack keys while the user is typing (e.g. subtitle search) —
    // except Escape, which blurs the field and closes the open panel.
    if (e.target.matches('input, textarea, select') && e.target.closest('.player-panel')) {
      if (e.key === 'Escape') {
        e.target.blur();
        audioPanel.classList.add('hidden');
        settingsPanel.classList.add('hidden');
      }
      return;
    }

    showUI();

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 10);
        break;
      case 'ArrowRight':
        e.preventDefault();
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
        break;
      case 'ArrowUp':
        e.preventDefault();
        video.volume = Math.min(1, video.volume + 0.1);
        volumeSlider.value = video.volume;
        break;
      case 'ArrowDown':
        e.preventDefault();
        video.volume = Math.max(0, video.volume - 0.1);
        volumeSlider.value = video.volume;
        break;
      case 'f':
        toggleFullscreen();
        break;
      case 'm':
        video.muted = !video.muted;
        volumeSlider.value = video.muted ? 0 : video.volume;
        break;
      case 'c':
        toggleSubtitlesShortcut();
        break;
      case 'Escape':
        if (document.fullscreenElement) document.exitFullscreen();
        else closePlayer();
        break;
      case 'j':
        video.currentTime = Math.max(0, video.currentTime - 10);
        break;
      case 'l':
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
        break;
    }
  }

  document.addEventListener('keydown', handleKeyboard);

  // ─── Error handling ───────────────────────────────────────

  video.addEventListener('error', () => {
    toast('Playback error. The stream may be unavailable.', 'error');
  });

  video.addEventListener('waiting', () => {
    const buf = document.getElementById('player-buffering');
    if (buf) buf.classList.add('active');
  });

  video.addEventListener('playing', () => {
    const buf = document.getElementById('player-buffering');
    if (buf) buf.classList.remove('active');
  });

  video.addEventListener('canplay', () => {
    const buf = document.getElementById('player-buffering');
    if (buf) buf.classList.remove('active');
  });

  video.addEventListener('seeked', () => {
    const buf = document.getElementById('player-buffering');
    if (buf) buf.classList.remove('active');
  });

  // ─── Video Ended ──────────────────────────────────────────

  video.addEventListener('ended', () => {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');

    if (currentPlayData) {
      window.dispatchEvent(new CustomEvent('hs-episode-ended', {
        detail: { ...currentPlayData },
      }));
    }
  });

  // ─── TASK-10: Skip Intro button ───────────────────────────

  const skipIntroBtn = document.getElementById('skip-intro-btn');
  let _skipIntroShown = false;

  video.addEventListener('timeupdate', () => {
    if (!skipIntroBtn || !video.duration) return;
    const t = video.currentTime;
    // Show "Skip Intro" in first 4 minutes if not already skipped this session
    if (!_skipIntroShown && t > 5 && t < 240) {
      skipIntroBtn.classList.remove('hidden');
    } else if (t >= 240 || _skipIntroShown) {
      skipIntroBtn.classList.add('hidden');
    }
  });

  skipIntroBtn?.addEventListener('click', () => {
    video.currentTime = Math.min(video.duration || 0, video.currentTime + 90);
    skipIntroBtn.classList.add('hidden');
    _skipIntroShown = true;
  });

  // ─── TASK-07: Up Next end card ────────────────────────────

  const endCard = document.getElementById('end-card');
  const endCardTitle = document.getElementById('end-card-title');
  const endCardSeconds = document.getElementById('end-card-seconds');
  const endCardRingFill = document.getElementById('end-card-ring-fill');
  let _endCardTimer = null;
  let _endCardDismissed = false;

  function showEndCard(nextEp, meta) {
    if (!endCard || !nextEp) return;
    endCardTitle.textContent = `S${nextEp.season} E${nextEp.episode}`;
    endCard.classList.remove('hidden');

    let remaining = 10;
    const circumference = 94.2;
    endCardSeconds.textContent = remaining;
    endCardRingFill.style.strokeDashoffset = circumference;

    _endCardTimer = setInterval(() => {
      remaining--;
      endCardSeconds.textContent = remaining;
      endCardRingFill.style.strokeDashoffset = circumference * (remaining / 10);
      if (remaining <= 0) {
        clearInterval(_endCardTimer);
        _endCardTimer = null;
        triggerNextEpisode(nextEp, meta);
      }
    }, 1000);
  }

  function hideEndCard() {
    endCard?.classList.add('hidden');
    clearInterval(_endCardTimer);
    _endCardTimer = null;
  }

  function triggerNextEpisode(nextEp, meta) {
    hideEndCard();
    // Navigate to the next episode by navigating to its detail page
    // The detail page will auto-open streams; for now dispatch a router navigate
    window.dispatchEvent(new CustomEvent('hs-navigate', {
      detail: { path: `/details/${meta.type}/${encodeURIComponent(meta.id)}`, resumeSeason: nextEp.season, resumeEpisode: nextEp.episode },
    }));
    closePlayer();
  }

  document.getElementById('end-card-play')?.addEventListener('click', () => {
    if (currentPlayData?.nextEpisode) {
      triggerNextEpisode(currentPlayData.nextEpisode, currentPlayData.meta);
    }
  });

  document.getElementById('end-card-cancel')?.addEventListener('click', () => {
    _endCardDismissed = true;
    hideEndCard();
  });

  // Show end card when 90% through a series episode
  video.addEventListener('timeupdate', () => {
    if (!currentPlayData?.nextEpisode || !video.duration) return;
    if (endCard?.classList.contains('hidden') && !_endCardTimer && !_endCardDismissed) {
      const pct = video.currentTime / video.duration;
      if (pct >= 0.90) showEndCard(currentPlayData.nextEpisode, currentPlayData.meta);
    }
  });

  // Also show on ended
  window.addEventListener('hs-episode-ended', () => {
    if (currentPlayData?.nextEpisode && endCard?.classList.contains('hidden') && !_endCardTimer && !_endCardDismissed) {
      showEndCard(currentPlayData.nextEpisode, currentPlayData.meta);
    }
  });

  // ─── Embed player postMessage → Up Next card ─────────────────
  // Vidsync fires VIDSYNC_PLAYER_EVENT; VIDEASY fires a JSON string

  window.addEventListener('message', (event) => {
    if (!isEmbedMode) return;
    // ponytail: temp debug — remove once postMessage confirmed working
    if (typeof event.data === 'string') console.debug('[embed] postMessage:', event.data.slice(0, 120));

    const msg = event.data;
    let currentTime = 0, duration = 0, ended = false;

    if (msg?.type === 'VIDSYNC_PLAYER_EVENT') {
      currentTime = msg.data?.currentTime || 0;
      duration    = msg.data?.duration    || 0;
      ended       = msg.data?.event === 'ended';
    } else if (msg?.type === 'PLAYER_EVENT' && msg?.data?.player_status != null) {
      currentTime = msg.data.player_progress || 0;
      duration    = msg.data.player_duration || 0;
      ended       = msg.data.player_status === 'completed';
    } else if (msg?.type === 'PLAYER_EVENT' && msg?.data?.event != null) {
      currentTime = msg.data.currentTime || 0;
      duration    = msg.data.duration    || 0;
      ended       = msg.data.event === 'ended';
    } else if (typeof msg === 'string') {
      try {
        const d = JSON.parse(msg);
        if (d?.timestamp != null && d?.duration) {
          currentTime = d.timestamp;
          duration    = d.duration;
        }
      } catch {}
    }

    if (!duration) return;

    // Track latest position for closePlayer final save
    _embedLastTime = currentTime;
    _embedLastDuration = duration;

    // Throttle-save every 10s
    const now = Date.now();
    if (currentPlayData && currentTime > 5 && now - _embedProgressSaveAt > 10000) {
      _embedProgressSaveAt = now;
      const { meta, season, episode } = currentPlayData;
      saveProgressIfAllowed({
        id: meta.id + (season ? `:${season}:${episode}` : ''),
        type: meta.type,
        title: $('#player-title').textContent,
        poster: meta.poster,
        backdrop: meta.backdrop,
        currentTime,
        duration,
      });
    }

    // Up Next end card
    if (currentPlayData?.nextEpisode && !_endCardDismissed && !_endCardTimer) {
      if (endCard && !endCard.classList.contains('hidden')) return;
      if (ended || currentTime / duration >= 0.9) {
        showEndCard(currentPlayData.nextEpisode, currentPlayData.meta);
      }
    }
  });

  // ─── Stream Picker ────────────────────────────────────────

  window.addEventListener('hs-open-picker', (e) => {
    const { streams, title, meta, season, episode, nextEpisode } = e.detail;

    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (!_playerHistoryPushed) { history.pushState({ player: true }, '', location.href); _playerHistoryPushed = true; }
    $('#player-title').textContent = title || '';

    const pickerPanel = document.getElementById('stream-picker');
    const pickerList = document.getElementById('picker-list');
    const pickerCount = document.getElementById('picker-count');
    const pickerAuto = document.getElementById('picker-auto');

    pickerPanel.classList.remove('hidden');
    if (pickerAuto) pickerAuto.classList.add('hidden');

    pickerList.innerHTML = streams.map((s, i) => {
      const tracker = s.tracker || s.addonName || 'Unknown';
      return `<div class="picker-item" data-idx="${i}">
        <span class="picker-quality">${s.quality}</span>
        <span class="picker-tracker">${tracker}</span>
        ${s.source ? `<span class="picker-source">${s.source}</span>` : ''}
        ${s.size ? `<span class="picker-source">${s.size}</span>` : ''}
        ${s.browserFriendly ? '<span class="picker-browser">Browser</span>' : ''}
      </div>`;
    }).join('');

    const items = [...pickerList.querySelectorAll('.picker-item')];

    items.forEach((el, i) => {
      el.addEventListener('click', () => {
        closePicker();
        _dispatchPickedStream(streams[i], i, e.detail);
      });
    });

    // Scan through items, land on index 0
    let scanIdx = 0;
    clearInterval(_pickerScanTimer);
    _pickerScanTimer = setInterval(() => {
      items.forEach(el => el.classList.remove('scanning'));
      if (scanIdx < items.length) {
        items[scanIdx].classList.add('scanning');
        scanIdx++;
      } else {
        clearInterval(_pickerScanTimer);
        items.forEach(el => el.classList.remove('scanning'));
        if (items[0]) items[0].classList.add('active');
        // Countdown
        let remaining = 2;
        if (pickerCount) pickerCount.textContent = remaining;
        if (pickerAuto) pickerAuto.classList.remove('hidden');
        clearInterval(_pickerCountTimer);
        _pickerCountTimer = setInterval(() => {
          remaining--;
          if (pickerCount) pickerCount.textContent = remaining;
          if (remaining <= 0) {
            clearInterval(_pickerCountTimer);
            closePicker();
            _dispatchPickedStream(streams[0], 0, e.detail);
          }
        }, 1000);
      }
    }, 60);
  });

  function _dispatchPickedStream(stream, streamIdx, detail) {
    const { meta, season, episode, nextEpisode, streams, title, resumeTime } = detail;
    const streamInfo = { quality: stream.quality, source: stream.source, codec: stream.codec, size: stream.size, tracker: stream.tracker || stream.addonName };
    const baseDetail = { title, meta, season, episode, nextEpisode, streams, currentStreamIdx: streamIdx, streamInfo };
    if (stream.embedUrl) {
      let embedUrl = stream.embedUrl;
      if (resumeTime > 0) embedUrl += (embedUrl.includes('?') ? '&' : '?') + `progress=${Math.floor(resumeTime)}`;
      window.dispatchEvent(new CustomEvent('hs-play', { detail: { ...baseDetail, embedUrl, embedSource: stream.embedSource } }));
    } else {
      toast('Resolving stream...', 'info');
      API.resolvePlayback(stream).then(url => {
        window.dispatchEvent(new CustomEvent('hs-play', { detail: { ...baseDetail, url } }));
      }).catch(err => toast('Failed: ' + err.message, 'error'));
    }
  }

  // ─── Public: Open Player ──────────────────────────────────

  window.addEventListener('hs-play', async (e) => {
    const { url, embedUrl, embedSource, title, meta, season, episode, streamInfo, nextEpisode, streams, currentStreamIdx } = e.detail;
    currentPlayData = { meta, season, episode, nextEpisode, streams, currentStreamIdx };

    // Store meta globally so manual subtitle search can use imdb_id
    window._currentSubMeta = meta;

    $('#player-title').textContent = title || 'Playing';
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (!_playerHistoryPushed) { history.pushState({ player: true }, '', location.href); _playerHistoryPushed = true; }

    // Player hint — permanent display with stream info + live download speed
    const hint = document.getElementById('player-hint');
    if (hint && streamInfo) {
      const parts = [streamInfo.quality, streamInfo.source, streamInfo.codec, streamInfo.size].filter(Boolean);
      if (parts.length) {
        hint.dataset.baseText = parts.join(' · ');
        hint.textContent = hint.dataset.baseText;
        hint.classList.add('visible');
        // No fade timeout — stays visible permanently
      }
    }

    // Live download speed — approximate from buffer growth every 1s (synchronous property, near-zero cost)
    let _lastBuffered = 0;
    let _lastBufferTime = Date.now();
    const _speedInterval = setInterval(() => {
      if (!hint || !video.duration) return;
      const buffered = video.buffered.length > 0
        ? video.buffered.end(video.buffered.length - 1) : 0;
      const now = Date.now();
      const gained = Math.max(0, buffered - _lastBuffered);
      _lastBuffered = buffered;
      _lastBufferTime = now;

      const bufferAhead = Math.max(0, buffered - video.currentTime).toFixed(0);
      const base = hint.dataset.baseText || '';
      hint.textContent = base + (bufferAhead > 0 ? ` · 📦 ${bufferAhead}s` : '');
    }, 1000);

    // Clean up speed interval when player closes
    const _cleanSpeed = () => { clearInterval(_speedInterval); hint && (hint.textContent = hint.dataset.baseText || ''); };
    window.addEventListener('hs-close-player', _cleanSpeed, { once: true });

    // Reset state
    video.playbackRate = 1;
    speedIdx = 2;
    speedLabel.textContent = 'Speed (1.0x)';
    settingsPanel.querySelectorAll('[data-speed]').forEach(item => {
      item.classList.toggle('active', parseFloat(item.dataset.speed) === 1);
    });
    progressBar.style.width = '0%';
    bufferBar.style.width = '0%';
    settingsPanel.classList.add('hidden');
    audioPanel.classList.add('hidden');
    // Reset subtitle offset for new video
    _subOffset = 0;
    _subCurrentUrl = null;
    if (offsetLabel) offsetLabel.textContent = '0.0s';
    // Reset skip intro and end card
    _skipIntroShown = false;
    _endCardDismissed = false;
    skipIntroBtn?.classList.add('hidden');
    hideEndCard();

    const embedWrap = document.getElementById('embed-player-wrap');
    const embedIframe = document.getElementById('embed-iframe');

    if (embedUrl) {
      // ── Embed mode (Vidsync, VIDEASY, etc.) ─────────────────
      isEmbedMode = true;
      video.classList.add('hidden');
      ui.classList.add('embed-mode');
      ui.querySelector('.player-bottom-bar')?.classList.add('hidden');
      ui.querySelector('#player-settings-btn')?.classList.add('hidden');
      // Pass clicks through to iframe — only top bar stays interactive
      ui.style.pointerEvents = 'none';
      ui.querySelector('.player-top-bar').style.pointerEvents = 'all';
      ui.classList.remove('hide-cursor');
      clearTimeout(hideTimer);
      // Hide buffering spinner — embed player handles its own loading state
      const buf = document.getElementById('player-buffering');
      if (buf) buf.classList.remove('active');

      // Inject theme color into embed URL
      const theme = document.documentElement.dataset.theme || 'dark';
      const accentHex = theme === 'light' ? '0B6B80' : 'BBE5ED';
      // vidsync/vidcore: theme=HEX  |  vidapi: color=%23HEX  |  videasy: color=HEX
      const colorParam = (embedSource === 'vidsync' || embedSource === 'vidcore') ? `theme=${accentHex}`
                       : embedSource === 'vidapi'  ? `color=%23${accentHex}`
                       : `color=${accentHex}`;
      const themedUrl = embedUrl + (embedUrl.includes('?') ? '&' : '?') + colorParam;

      if (embedWrap) embedWrap.classList.remove('hidden');
      if (embedIframe) embedIframe.src = themedUrl;

      clearInterval(progressInterval);
      // ponytail: postMessage progress from embed players saved on message event
      progressInterval = null;
    } else {
      // ── Video mode ───────────────────────────────────────────
      isEmbedMode = false;
      video.classList.remove('hidden');
      ui.querySelector('.player-bottom-bar')?.classList.remove('hidden');
      if (embedWrap) embedWrap.classList.add('hidden');
      if (embedIframe) embedIframe.src = '';

      // Clear previous subtitles
      video.querySelectorAll('track').forEach(t => t.remove());
      for (let t of video.textTracks) t.mode = 'disabled';

      video.src = url;
      const buf = document.getElementById('player-buffering');
      if (buf) buf.classList.add('active');
      try {
        await video.play();
      } catch { /* autoplay might be blocked */ }

      // Load subtitles — pass stream tracker/title as filename hint for better matching
      if (window.loadAudioSubtitles) {
        const filename = streamInfo?.tracker || streamInfo?.title || '';
        window.loadAudioSubtitles(meta, season, episode, filename);
      }

      // Reset any brightness filter / pending gesture from the previous video
      if (gestureHandler) gestureHandler.reset();

      // Save progress periodically — skipped entirely in incognito mode
      clearInterval(progressInterval);
      progressInterval = setInterval(() => {
        if (video.currentTime > 0 && video.duration > 0) {
          saveProgressIfAllowed({
            id: meta.id + (season ? `:${season}:${episode}` : ''),
            type: meta.type,
            title: title,
            poster: meta.poster,
            backdrop: meta.backdrop,
            currentTime: video.currentTime,
            duration: video.duration,
          });
        }
      }, 15000);
    }

    showUI();
  });
}

// ─── Close Player ────────────────────────────────────────────

function closePlayer() {
  const overlay = $('#player-overlay');
  const video = $('#video-player');

  // Save final progress — skipped in incognito mode
  if (currentPlayData) {
    const { meta, season, episode } = currentPlayData;
    const t = isEmbedMode ? _embedLastTime : video.currentTime;
    const d = isEmbedMode ? _embedLastDuration : video.duration;
    if (t > 0 && d > 0) {
      saveProgressIfAllowed({
        id: meta.id + (season ? `:${season}:${episode}` : ''),
        type: meta.type,
        title: $('#player-title').textContent,
        poster: meta.poster,
        backdrop: meta.backdrop,
        currentTime: t,
        duration: d,
      });
    }
  }
  // Notify details page to refresh play button
  if (currentPlayData) {
    const { meta, season, episode } = currentPlayData;
    const t = isEmbedMode ? _embedLastTime : video.currentTime;
    const d = isEmbedMode ? _embedLastDuration : video.duration;
    window.dispatchEvent(new CustomEvent('hs-player-closed', { detail: { meta, season, episode, currentTime: t, duration: d } }));
  }

  _embedLastTime = 0;
  _embedLastDuration = 0;
  _embedProgressSaveAt = 0;

  // Clear gesture side-effects (brightness filter persists otherwise)
  video.style.filter = '';

  closePicker();
  _playerHistoryPushed = false;

  // Clean up embed player
  const embedIframe = document.getElementById('embed-iframe');
  const embedWrap = document.getElementById('embed-player-wrap');
  if (embedIframe) embedIframe.src = '';
  if (embedWrap) embedWrap.classList.add('hidden');
  video.classList.remove('hidden');
  document.querySelector('#player-ui .player-bottom-bar')?.classList.remove('hidden');
  document.querySelector('#player-settings-btn')?.classList.remove('hidden');
  const playerUi = document.getElementById('player-ui');
  if (playerUi) {
    playerUi.classList.remove('embed-mode');
    playerUi.style.pointerEvents = '';
    playerUi.querySelector('.player-top-bar').style.pointerEvents = '';
  }
  isEmbedMode = false;

  video.pause();
  video.querySelectorAll('track').forEach(t => t.remove());
  for (let t of video.textTracks) t.mode = 'disabled';
  video.removeAttribute('src');
  video.load();
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
  clearInterval(progressInterval);
  clearTimeout(hideTimer);
  hideTimer = null;
  currentPlayData = null;

  // Dispatch close event — cleans up speed interval and any other one-shot listeners
  window.dispatchEvent(new CustomEvent('hs-close-player'));

  // Hide end card and skip intro
  document.getElementById('end-card')?.classList.add('hidden');
  document.getElementById('skip-intro-btn')?.classList.add('hidden');

  // Hide buffering indicator
  const buf = document.getElementById('player-buffering');
  if (buf) buf.classList.remove('active');

  // Clear stream hint
  const hint = document.getElementById('player-hint');
  if (hint) { hint.classList.remove('visible'); hint.textContent = ''; delete hint.dataset.baseText; }

  if (document.fullscreenElement) document.exitFullscreen();
}


