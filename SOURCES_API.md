# Vidsync API Documentation

**Platform**: https://vidsync.live  
**Type**: Video embed player API  
**Auth**: None required (no API keys, no backend)

---

## Overview

Vidsync embed-first video streaming. TMDB-native IDs. Multi-source fallback. No authentication. Direct iframe embed only.

**For Custom UI**: Listen to `VIDSYNC_PLAYER_EVENT` + `VIDSYNC_MEDIA_DATA` events (read-only state). Keep `autoPlay=false` and control playback from your app.

Support: https://discord.gg/4BU2XbAPdu

---

## Endpoints

### Movie Embed

```
https://vidsync.live/embed/movie/${id}?[params]
```

**Required**:
- `id` (string): TMDB movie ID

**Optional**:
- `autoPlay` (boolean): Start playback automatically
- `startTime` (number): Start from specific second (falls back to localStorage if invalid)
- `defaultServer` (string): Try specific server first (e.g., `cinevault`)
- `theme` (hex): Player color (e.g., `16A085`)

**Examples**:
```
https://vidsync.live/embed/movie/299534
https://vidsync.live/embed/movie/278?theme=16A0B5
https://vidsync.live/embed/movie/299534?autoPlay=true&startTime=120
https://vidsync.live/embed/movie/299534?defaultServer=cinevault
```

---

### TV Show Embed

```
https://vidsync.live/embed/tv/${id}/${season}/${episode}?[params]
```

**Required**:
- `id` (string): TMDB TV show ID
- `season` (number): Season number (defaults to 1)
- `episode` (number): Episode number (defaults to 1)

**Optional**:
- `autoPlay` (boolean): Start playback automatically
- `startTime` (number): Start from specific second
- `defaultServer` (string): Try specific server first
- `theme` (hex): Player color
- `nextButton` (boolean): Show 'Next Episode' button at 90% progress
- `autoNext` (boolean): Auto-play next episode (requires `nextButton=true`)

**Examples**:
```
https://vidsync.live/embed/tv/66732/1/5
https://vidsync.live/embed/tv/70523/1/5?nextButton=true&autoNext=true
https://vidsync.live/embed/tv/66732/1/5?startTime=90&defaultServer=cinevault
```

---

## Implementation

### Basic Embed

```html
<iframe 
  src="https://vidsync.live/embed/movie/299534" 
  width="100%" 
  height="100%" 
  frameborder="0" 
  allowfullscreen 
  allow="encrypted-media">
</iframe>
```

### Responsive (16:9 Aspect Ratio)

```html
<div style="position: relative; padding-bottom: 56.25%; height: 0;">
  <iframe 
    src="https://vidsync.live/embed/movie/299534" 
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" 
    frameborder="0" 
    allowfullscreen 
    allow="encrypted-media">
  </iframe>
</div>
```

### URL Builder (JS)

Movie:
```javascript
const url = new URL("https://vidsync.live/embed/movie/299534");
url.searchParams.set("theme", "16A085");
url.searchParams.set("autoPlay", "true");
```

TV:
```javascript
const url = new URL(`https://vidsync.live/embed/tv/66732/1/5`);
url.searchParams.set("nextButton", "true");
url.searchParams.set("autoNext", "true");
```

---

## Events & Commands (PostMessage API)

Vidsync player communicates via browser `postMessage`. Strip Vidsync UI, listen for events, send commands.

### Events FROM Player → Your Window

**VIDSYNC_PLAYER_EVENT** — Real-time playback state

```javascript
{
  type: "VIDSYNC_PLAYER_EVENT",
  data: {
    event: "play" | "pause" | "seeked" | "ended" | "timeupdate" | "playerstatus",
    currentTime: 352.42,           // seconds
    duration: 2667.23,             // seconds
    tmdbId: 533535,
    mediaType: "movie" | "tv",
    title: "Deadpool & Wolverine",
    poster: "https://image.tmdb.org/...jpg",
    season: 1,                     // TV only
    episode: 5,                    // TV only
    playing: true,
    muted: false,
    volume: 1                      // 0-1 range
  }
}
```

**VIDSYNC_MEDIA_DATA** — Full progress entry (for backend save)

```javascript
{
  type: "VIDSYNC_MEDIA_DATA",
  data: {
    tmdbId: 533535,
    mediaType: "movie",
    entry: {
      id: 533535,
      type: "movie",
      title: "Deadpool & Wolverine",
      poster: "https://image.tmdb.org/...jpg",
      season: 1,                  // TV only
      episode: 5,                 // TV only
      progress: {
        watched: 352.42,          // seconds watched
        duration: 2667.23,
        lastUpdated: 1746975000000
      },
      lastUpdated: 1746975000000
    }
  }
}
```

### Commands FROM Your Window → Player

Send via `iframe.contentWindow.postMessage()`:

**Get Current Status**:
```javascript
const iframe = document.querySelector("iframe");
iframe.contentWindow.postMessage(
  {
    type: "VIDSYNC_PLAYER_COMMAND",
    action: "getStatus"
  },
  "*"
);
// Returns: VIDSYNC_PLAYER_EVENT with event: "playerstatus"
```

**Get Full Media Data**:
```javascript
iframe.contentWindow.postMessage(
  {
    type: "VIDSYNC_PLAYER_COMMAND",
    action: "getMediaData"
  },
  "*"
);
// Returns: VIDSYNC_MEDIA_DATA with full progress entry
```

### Event Listener (Parent Window)

```javascript
const iframe = document.querySelector("iframe");

