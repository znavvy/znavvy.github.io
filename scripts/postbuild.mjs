/**
 * postbuild.mjs — Astro post-build step for permalink & asset compatibility.
 *
 * 1. For each static product page at dist/product/[id]/index.html:
 *    Copies it to dist/product/[id].html to maintain 100% backward
 *    compatibility with legacy github_pages URLs (/product/[id].html).
 * 2. Ensures /og-preview.png and /api/og-preview.png exist in dist.
 * 3. Verifies that dist/ does NOT contain any synthetic benchmark files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PROD_DIR = path.join(DIST, 'product');

if (!fs.existsSync(DIST)) {
  console.log('[postbuild] dist/ not found, skipping');
  process.exit(0);
}

// 1. Copy dist/product/[id]/index.html -> dist/product/[id].html
let compatCount = 0;
if (fs.existsSync(PROD_DIR)) {
  const entries = fs.readdirSync(PROD_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const src = path.join(PROD_DIR, entry.name, 'index.html');
      const dst = path.join(PROD_DIR, `${entry.name}.html`);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        compatCount++;
      }
    }
  }
}
console.log(`[postbuild] Generated ${compatCount} backward-compatible .html product permalinks in dist/product/`);

// 2. Ensure dual OG image locations exist in dist
const ogDist1 = path.join(DIST, 'og-preview.png');
const ogDist2 = path.join(DIST, 'api', 'og-preview.png');

if (fs.existsSync(ogDist1) && !fs.existsSync(ogDist2)) {
  fs.mkdirSync(path.dirname(ogDist2), { recursive: true });
  fs.copyFileSync(ogDist1, ogDist2);
  console.log('[postbuild] Synchronized dist/api/og-preview.png');
} else if (fs.existsSync(ogDist2) && !fs.existsSync(ogDist1)) {
  fs.copyFileSync(ogDist2, ogDist1);
  console.log('[postbuild] Synchronized dist/og-preview.png');
}

// 3. Verify synthetic fixtures are NOT in dist
const synthDist = path.join(DIST, 'api', 'synthetic');
if (fs.existsSync(synthDist)) {
  console.error('[postbuild] ERROR: dist/api/synthetic found in production dist! Removing...');
  fs.rmSync(synthDist, { recursive: true, force: true });
} else {
  console.log('[postbuild] Clean production dist confirmed: 0 synthetic fixtures');
}
