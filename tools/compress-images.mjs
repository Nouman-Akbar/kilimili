// Bulk-compress store images before re-uploading them to Shopify
// (Content > Files, or directly on each product).
//
// Setup (one time, inside this tools folder):
//   cd tools && npm init -y && npm i sharp
//
// Usage:
//   node compress-images.mjs <input-folder> [output-folder]
//   node compress-images.mjs urls.txt [output-folder]
//   node compress-images.mjs C:\Users\me\originals C:\Users\me\compressed
//
// Accepts either a folder of images or a .txt file with one CDN image URL
// per line (the original Shopify URL without size params is downloaded).
// Every image is resized to fit within 2048px on the longest edge and
// re-encoded as JPEG (photos) at quality 82 — the CDN then auto-serves it
// as WebP to capable browsers. PNGs are kept as PNG only if they contain
// real transparency (alpha channel in use).
// Originals are never modified — results land in <output-folder>
// (default: <input>\compressed or .\compressed for a URL list).

import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';

const MAX_EDGE = 2048;
const QUALITY = 82;
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

const input = process.argv[2];
if (!input) {
  console.error('Usage: node compress-images.mjs <input-folder|urls.txt> [output-folder]');
  process.exit(1);
}
const inputStat = await stat(input).catch(() => null);
if (!inputStat) {
  console.error(`Not found: ${input}`);
  process.exit(1);
}

const isUrlList = inputStat.isFile() && input.toLowerCase().endsWith('.txt');
const outputDir = process.argv[3] || path.join(isUrlList ? process.cwd() : input, 'compressed');
await mkdir(outputDir, { recursive: true });

// Collect inputs as { name, getBuffer }
let sources = [];
if (isUrlList) {
  const urls = (await readFile(input, 'utf8'))
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('http'));
  // dedupe by filename (srcset lists repeat the same file at different widths)
  const seen = new Set();
  for (const url of urls) {
    const u = new URL(url);
    u.searchParams.delete('width');
    u.searchParams.delete('height');
    u.searchParams.delete('format');
    const name = decodeURIComponent(u.pathname.split('/').pop());
    if (seen.has(name)) continue;
    seen.add(name);
    const cleanUrl = u.toString();
    sources.push({
      name,
      getBuffer: async () => {
        const res = await fetch(cleanUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      },
    });
  }
} else {
  const files = (await readdir(input)).filter((f) => EXTENSIONS.has(path.extname(f).toLowerCase()));
  for (const file of files) {
    const src = path.join(input, file);
    sources.push({ name: file, getBuffer: () => readFile(src) });
  }
}

if (sources.length === 0) {
  console.log('No images found.');
  process.exit(0);
}
console.log(`Processing ${sources.length} images...\n`);

let totalBefore = 0;
let totalAfter = 0;
let failed = 0;

for (const source of sources) {
  try {
    const buf = await source.getBuffer();
    const before = buf.length;

    const img = sharp(buf).rotate(); // respect EXIF orientation
    const meta = await img.metadata();

    const pipeline = img.resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });

    // Keep PNG only when real transparency is used; JPEG compresses photos far better.
    let outName = path.basename(source.name, path.extname(source.name));
    let out;
    if (meta.hasAlpha && meta.format === 'png') {
      const stats = await sharp(buf).stats();
      const alphaUsed = stats.channels.length === 4 && stats.channels[3].min < 255;
      if (alphaUsed) {
        out = await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer();
        outName += '.png';
      }
    }
    if (!out) {
      out = await pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
      outName += '.jpg';
    }

    await writeFile(path.join(outputDir, outName), out);
    totalBefore += before;
    totalAfter += out.length;
    console.log(
      `${source.name.padEnd(55)} ${(before / 1024 / 1024).toFixed(2)} MB -> ${(out.length / 1024).toFixed(0)} KB (${outName})`
    );
  } catch (e) {
    failed++;
    console.log(`${source.name.padEnd(55)} FAILED: ${e.message}`);
  }
}

console.log('\nDone.');
console.log(`Total: ${(totalBefore / 1024 / 1024).toFixed(1)} MB -> ${(totalAfter / 1024 / 1024).toFixed(1)} MB`);
if (failed) console.log(`${failed} file(s) failed — check the output above.`);
console.log(`\nCompressed files written to: ${outputDir}`);
console.log('Re-upload them in Shopify admin:');
console.log('  - Product images  -> Products > [product] > Media (delete the PNG, add the new file)');
console.log('  - Other files     -> Content > Files');