window.addEventListener("message", (event) => {
  const message = event.data;
  
  if (!message || typeof message !== "object") return;
  
  // Real-time playback state
  if (message.type === "VIDSYNC_PLAYER_EVENT") {
    const { event: name, currentTime, duration, playing } = message.data;
    console.log(`${name}: ${currentTime}s / ${duration}s`);
    
    // Update custom UI (progress bar, play/pause button, time display, etc.)
  }
  
  // Progress snapshot for backend persistence
  if (message.type === "VIDSYNC_MEDIA_DATA") {
    const entry = message.data.entry;
    console.log(`Save: ${entry.title} - ${entry.progress.watched}s`);
    
    // POST to your backend
    fetch("/api/player-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId: message.data.tmdbId,
        mediaType: message.data.mediaType,
        progress: entry
      })
    });
  }
});
```

---

## Building Custom UI (Stripped Player)

### Architecture

1. Embed Vidsync in hidden/off-screen iframe
2. Listen to `VIDSYNC_PLAYER_EVENT` messages
3. Render your own controls (play/pause button, progress bar, time, volume, subtitles, etc.)
4. Request status/data via `VIDSYNC_PLAYER_COMMAND` when needed
5. Persist progress via `VIDSYNC_MEDIA_DATA` to your backend

### Example: Custom Control Integration

```javascript
const iframe = document.querySelector("iframe");

// Listen for all player events
window.addEventListener("message", (event) => {
  if (event.data.type === "VIDSYNC_PLAYER_EVENT") {
    const { currentTime, duration, event: name, playing } = event.data.data;
    
    // Update progress bar
    const progressPercent = (currentTime / duration) * 100;
    document.querySelector(".progress-bar").style.width = `${progressPercent}%`;
    
    // Update time display
    document.querySelector(".current-time").textContent = formatTime(currentTime);
    document.querySelector(".duration").textContent = formatTime(duration);
    
    // Update play/pause button
    const playBtn = document.querySelector(".play-btn");
    playBtn.textContent = playing ? "⏸ Pause" : "▶ Play";
  }
});

// Custom play/pause button
document.querySelector(".play-btn").addEventListener("click", () => {
  iframe.contentWindow.postMessage(
    { type: "VIDSYNC_PLAYER_COMMAND", action: "getStatus" },
    "*"
  );
});

// Custom progress scrubbing (if building seek capability)
document.querySelector(".progress-bar").addEventListener("click", (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const percent = (e.clientX - rect.left) / rect.width;
  const newTime = percent * duration;
  
  // Vidsync doesn't expose seek command directly via postMessage
  // Option 1: Reload iframe with new startTime parameter
  // Option 2: Build custom video player wrapper around Vidsync
});
```

### Current Limitations

- **No direct playback control**: Vidsync does NOT expose play/pause/seek commands via postMessage
- **Progress is read-only**: Can listen to state changes, cannot trigger them from parent
- **Seek workaround**: Reload iframe with new `startTime` parameter (not seamless)
- **Full custom UI solution**: May require building video player wrapper + using Vidsync source detection (advanced)

### Info Request Pattern

```javascript
// Request current state on demand
function getPlayerStatus() {
  iframe.contentWindow.postMessage(
    { type: "VIDSYNC_PLAYER_COMMAND", action: "getStatus" },
    "*"
  );
  
  // Listen for response (same as event listener above)
  return new Promise((resolve) => {
    const handler = (event) => {
      if (event.data.type === "VIDSYNC_PLAYER_EVENT") {
        window.removeEventListener("message", handler);
        resolve(event.data.data);
      }
    };
    window.addEventListener("message", handler);
    setTimeout(() => window.removeEventListener("message", handler), 5000);
  });
}

