# StreamApp

A self-hosted streaming platform. Browse and watch movies and series via your own TorBox account and Stremio addon sources, with TMDB metadata, subtitles, a mobile-first UI, and a configurable app name.

---

## Services

This repo contains **two services** that work together. Run both for the full experience, or run StreamApp alone if you already have a Stremio catalog source.

| Service | Directory | Default Port | Purpose |
|---|---|---|---|
| **StreamApp** | `/` (root) | `3000` | Main web app — player, search, metadata, watchlist |
| **Dynamic Catalog** | `dynamic-catalog/` | `7000` | Stremio addon — AI-generated daily catalogs from Netflix history |

StreamApp reads catalog content from the Dynamic Catalog service via `CATALOG_URL`. They communicate over HTTP — StreamApp does not know catalog internals.

---

## Requirements

- Node.js 18+
- [TorBox account + API key](https://torbox.app) — debrid/torrent caching (paid service)
- [TMDB API key](https://www.themoviedb.org/settings/api) — free
- Stremio addon URLs — configure at [Torrentio](https://torrentio.strem.fun/configure) and/or [Comet](https://comet.elfhosted.com/configure)
- *(Dynamic Catalog only)* [Google Gemini API key](https://aistudio.google.com/apikey) — free tier

---

## Local Setup

### StreamApp

```bash
git clone <your-repo-url>
cd streamapp
npm install
cp .env.example .env
```

Edit `.env` and fill in your keys:

```env
APP_NAME=MyStream          # shown in title bar, top bar, splash
TORBOX_API_KEY=...
TMDB_API_KEY=...
TORRENTIO_URL=...          # paste your configured Torrentio URL
CATALOG_URL=http://localhost:7000   # point at Dynamic Catalog if running it
```

```bash
npm start
# → http://localhost:3000
```

---

### Dynamic Catalog

A separate service that generates AI-powered daily catalogs based on your Netflix viewing history. StreamApp displays these as browseable rows on the home page.

```bash
cd dynamic-catalog
npm install
cp .env.example .env
```

Edit `.env`:

```env
GEMINI_API_KEY=...
TMDB_API_KEY=...
PUBLIC_URL=http://localhost:7000   # or your server's public URL
```

#### Netflix history CSV

The setup script analyzes your Netflix viewing history to build a taste profile that shapes daily catalog themes.

**Don't have your own?** A sample `netflix.csv` is included in `dynamic-catalog/`. It works out of the box for testing.

**Using your own:** Go to [netflix.com/account/getmyinfo](https://www.netflix.com/account/getmyinfo), request your data, and download the `NetflixViewingHistory.csv` file.

```bash
# Generate your taste profile (run once, or re-run to update)
node setup.js netflix.csv           # use included sample
node setup.js /path/to/your.csv    # or your own file

# Start the service
npm start
# → http://localhost:7000/manifest.json
```

On first start, catalogs are generated automatically (takes ~1–2 minutes for TMDB lookups). Refresh daily via cron or manually:

```bash
curl -X POST http://localhost:7000/refresh?force=true
```

---

## Environment Variables

### StreamApp (`.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_NAME` | No | `StreamApp` | Display name in UI — title bar, top bar, splash screen |
| `TORBOX_API_KEY` | Yes | — | TorBox API key |
| `TMDB_API_KEY` | Yes | — | TMDB metadata API key |
| `CATALOG_URL` | No | `http://localhost:7000` | URL of your Dynamic Catalog service |
| `TORRENTIO_URL` | No | — | Configured Torrentio addon URL |
| `COMET_URL` | No | — | Configured Comet addon URL |
| `OPENSUBTITLES_API_KEY` | No | — | OpenSubtitles.com API key for primary subtitles |
| `PORT` | No | `3000` | Server port |

### Dynamic Catalog (`dynamic-catalog/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key |
| `TMDB_API_KEY` | Yes | — | TMDB API key |
| `PUBLIC_URL` | Yes | `http://localhost:7000` | Public URL Stremio uses to reach this service |
| `CATALOG_COUNT` | No | `20` | Number of daily catalogs to generate |
| `MOVIES_PER_CATALOG` | No | `20` | Items per catalog |
| `REFRESH_HOUR` | No | `4` | Daily refresh hour (0–23, server timezone) |
| `PORT` | No | `7000` | Server port |

---

## Deploying to GCP (Recommended)

GCP Compute Engine is the simplest path — a single VM runs both services, persists data across restarts, and gives you a stable IP for Stremio addons.

### 1. Create VM

```bash
gcloud compute instances create streamapp \
  --zone=asia-southeast1-b \
  --machine-type=e2-micro \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --tags=http-server,https-server
```

> `e2-micro` is in the GCP free tier. Pick a zone close to you.

### 2. Open firewall ports

```bash
gcloud compute firewall-rules create allow-streamapp \
  --allow tcp:3000,tcp:7000 \
  --target-tags=http-server
```

### 3. SSH in and install Node.js

```bash
gcloud compute ssh streamapp
sudo apt update && sudo apt install -y git

# Install Node.js 20 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm use 20 && nvm alias default 20
```

### 4. Deploy StreamApp

```bash
git clone <your-repo-url> streamapp
cd streamapp
npm install
cp .env.example .env && nano .env   # fill in keys

npm install -g pm2
pm2 start server.js --name streamapp
pm2 save && pm2 startup
```

### 5. Deploy Dynamic Catalog

```bash
cd ~/streamapp/dynamic-catalog
npm install
cp .env.example .env && nano .env
# Set PUBLIC_URL=http://YOUR_VM_EXTERNAL_IP:7000

# Upload your own Netflix CSV if you have one:
#   gcloud compute scp NetflixViewingHistory.csv streamapp:~/streamapp/dynamic-catalog/my.csv
#   node setup.js my.csv
# Or use the included sample:
node setup.js netflix.csv

pm2 start server.js --name dynamic-catalog
pm2 save
```

### 6. Point StreamApp at the catalog

In `~/streamapp/.env`:
```env
CATALOG_URL=http://localhost:7000
```

```bash
pm2 restart streamapp
```

### 7. Optional — Custom domain + HTTPS with Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

`/etc/caddy/Caddyfile`:
```
stream.yourdomain.com {
    reverse_proxy localhost:3000
}

catalogs.yourdomain.com {
    reverse_proxy localhost:7000
}
```

Update `PUBLIC_URL=https://catalogs.yourdomain.com` in the catalog `.env`, then `pm2 restart dynamic-catalog`.

---

## Features

- Mobile-first responsive UI (5 breakpoints, bottom nav on mobile, desktop sidebar)
- Video player — HLS/MP4, subtitles, keyboard shortcuts, touch gestures (swipe seek, volume, brightness)
- TMDB metadata — cast, trailers, content ratings, similar titles
- Smart stream sorting — cached-first, quality-ranked, browser-compatible codec detection
- Watchlist and continue watching (server-persisted)
- Incognito mode — watch history stays in memory only, never reaches the server
- Dark / light theme (WCAG AA contrast, system preference detection, no-FOUC)
- Subtitles — OpenSubtitles.com primary + Stremio fallback, SRT→VTT, timestamp offset control
- AI-powered daily catalogs via Dynamic Catalog service (Gemini + Netflix history)

---

## Legal Disclosure

> **Read before deploying or sharing this software.**

This software is a **personal self-hosted web interface**. It does not host, store, distribute, or transmit any copyrighted content. It acts as a client that communicates with third-party services you configure yourself (TorBox, Torrentio, Comet, TMDB, OpenSubtitles).

**You are solely responsible** for how you use this software and for ensuring your use complies with the laws of your jurisdiction, including copyright law. The author(s) of this software:

- Do not endorse or facilitate copyright infringement
- Are not affiliated with TorBox, TMDB, Torrentio, Comet, OpenSubtitles, or any other third-party service
- Provide this software as-is, for personal and educational use only
- Accept no liability for your use of this software or the third-party services it connects to

Third-party services have their own terms of service. Using a debrid service to stream torrented content may be illegal in your country. Consult a lawyer if unsure.

This project is provided under the **MIT License** for the source code only. The MIT License does not grant any rights to stream, reproduce, or distribute copyrighted works.

---

## Acknowledgements

- [TMDB](https://www.themoviedb.org) — movie and series metadata
- [TorBox](https://torbox.app) — torrent caching and delivery
- [Torrentio](https://torrentio.strem.fun) / [Comet](https://comet.elfhosted.com) — Stremio stream addons
- [OpenSubtitles](https://opensubtitles.com) — subtitle search
- [Google Gemini](https://aistudio.google.com) — AI catalog generation
