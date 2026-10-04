/*
 * Adds (or replaces) a photo from Wikimedia Commons:
 *
 *   npm run photo -- <key> "<File:… on Commons>" [--focus x,y]
 *
 * <key> is "hero" or "<section id>/<item id>", e.g. "sights/kushida".
 * --focus picks the centre of the crop as fractions of the frame (default
 * 0.5,0.5); "0.5,0.2" keeps the top of a tall subject.
 *
 * Downloads the image, crops it to the layout's aspect ratio, writes two WebP
 * widths into content/photos/, and records author, licence and source in
 * content/photos.json. Alt text is left empty for a new photo, so the build
 * fails until it is written in every language. Needs cwebp (libwebp) on PATH.
 * The site build itself never runs this and never touches the network.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../src/content.mjs';
import { PHOTO_FORMATS, photoFormat, photoFile } from '../src/photos.mjs';

const UA = 'fukuoka-roadmap-photo-tool/1.0 (static travel guide build helper)';
const MANIFEST = join(ROOT, 'content', 'photos.json');

/** Wikimedia rate-limits bursts; back off and retry instead of failing. */
const get = async (url, attempt = 1) => {
  const response = await fetch(url, { headers: { 'user-agent': UA } });
  if (response.ok) return response;
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    const wait = Number(response.headers.get('retry-after')) * 1000 || 2000 * 2 ** attempt;
    console.warn(`  ${response.status} from Wikimedia, retrying in ${Math.round(wait / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, wait));
    return get(url, attempt + 1);
  }
  throw new Error(`${url.toString().slice(0, 80)}… → HTTP ${response.status}`);
};

const [key, title, ...rest] = process.argv.slice(2);
if (!key || !title?.startsWith('File:')) {
  console.error('usage: npm run photo -- <hero | section/item> "File:…" [--focus x,y]');
  process.exit(1);
}
const focusArg = rest[rest.indexOf('--focus') + 1];
const [fx, fy] = rest.includes('--focus') ? focusArg.split(',').map(Number) : [0.5, 0.5];
if (![fx, fy].every((n) => n >= 0 && n <= 1)) throw new Error('--focus takes two fractions, e.g. 0.5,0.3');

const format = PHOTO_FORMATS[photoFormat(key)];
const largest = Math.max(...format.widths);

/** Commons hands out HTML for the artist; the credit wants plain text. */
const plain = (html = '') =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const api = new URL('https://commons.wikimedia.org/w/api.php');
Object.entries({
  action: 'query',
  format: 'json',
  titles: title,
  prop: 'imageinfo',
  iiprop: 'url|size|extmetadata',
  // Commons serves a fixed set of thumbnail widths; ask for one with headroom for the crop.
  iiurlwidth: String([1920, 2560, 3840].find((w) => w >= largest * 1.5) ?? 3840),
}).forEach(([k, v]) => api.searchParams.set(k, v));

const info = Object.values((await (await get(api)).json()).query.pages)[0]?.imageinfo?.[0];
if (!info) throw new Error(`${title} not found on Commons`);
const meta = info.extmetadata ?? {};
const license = plain(meta.LicenseShortName?.value);
if (!/^(CC BY(-SA)? [1-4]\.0|CC0 1\.0|CC0|Public domain)$/i.test(license)) {
  throw new Error(`${title}: licence "${license}" is not one this site can use`);
}

// Commons scales on request; take the thumbnail when it is smaller than the original.
const useThumb = info.thumburl && info.thumbwidth < info.width;
const src = useThumb ? info.thumburl : info.url;
const width = useThumb ? info.thumbwidth : info.width;
const height = useThumb ? info.thumbheight : info.height;

const work = mkdtempSync(join(tmpdir(), 'photo-'));
try {
  const original = join(work, 'original.jpg');
  writeFileSync(original, Buffer.from(await (await get(src)).arrayBuffer()));

  // Largest rectangle of the target ratio, centred on the focus point.
  const ratio = format.ratio[0] / format.ratio[1];
  const cropW = Math.min(width, Math.round(height * ratio));
  const cropH = Math.min(height, Math.round(cropW / ratio));
  const x = Math.round(Math.min(Math.max(fx * width - cropW / 2, 0), width - cropW));
  const y = Math.round(Math.min(Math.max(fy * height - cropH / 2, 0), height - cropH));
  if (cropW < largest) console.warn(`  note: source is ${cropW}px wide after cropping; ${largest}px is upscaled`);

  for (const w of format.widths) {
    const h = Math.round(w / ratio);
    execFileSync('cwebp', [
      '-quiet', '-q', '74', '-m', '6', '-metadata', 'none',
      '-crop', String(x), String(y), String(cropW), String(cropH),
      '-resize', String(w), String(h),
      original, '-o', join(ROOT, 'content', 'photos', photoFile(key, w)),
    ]);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const previous = manifest[key] ?? {};
manifest[key] = {
  alt: previous.alt ?? { en: '', ja: '' },
  author: plain(meta.Artist?.value) || 'Unknown',
  license,
  // Commons gives CC0 an http:// link and public domain none at all.
  ...(meta.LicenseUrl?.value ? { licenseUrl: meta.LicenseUrl.value.replace(/^http:\/\//, 'https://') } : {}),
  source: info.descriptionurl,
  ...(fx !== 0.5 || fy !== 0.5 ? { focus: [fx, fy] } : {}),
};
const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => (a === 'hero' ? -1 : b === 'hero' ? 1 : a.localeCompare(b))));
writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`✿ ${key} ← ${title}\n  ${manifest[key].author} · ${license}`);
if (!manifest[key].alt.en) console.log('  now write its alt text in content/photos.json');