// Usage
const status = await getPlayerStatus();
console.log(`Currently at ${status.currentTime}s of ${status.duration}s`);
```

---

## Backend Progress Persistence

### Save Pattern

Store full `VIDSYNC_MEDIA_DATA.entry` or normalize fields:

```javascript
window.addEventListener("message", async (event) => {
  if (event.data.type === "VIDSYNC_MEDIA_DATA") {
    const { tmdbId, mediaType, entry } = event.data.data;
    
    await fetch("/api/player-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId,
        mediaType,
        progress: entry
      })
    });
  }
});
```

### Express Backend Example

```javascript
app.post("/api/player-progress", async (req, res) => {
  const userId = req.user.id;
  const { tmdbId, mediaType, progress } = req.body;
  
  await db.userProgress.upsert({
    where: { userId_tmdbId: { userId, tmdbId } },
    update: {
      mediaType,
      title: progress.title,
      poster: progress.poster,
      season: progress.season ?? null,
      episode: progress.episode ?? null,
      watchedSeconds: progress.progress.watched,
      durationSeconds: progress.progress.duration,
      payloadJson: progress,
      updatedAt: new Date(progress.lastUpdated)
    },
    create: {
      userId,
      tmdbId,
      mediaType,
      title: progress.title,
      poster: progress.poster,
      season: progress.season ?? null,
      episode: progress.episode ?? null,
      watchedSeconds: progress.progress.watched,
      durationSeconds: progress.progress.duration,
      payloadJson: progress,
      updatedAt: new Date(progress.lastUpdated)
    }
  });
  
  res.status(204).end();
});
```

### Load Progress on Start

```javascript
// On page load, check if user has resumed this item
async function loadProgress(tmdbId) {
  const response = await fetch(`/api/player-progress/${tmdbId}`);
  const data = await response.json();
  
  if (data?.watchedSeconds > 0) {
    // Resume from saved position
    const startTime = data.watchedSeconds;
    iframe.src = `https://vidsync.live/embed/movie/${tmdbId}?startTime=${startTime}`;
  }
}
```

---

## Server Status

Real-time monitor: https://vidsync.live

Known servers:
- CINEBOX
- CINEVAULT, CINEVAULT-2 (recommended: ~50ms)
- CINECLOUD
- CINEPLAY, CINEPLAY-2 (often offline)
- CINEDUB, CINEDUB-2
- CINEREADY
- CINEVIP
- CINEVIET

Use `?defaultServer=cinevault` for best median latency.

---

## Feature Support Matrix

| Feature | Movies | TV Shows |
|---------|--------|----------|
| autoPlay | ✓ | ✓ |
| startTime | ✓ | ✓ |
| defaultServer | ✓ | ✓ |
| theme | ✓ | ✓ |
| nextButton | — | ✓ |
| autoNext | — | ✓ |
| VIDSYNC_PLAYER_EVENT | ✓ | ✓ |
| VIDSYNC_MEDIA_DATA | ✓ | ✓ |
| getStatus command | ✓ | ✓ |
| getMediaData command | ✓ | ✓ |

---

## Disclaimer

Vidsync does not host videos. Links only to third-party hosted content.

---

# VidAPI Documentation

**Platform**: https://vaplayer.ru  
**Type**: Video embed player (IMDB + TMDB IDs)  
**Auth**: None required (domain whitelisting optional)  
**Features**: Movies, TV, progress tracking, subtitles, quality selection

---

## Overview

VidAPI embed-first player. IMDB + TMDB IDs. Rich customization (color, subtitles, autoplay). Progress tracking via postMessage. Content listing API + WordPress plugins.

**For Custom UI**: Use `?controls=false&overlay=false&autoPlay=false` to hide native controls. Native keyboard shortcuts (spacebar play/pause, arrow keys seek) still work. Control playback from your app via postMessage or keep `autoPlay=false`.

---

## Movie Embed

```
https://vaplayer.ru/embed/movie/{id}
```

Supports IMDB (with `tt` prefix) or TMDB (numeric only):

**IMDB**:
```html
<iframe src="https://vaplayer.ru/embed/movie/tt23779058"></iframe>
```

**TMDB**:
```html
<iframe src="https://vaplayer.ru/embed/movie/1147301"></iframe>
```

---

## TV Show Embed

```
https://vaplayer.ru/embed/tv/{id}/{season}/{episode}
```

Supports IMDB + TMDB. Multiple format options:

| Format | Example |
|--------|---------|
| Numeric | `/embed/tv/205715/1/1` |
| SxxExx | `/embed/tv/205715/S01E01` |
| Dash | `/embed/tv/205715/1-1` |
| Query | `/embed/tv?tmdb=205715&season=1&episode=1` |

**Examples**:
```html
<!-- TMDB Numeric -->
<iframe src="https://vaplayer.ru/embed/tv/205715/1/1"></iframe>

