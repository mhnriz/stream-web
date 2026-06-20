#!/usr/bin/env bash

ROOT="$(cd "$(dirname "$0")" && pwd)"
CATALOG="$ROOT/dynamic-catalog"
LOG="$ROOT/test.log"

CATALOG_PID=""
APP_PID=""
MONITOR_PID=""

# ── Kill any existing processes on our ports ────────────────────
echo "[dev] Clearing ports 3000 and 7001..."
lsof -ti:3000,7001 | xargs kill -9 2>/dev/null || true
sleep 1

# ── Preflight checks ────────────────────────────────────────────
if [ ! -f "$ROOT/.env" ]; then
  echo "[dev] ERROR: $ROOT/.env missing — copy .env.example and fill in keys"; exit 1
fi
if [ ! -f "$CATALOG/.env" ]; then
  echo "[dev] ERROR: $CATALOG/.env missing — copy .env.example and fill in keys"; exit 1
fi

# ── Install deps if needed ─────────────────────────────────────
if [ ! -d "$ROOT/node_modules" ]; then
  echo "[dev] Installing main app deps..."
  cd "$ROOT" && npm install 2>&1 | tee -a "$LOG"
fi
if [ ! -d "$CATALOG/node_modules" ]; then
  echo "[dev] Installing catalog deps..."
  cd "$CATALOG" && npm install 2>&1 | tee -a "$LOG"
fi

# ── First-run: generate taste profile ──────────────────────────
if [ ! -f "$CATALOG/data/profile.json" ]; then
  echo "[dev] No profile found — running setup..."
  cd "$CATALOG" && node setup.js netflix.csv 2>&1 | tee -a "$LOG"
fi

# ── Start both servers ──────────────────────────────────────────
truncate -s 0 "$LOG"
echo "[dev] Logging to $LOG"
echo "[dev] Starting catalog on :7001 and app on :3000"
echo "[dev] Press Ctrl+C to stop"
echo ""

cleanup() {
  echo ""
  echo "[dev] Shutting down..."
  [ -n "$MONITOR_PID" ] && kill "$MONITOR_PID" 2>/dev/null || true
  [ -n "$CATALOG_PID" ] && kill "$CATALOG_PID" 2>/dev/null || true
  [ -n "$APP_PID" ]     && kill "$APP_PID"     2>/dev/null || true
  wait 2>/dev/null || true
  echo "[dev] Done. Logs at $LOG"
  exit 0
}
trap cleanup INT TERM

# Use process substitution so $! captures the node PID, not the tee PID
cd "$CATALOG"
node server.js > >(sed 's/^/[catalog] /' | tee -a "$LOG") 2>&1 &
CATALOG_PID=$!

cd "$ROOT"
node --watch server.js > >(sed 's/^/[app]     /' | tee -a "$LOG") 2>&1 &
APP_PID=$!

# Monitor — warn once if a server dies, then stop watching that one
(
  while true; do
    sleep 5
    if [ -n "$CATALOG_PID" ] && ! kill -0 "$CATALOG_PID" 2>/dev/null; then
      echo "[dev] WARNING: catalog server died — check $LOG"
      CATALOG_PID=""
    fi
    if [ -n "$APP_PID" ] && ! kill -0 "$APP_PID" 2>/dev/null; then
      echo "[dev] WARNING: app server died — check $LOG"
      APP_PID=""
    fi
  done
) &
MONITOR_PID=$!

wait "$CATALOG_PID" "$APP_PID" 2>/dev/null || true
