# 🎬 Stremio Dynamic Catalog Addon

AI-powered Netflix-style catalogs that change daily, personalized to your viewing history.

Uses **Gemini** to generate creative catalog themes and **TMDB** to populate them with real movies/series. Your Netflix history shapes the recommendations — catalogs like *"Visually-Striking Family Sci-Fi"*, *"Watch-Party Picks"*, or *"Mind-Bending Thrillers You Haven't Seen"* refresh every day.

## How It Works

```
Netflix CSV → Gemini (profile) → saved once
                                      ↓
                  Daily: Gemini generates 20 catalog themes
                                      ↓
                  TMDB populates each with matching movies
                                      ↓
                  Stremio serves fresh catalogs each day
```

**Gemini usage:** ~2-3K tokens/day (one API call). Essentially free.
**TMDB usage:** ~400 calls/day at refresh time (free tier allows 1M/month).

## Setup

### 1. Get API Keys

- **Gemini:** https://aistudio.google.com/apikey (free tier is plenty)
- **TMDB:** https://www.themoviedb.org/settings/api (free)

### 2. Install & Configure

```bash
git clone <your-repo>
cd stremio-dynamic-catalog
npm install
cp .env.example .env
# Edit .env with your API keys
```

### 3. Download Netflix History

Go to https://www.netflix.com/account/getmyinfo → request your data.
You'll get a CSV file with your viewing history.

### 4. Generate Your Profile

```bash
node setup.js path/to/NetflixViewingHistory.csv
```

This analyzes your viewing patterns and saves a profile to `data/profile.json`.

### 5. Run

```bash
npm start
```

On first start, it generates today's catalogs (takes a few minutes due to TMDB lookups).

### 6. Add to Stremio

Open Stremio → Addons → paste:
```
http://YOUR_IP:7000/manifest.json
```

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /manifest.json` | Stremio addon manifest (dynamic catalog names) |
| `GET /catalog/:type/:id.json` | Catalog content |
| `GET /status` | Current catalogs and last refresh time |
| `POST /refresh?force=true` | Trigger manual refresh |

## Deploy to GCP

### Option A: Compute Engine (simplest)

```bash
# SSH into your GCP VM
sudo apt update && sudo apt install -y nodejs npm

# Clone and setup
git clone <repo> && cd stremio-dynamic-catalog
npm install
cp .env.example .env && nano .env  # add keys, set PUBLIC_URL

# Run setup
node setup.js path/to/netflix.csv

# Run with pm2 for persistence
npm install -g pm2
pm2 start server.js --name stremio-catalog
pm2 save
pm2 startup
```

### Option B: Cloud Run

```bash
# Build and push
gcloud builds submit --tag gcr.io/YOUR_PROJECT/stremio-catalog

# Deploy (mount a volume or use Cloud Storage for data/)
gcloud run deploy stremio-catalog \
  --image gcr.io/YOUR_PROJECT/stremio-catalog \
  --port 7000 \
  --allow-unauthenticated \
  --set-env-vars="GEMINI_API_KEY=xxx,TMDB_API_KEY=xxx"
```

> **Note:** Cloud Run is stateless. You'll need to persist `data/` via Cloud Storage
> or a mounted volume. Compute Engine is simpler for this use case.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | Your Gemini API key |
| `TMDB_API_KEY` | — | Your TMDB API key |
| `PORT` | 7000 | Server port |
| `PUBLIC_URL` | localhost:7000 | Public URL for Stremio |
| `REFRESH_HOUR` | 4 | Daily refresh hour (24h) |
| `CATALOG_COUNT` | 20 | Number of catalogs to generate |
| `MOVIES_PER_CATALOG` | 20 | Items per catalog |

## Customizing

- **Edit `data/profile.json`** to tweak your taste profile manually
- **Change catalog count** via `CATALOG_COUNT` env var
- **Force refresh:** `curl -X POST http://localhost:7000/refresh?force=true`
- **Add genres** in `src/constants.js` if Gemini suggests new ones