<!-- IMDB SxxExx -->
<iframe src="https://vaplayer.ru/embed/tv/tt13159924/S01E01"></iframe>
```

---

## Query Parameters

### UI & Colors

| Param | Type | Example |
|-------|------|---------|
| `color` / `primaryColor` | hex | `?color=%23ff0000` |

### Title & Display

| Param | Type | Example |
|-------|------|---------|
| `title` | string | `?title=My%20Movie` |
| `poster` | URL | `?poster=https://...` |
| `showTitle` | boolean | `?showTitle=false` |

### Playback

| Param | Type | Example |
|-------|------|---------|
| `autoplay` | 0/1 | `?autoplay=1` |
| `startAt` | seconds | `?startAt=120` |
| `resumeAt` | seconds | `?resumeAt=300` (alias for startAt) |

**Note**: Browsers may block unmuted autoplay; player falls back to muted with unmute prompt.

### Subtitles

| Param | Type | Example |
|-------|------|---------|
| `sub_url` / `sub_file` | URL | `?sub_url=https%3A%2F%2Fexample.com%2Fsubs.srt` |
| `sub_label` | string | `?sub_label=French` |
| `sub_lang` | ISO 639-1 | `?sub_lang=fr` |
| `sub_default` | boolean | `?sub_default=true` |
| `ds_lang` / `lang` | ISO 639-1 | `?ds_lang=de` (auto-search OpenSubtitles) |

### Player Controls

| Param | Type | Effect |
|-------|------|--------|
| `controls` | boolean | `?controls=false` hides control bar (keyboard shortcuts still work) |
| `overlay` | boolean | `?overlay=false` hides hover gradient + title |
| `thumbnails` | URL | `?thumbnails=https://...` seek bar preview sprite |

**Note**: With `controls=false&overlay=false`, native HTML5 video keyboard shortcuts remain functional (spacebar play/pause, arrow keys seek, etc.) — useful for custom UI integration.

---

## Query Parameter Examples

**Autoplay + resume at 5 minutes**:
```
?autoplay=1&resumeAt=300
```

**With subtitles + German language**:
```
?sub_url=https%3A%2F%2Fexample.com%2Fmovie.srt&ds_lang=de
```

**Full example**:
```
https://vaplayer.ru/embed/movie/tt23779058?primaryColor=%23e50914&title=My%20Movie&lang=en&autoplay=1
```

---

## Player Events (postMessage)

Player sends `PLAYER_EVENT` via postMessage with all state info.

### Event Listener

```javascript
window.addEventListener('message', (event) => {
  if (event.data.type !== 'PLAYER_EVENT') return;
  
  const {
    player_info,      // { imdb, tmdb, mediaType, season, episode, title, poster }
    player_status,    // "playing", "paused", "completed", "seeked"
    player_progress,  // current time in seconds
    player_duration,  // total duration in seconds
    quality,          // { label: "1080p", width: 1920, height: 1080 }
    availableQualities
  } = event.data.data;

  switch (player_status) {
    case 'playing':
      console.log(`${player_progress}s / ${player_duration}s`);
      localStorage.setItem(`progress_${player_info.imdb || player_info.tmdb}`, player_progress);
      break;
    case 'paused':
      console.log('Paused');
      break;
    case 'completed':
      console.log('Video finished');
      break;
    case 'seeked':
      console.log('Seeked to', player_progress);
      break;
  }
});
```

### Save & Restore Progress

