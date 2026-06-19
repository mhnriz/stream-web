const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

function save(filename, data) {
  ensureDataDir();
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

module.exports = {
  loadProfile: () => load('profile.json'),
  saveProfile: (data) => save('profile.json', data),

  loadCatalogs: () => load('catalogs.json'),
  saveCatalogs: (data) => save('catalogs.json', data),

  // Track last refresh date to avoid redundant refreshes
  getLastRefresh: () => {
    const meta = load('meta.json');
    return meta?.lastRefresh || null;
  },
  setLastRefresh: (date) => {
    const meta = load('meta.json') || {};
    meta.lastRefresh = date;
    save('meta.json', meta);
  },
};
