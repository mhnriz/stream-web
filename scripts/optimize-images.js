/**
 * StreamApp v1.3.0 — Image Optimizer
 *
 * Generates WebP + JPEG fallbacks at three responsive sizes for every
 * LOCAL image dropped into public/images/raw/.
 *
 *   poster sizes:  320px (-m)  500px (-t)  800px (default)
 *   hero sizes:    600px (-m) 1000px (-t) 1400px (default)
 *   quality:       WebP 85 · JPEG 80
 *
 * Output: public/images/posters/  and  public/images/heroes/
 * Name a file  something.hero.jpg  to route it to hero sizes;
 * everything else is treated as a poster.
 *
 * NOTE ── TMDB artwork is NOT processed here. Posters/backdrops served
 * from image.tmdb.org are already resized by TMDB's CDN; the frontend
 * requests the right variant per breakpoint via srcset (see
 * renderResponsiveImage() in public/js/components.js). This script is
 * for self-hosted assets only (logos, custom heroes, placeholders).
 *
 * Setup:   npm install sharp --save-dev
 * Usage:   npm run optimize-images
 */

const fs = require('fs');
const path = require('path');

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error(
    '✗ sharp is not installed.\n' +
    '  Run:  npm install sharp --save-dev\n' +
    '  Then: npm run optimize-images'
  );
  process.exit(1);
}

const RAW_DIR = path.join(__dirname, '..', 'public', 'images', 'raw');
const POSTER_DIR = path.join(__dirname, '..', 'public', 'images', 'posters');
const HERO_DIR = path.join(__dirname, '..', 'public', 'images', 'heroes');

const POSTER_SIZES = [
  { width: 320, suffix: '-m' },   // small phones
  { width: 500, suffix: '-t' },   // tablets / large phones
  { width: 800, suffix: '' },     // desktop
];

const HERO_SIZES = [
  { width: 600, suffix: '-m' },
  { width: 1000, suffix: '-t' },
  { width: 1400, suffix: '' },
];

const WEBP_QUALITY = 85;
const JPEG_QUALITY = 80;
const VALID_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

async function optimizeImage(inputPath, outputDir, sizes) {
  const parsed = path.parse(inputPath);
  // strip the routing marker (.hero) from the output basename
  const filename = parsed.name.replace(/\.hero$/i, '');
  const inputBytes = fs.statSync(inputPath).size;
  let totalOut = 0;

  for (const { width, suffix } of sizes) {
    const base = path.join(outputDir, `${filename}${suffix}`);

    await sharp(inputPath)
      .resize(width, null, { withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(`${base}.webp`);

    await sharp(inputPath)
      .resize(width, null, { withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(`${base}.jpg`);

    totalOut += fs.statSync(`${base}.webp`).size;
    console.log(`  ✓ ${filename}${suffix}.{webp,jpg} (${width}px)`);
  }

  const smallest = fs.statSync(
    path.join(outputDir, `${filename}-m.webp`)
  ).size;
  const reduction = inputBytes > 0
    ? Math.round((1 - smallest / inputBytes) * 100)
    : 0;
  console.log(
    `  → ${kb(inputBytes)} source → ${kb(smallest)} mobile WebP ` +
    `(${reduction}% smaller)`
  );
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

async function main() {
  // Ensure directories exist
  for (const dir of [RAW_DIR, POSTER_DIR, HERO_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const files = fs.readdirSync(RAW_DIR)
    .filter(f => VALID_EXT.has(path.extname(f).toLowerCase()));

  if (files.length === 0) {
    console.log(
      `No images found in ${path.relative(process.cwd(), RAW_DIR)}/\n` +
      'Drop .jpg/.png files there and re-run. ' +
      'Use "name.hero.jpg" for hero-sized output.'
    );
    return;
  }

  console.log(`Optimizing ${files.length} image(s)…\n`);

  for (const file of files) {
    const isHero = /\.hero\.[^.]+$/i.test(file);
    console.log(`${file} ${isHero ? '(hero)' : '(poster)'}`);
    await optimizeImage(
      path.join(RAW_DIR, file),
      isHero ? HERO_DIR : POSTER_DIR,
      isHero ? HERO_SIZES : POSTER_SIZES
    );
    console.log('');
  }

  console.log('Done. Remember to purge the Cloudflare cache for /images/*');
}

main().catch(err => {
  console.error('✗ Optimization failed:', err.message);
  process.exit(1);
});