```javascript
// Save on playing
window.addEventListener('message', (e) => {
  if (e.data.type !== 'PLAYER_EVENT') return;
  const { player_info, player_status, player_progress } = e.data.data;
  if (player_status === 'playing') {
    const id = player_info.imdb || player_info.tmdb;
    localStorage.setItem(`progress_${id}`, player_progress);
  }
});

// Restore on load
const id = 'tt23779058';
const saved = localStorage.getItem(`progress_${id}`);
const src = `https://vaplayer.ru/embed/movie/${id}${saved ? `?resumeAt=${saved}` : ''}`;
iframe.src = src;
```

### Auto-load Next Episode

```javascript
window.addEventListener('message', (event) => {
  if (event.data.type !== 'PLAYER_EVENT') return;
  if (event.data.data.player_status !== 'completed') return;

  const { tmdb, imdb, season, episode } = event.data.data.player_info;
  const id = tmdb || imdb;
  const nextEp = parseInt(episode) + 1;
  const iframe = document.querySelector('iframe');
  iframe.src = `https://vaplayer.ru/embed/tv/${id}/${season}/${nextEp}`;
});
```

---

## Content Listing API

### Library Stats

```
GET /imdb/api/?action=stats
```

Returns counts of movies, TV shows, episodes, people. Updated every 24 hours.

### Latest Movies

```
GET /movies/latest/page-{PAGE}.json
```

24 results per page. Returns: `tmdb_id`, `imdb_id`, `title`, `year`, `poster_url`, `rating`, `genre`, `embed_url`.

Example:
```
https://vidapi.ru/movies/latest/page-1.json
```

### Latest TV Shows

```
GET /tvshows/latest/page-{PAGE}.json
```

24 results per page.

### Latest Episodes

```
GET /episodes/latest/page-{PAGE}.json
```

24 results per page.

### Content ID Lists

Download plain-text files with all available IDs (updated daily):

```
/ids/movie_list_imdb.txt
/ids/movie_list_tmdb.txt
/ids/tv_list_imdb.txt
/ids/tv_list_tmdb.txt
/ids/eps_list_tmdb.txt
/ids/eps_list_imdb.txt
```

Example:
```
https://vidapi.ru/ids/movie_list_imdb.txt
```

---

## Domain Whitelisting

Configure allowed embed domains in dashboard under **Domains → Allowed Sites**.

- Only whitelisted domains can embed
- CSP `frame-ancestors` enforced automatically
- Referer + Origin validation server-side
- API key required for authenticated requests

---

## WordPress Plugins

Official plugins for popular streaming themes (DooPlay, PsyPlay):

1. Download plugin `.zip` for your theme
2. WordPress Admin → Plugins → Add New → Upload Plugin
3. Activate + enter API key in Settings → VidAPI
4. Auto-replaces sources with VidAPI embed URLs

---

## Feature Support Matrix

| Feature | Movies | TV |
|---------|--------|-----|
| Basic embed | ✓ | ✓ |
| IMDB + TMDB IDs | ✓ | ✓ |
| Color customization | ✓ | ✓ |
| Autoplay | ✓ | ✓ |
| Resume playback | ✓ | ✓ |
| Remote subtitles | ✓ | ✓ |
| Auto-search subtitles | ✓ | ✓ |
| Quality selection | ✓ | ✓ |
| Progress tracking | ✓ | ✓ |
| Netflix overlay | ✓ | ✓ |
| Control bar toggle | ✓ | ✓ |

---

# VidCore API Documentation

**Platform**: https://vidcore.net  
**Type**: Video embed player (IMDB + TMDB IDs)  
**Auth**: None required  
**Features**: Movies, TV, full playback control via postMessage, progress tracking, watch parties

---

## Overview

VidCore embed-first player. IMDB + TMDB IDs. **Full direct playback control** via postMessage (play/pause/seek/volume/mute). Progress tracking. Watch party support. Customizable UI.

**For Custom UI**: Hide controls with `?controls=false&overlay=false`. Use postMessage commands (play, pause, seek, volume, mute, getStatus) to build fully custom UI. Keep `autoPlay=false` and trigger playback from your app.

---

## Movie Embed

```
https://vidcore.net/movie/{id}
```

Supports IMDB (with `tt` prefix) or TMDB (numeric):

```html
<iframe 
  src="https://vidcore.net/movie/tt6263850" 
  width="100%" height="100%" 
  frameborder="0" 
  allowfullscreen 
  allow="encrypted-media"
></iframe>
```

---

## TV Show Embed

```
https://vidcore.net/tv/{id}/{season}/{episode}
```

Example:
```html
<iframe 
  src="https://vidcore.net/tv/1399/1/1" 
  width="100%" height="100%" 
  frameborder="0" 
  allowfullscreen 
  allow="encrypted-media"
></iframe>
```

---

## Responsive Embed (16:9)

```html
<div style="position: relative; padding-bottom: 56.25%; height: 0;">
  <iframe
    src="https://vidcore.net/movie/{id}"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
    frameborder="0"
    allowfullscreen
    allow="encrypted-media"
  ></iframe>
</div>
```

---

## URL Parameters

### Display & UI

| Param | Type | Default | Effect |
|-------|------|---------|--------|
| `title` | boolean | true | Show/hide media title overlay |
| `poster` | boolean | true | Show/hide poster image |
| `theme` | hex | default | Player accent color (no `#`) |
| `fullscreenButton` | boolean | true | Show/hide fullscreen button |
| `chromecast` | boolean | true | Show/hide Chromecast/AirPlay button |
| `hideServer` | boolean | false | Hide server selector button |

### Playback

| Param | Type | Default | Effect |
|-------|------|---------|--------|
| `autoPlay` | boolean | false | Auto-start playback |
| `startAt` | number | 0 | Start at time (seconds) |
| `sub` | string | none | Default subtitle (e.g., `en`, `es`, `fr`) |
| `server` | string | auto | Set default server |

### TV Only

| Param | Type | Default | Effect |
|-------|------|---------|--------|
| `nextButton` | boolean | false | Show next episode button at 90% |
| `autoNext` | boolean | false | Auto-advance to next (requires `nextButton=true`) |

### Examples

**With theme + autoplay + subtitles**:
```
https://vidcore.net/movie/533535?theme=16A085&autoPlay=true&sub=en
```

**Hide server selector**:
```
https://vidcore.net/movie/tt6263850?hideServer=true
```

**TV with next button**:
```
https://vidcore.net/tv/1399/1/1?nextButton=true&autoNext=true
```

---

## PostMessage API (Full Playback Control)

VidCore exposes **direct playback control** via postMessage. Send commands to player, listen for events.

### Commands (Parent → iframe)

**Play**:
```javascript
iframe.contentWindow.postMessage({
  command: 'play'
}, '*');
```

**Pause**:
```javascript
iframe.contentWindow.postMessage({
  command: 'pause'
}, '*');
```

**Seek** (jump to time in seconds):
```javascript
iframe.contentWindow.postMessage({
  command: 'seek',
  time: 120  // Jump to 2 minutes
}, '*');
```

**Volume** (0.0 to 1.0):
```javascript
iframe.contentWindow.postMessage({
  command: 'volume',
  level: 0.5  // Set to 50% volume
}, '*');
```

**Mute**:
```javascript
iframe.contentWindow.postMessage({
  command: 'mute',
  muted: true  // true = mute, false = unmute
}, '*');
```

**Get Status**:
```javascript
iframe.contentWindow.postMessage({
  command: 'getStatus'
}, '*');

// Listen for response
window.addEventListener('message', ({ data }) => {
  if (data.type === 'PLAYER_EVENT' && data.data.event === 'playerstatus') {
    console.log('Current time:', data.data.currentTime);
    console.log('Duration:', data.data.duration);
    console.log('Is playing:', data.data.playing);
    console.log('Is muted:', data.data.muted);
    console.log('Volume:', data.data.volume);
  }
});
```

---

## Events (iframe → Parent)

Player sends events via postMessage. Listen on parent window.

### Event Types

| Event | When |
|-------|------|
| `play` | Playback starts |
| `pause` | Playback paused |
| `seeked` | User seeks |
| `ended` | Video finishes |
| `timeupdate` | Every ~5s during playback |
| `playerstatus` | Response to `getStatus` command |

### Event Structure

```javascript
{
  type: "PLAYER_EVENT",
  data: {
    event: "timeupdate",
    currentTime: 142.5,    // seconds
    duration: 7200,        // seconds
    percent: 0.02,         // 0-1
    playing: true,
    muted: false,
    volume: 1.0,
    mediaId: "tt6263850",  // IMDB or TMDB ID
    mediaType: "movie",    // "movie" or "tv"
    season: null,          // TV only
    episode: null          // TV only
  }
}
```

### Event Listener

```javascript
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://vidcore.net') return;
  
  const { type, data } = event.data;
  
  if (type === 'PLAYER_EVENT') {
    const { event: playerEvent, currentTime, duration, percent } = data;
    
    switch (playerEvent) {
      case 'play':
        console.log('Started playing');
        break;
      case 'pause':
        console.log(`Paused at ${currentTime}s`);
        break;
      case 'timeupdate':
        // Save progress every 10 seconds
        if (Math.floor(currentTime) % 10 === 0) {
          localStorage.setItem(`progress_${data.mediaId}`, JSON.stringify({
            time: currentTime,
            duration: duration,
            percent: percent
          }));
        }
        break;
      case 'ended':
        console.log('Video finished');
        break;
      case 'seeked':
        console.log(`Seeked to ${currentTime}s`);
        break;
    }
  }
});
```

---

## Watch Party Integration

Full control enables synchronized playback across multiple users.

```javascript
class WatchPartyController {
  constructor(iframeElement) {
    this.iframe = iframeElement;
    this.setupEventListeners();
  }

  // Sync play to all participants
  syncPlay(time) {
    this.iframe.contentWindow.postMessage({
      command: 'play'
    }, '*');
    
    this.broadcastToParty({
      action: 'play',
      time: time
    });
  }

  // Sync pause
  syncPause(time) {
    this.iframe.contentWindow.postMessage({
      command: 'pause'
    }, '*');
    
    this.broadcastToParty({
      action: 'pause',
      time: time
    });
  }

  // Sync seek
  syncSeek(time) {
    this.iframe.contentWindow.postMessage({
      command: 'seek',
      time: time
    }, '*');
    
    this.broadcastToParty({
      action: 'seek',
      time: time
    });
  }

  // Handle incoming commands from other party members
  handlePartyCommand(command) {
    switch (command.action) {
      case 'play':
        this.iframe.contentWindow.postMessage({ command: 'play' }, '*');
        break;
      case 'pause':
        this.iframe.contentWindow.postMessage({ command: 'pause' }, '*');
        break;
      case 'seek':
        this.iframe.contentWindow.postMessage({
          command: 'seek',
          time: command.time
        }, '*');
        break;
    }
  }

  broadcastToParty(command) {
    // WebSocket, Socket.IO, or your sync mechanism
    fetch('/api/party-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });
  }

  setupEventListeners() {
    window.addEventListener('message', (event) => {
      if (event.origin !== 'https://vidcore.net' || !event.data) return;
      
      if (event.data.type === 'PLAYER_EVENT') {
        const { event: playerEvent, currentTime } = event.data.data;
        
        // Sync player events to party
        switch (playerEvent) {
          case 'play':
            this.syncPlay(currentTime);
            break;
          case 'pause':
            this.syncPause(currentTime);
            break;
          case 'seeked':
            this.syncSeek(currentTime);
            break;
        }
      }
    });
  }
}

// Usage
const iframe = document.querySelector('iframe');
const watchParty = new WatchPartyController(iframe);
```

---

## Save & Restore Progress

```javascript
// Save progress on timeupdate
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://vidcore.net') return;
  
  const { type, data } = event.data;
  if (type === 'PLAYER_EVENT' && data.event === 'timeupdate') {
    const { mediaId, currentTime, duration } = data;
    localStorage.setItem(`progress_${mediaId}`, JSON.stringify({
      time: currentTime,
      duration: duration
    }));
  }
});

// Restore progress on load
const mediaId = 'tt6263850';
const saved = localStorage.getItem(`progress_${mediaId}`);
const startAt = saved ? JSON.parse(saved).time : 0;
iframe.src = `https://vidcore.net/movie/${mediaId}?startAt=${startAt}`;
```

---

## Feature Support Matrix

| Feature | Movies | TV |
|---------|--------|-----|
| Basic embed | ✓ | ✓ |
| IMDB + TMDB IDs | ✓ | ✓ |
| Theme customization | ✓ | ✓ |
| Autoplay | ✓ | ✓ |
| Resume playback | ✓ | ✓ |
| Subtitles | ✓ | ✓ |
| Progress tracking | ✓ | ✓ |
| **Play command** | ✓ | ✓ |
| **Pause command** | ✓ | ✓ |
| **Seek command** | ✓ | ✓ |
| **Volume command** | ✓ | ✓ |
| **Mute command** | ✓ | ✓ |
| **getStatus command** | ✓ | ✓ |
| Next episode button | — | ✓ |
| Auto-next episode | — | ✓ |
| Watch party sync | ✓ | ✓ |

---

## Comparison: All Players

| Feature | Vidsync | VIDEASY | VidAPI | VidCore |
|---------|---------|---------|--------|---------|
| TMDB IDs | ✓ | ✓ | ✓ | ✓ |
| IMDB IDs | — | — | ✓ | ✓ |
| Anime (AniList) | — | ✓ | — | — |
| Progress tracking | Built-in | postMessage | postMessage | postMessage |
| **postMessage API** | **Read-only** | **Read-only** | **Read-only** | **Full control** |
| **Direct play/pause/seek** | **—** | **—** | **—** | **✓** |
| **Volume/mute control** | **—** | **—** | **—** | **✓** |
| **getStatus/getMediaData** | **✓ (read)** | **—** | **✓ (read)** | **✓ (read+control)** |
| Remote subtitles | — | — | ✓ | ✓ |
| Auto-search subtitles | — | — | ✓ | — |
| Quality control | — | — | ✓ | — |
| Watch party native | — | — | — | ✓ |
| Custom UI control | Limited | Limited | postMessage | **Full** |

**Key Difference**: 
- **Vidsync**: postMessage for listening + status queries (read-only state)
- **VidCore**: postMessage for full playback control (play/pause/seek/volume/mute)

---

# VIDEASY API Documentation

**Platform**: https://player.videasy.net  
**Type**: Embed player (TMDB + AniList IDs)  
**Auth**: None required  
**Features**: Movies, TV, Anime (subbed/dubbed)

---

## Overview

VIDEASY embed-first player. TMDB IDs (movies/TV). AniList IDs (anime). Auto-provides subs + dubs. Watch progress tracking via postMessage.

**For Custom UI**: Listen to progress events via postMessage (read-only state). Keep `autoPlay=false` and control playback from your app.

---

## URL Structure

### Movies

```
https://player.videasy.net/movie/{movie_id}
```

Example (Avengers: Endgame, TMDB 299534):
```html
<iframe src="https://player.videasy.net/movie/299534"></iframe>
```

### TV Shows

```
https://player.videasy.net/tv/{show_id}/{season}/{episode}
```

Example (Game of Thrones S01E01, TMDB 1399):
```html
<iframe src="https://player.videasy.net/tv/1399/1/1"></iframe>
```

### Anime Shows

```
https://player.videasy.net/anime/{anilist_id}/{episode}
```

Example (One Piece EP01, AniList 21):
```html
<iframe src="https://player.videasy.net/anime/21/1"></iframe>
```

### Anime Movies

```
https://player.videasy.net/anime/{anilist_id}
```

Example (THE FIRST SLAM DUNK, AniList 145139):
```html
<iframe src="https://player.videasy.net/anime/145139"></iframe>
```

**Note**: Player auto-provides subbed + dubbed versions when available.

---

## Integration

### Basic Implementation

```html
<iframe
  src="https://player.videasy.net/movie/299534"
  width="100%"
  height="100%"
  frameborder="0"
  allowfullscreen
  allow="encrypted-media"
></iframe>
```

### Responsive (16:9 Aspect Ratio)

```html
<!-- 16:9 Aspect Ratio Container -->
<div style="position: relative; padding-bottom: 56.25%; height: 0;">
  <iframe
    src="https://player.videasy.net/movie/299534"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
    frameborder="0"
    allowfullscreen
    allow="encrypted-media"
  ></iframe>
</div>
```

---

## Customization

### Color Theme

Hex color without `#` symbol:

```
?color=8B5CF6     // Purple
?color=3B82F6     // Blue
?color=FF6B6B     // Red
```

Example:
```html
<iframe src="https://player.videasy.net/movie/299534?color=8B5CF6"></iframe>
```

### Player Features

| Parameter | Type | Effect | Example |
|-----------|------|--------|---------|
| `progress` | number | Start time in seconds | `?progress=120` (starts at 2 min) |
| `nextEpisode` | boolean | Show next episode button | `?nextEpisode=true` |
| `episodeSelector` | boolean | Built-in season/episode selector | `?episodeSelector=true` |
| `autoplayNextEpisode` | boolean | Auto-play next when current ends | `?autoplayNextEpisode=true` |
| `overlay` | boolean | Netflix-style overlay (5s pause) | `?overlay=true` |
| `color` | hex | Player accent color | `?color=8B5CF6` |

### Combined Example

```html
<iframe src="https://player.videasy.net/tv/1399/1/1?nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&overlay=true&color=8B5CF6"></iframe>
```

---

## Watch Progress Tracking

Player sends progress events via postMessage to parent window.

### Event Listener

```javascript
window.addEventListener("message", (event) => {
  if (typeof event.data === "string") {
    const progress = JSON.parse(event.data);
    console.log("Progress:", progress);
    
    // Save to backend
    fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progress)
    });
  }
});
```

### Progress Payload

```javascript
{
  id: 299534,                    // Content ID
  type: "movie" | "tv" | "anime",
  progress: 45.5,                // Watch progress percentage
  timestamp: 120,                // Current playback position (seconds)
  duration: 9180,                // Total duration (seconds)
  season: 1,                     // TV/Anime only
  episode: 5                     // TV/Anime only
}
```

---

## Finding Content IDs

### TMDB IDs (Movies & TV)

Get from [TMDB Developer](https://developer.themoviedb.org) or URL:

```
Movies:  https://themoviedb.org/movie/{id}
TV:      https://themoviedb.org/tv/{id}
```

Example: themoviedb.org/movie/**299534** (Avengers: Endgame)

### AniList IDs (Anime)

Get from [AniList API](https://docs.anilist.co) or URL:

```
Anime: https://anilist.co/anime/{id}
```

Example: anilist.co/anime/**21** (One Piece)

---

## Feature Support Matrix

| Feature | Movies | TV | Anime |
|---------|--------|----|----|
| Basic embed | ✓ | ✓ | ✓ |
| Color theme | ✓ | ✓ | ✓ |
| Progress start | ✓ | ✓ | ✓ |
| Next episode button | — | ✓ | ✓ |
| Episode selector | — | ✓ | ✓ |
| Autoplay next | — | ✓ | ✓ |
| Netflix overlay | ✓ | ✓ | ✓ |
| Sub/dub auto | ✓ | ✓ | ✓ |
| Progress tracking | ✓ | ✓ | ✓ |