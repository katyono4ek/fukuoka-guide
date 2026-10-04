import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from '../src/build.mjs';
import { loadContent, sectionsFor, t } from '../src/content.mjs';
import { renderPage, esc } from '../src/templates.mjs';
import { PHOTO_FORMATS, photoFormat, photoFile, webpSize } from '../src/photos.mjs';

const ORIGIN = 'https://example.github.io';
const BASE = '/fukuoka-roadmap';

const outDir = mkdtempSync(join(tmpdir(), 'fukuoka-build-'));
const result = build({ origin: ORIGIN, base: BASE, outDir });
const content = loadContent();
const read = (relative) => readFileSync(join(outDir, relative), 'utf8');
const pages = { en: read('en/index.html'), ja: read('ja/index.html') };

/** Counts opening tags without matching `<path>`-style false positives. */
const countOpen = (html, tag) => (html.match(new RegExp(`<${tag}(?=[\\s>])`, 'g')) || []).length;
const countClose = (html, tag) => (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;

test('every expected file is emitted', () => {
  for (const file of [
    'index.html',
    '404.html',
    'en/index.html',
    'ja/index.html',
    'assets/styles.css',
    'assets/app.js',
    'assets/theme.js',
    'assets/gate.js',
    'assets/favicon.svg',
    'photos/hero-960.webp',
    'photos/hero-1920.webp',
    'robots.txt',
    'sitemap.xml',
    '.nojekyll',
  ]) {
    assert.ok(existsSync(join(outDir, file)), `missing ${file}`);
  }
});

test('each locale page declares its own language', () => {
  assert.match(pages.en, /<html lang="en" data-locale="en">/);
  assert.match(pages.ja, /<html lang="ja" data-locale="ja">/);
});

test('each page has exactly one h1 and a heading per section', () => {
  for (const [locale, html] of Object.entries(pages)) {
    assert.equal(countOpen(html, 'h1'), 1, `${locale}: expected one h1`);
    const expected = sectionsFor(content.sections, locale).length;
    assert.equal(countOpen(html, 'h2'), expected, `${locale}: one h2 per section`);
  }
});

test('container tags are balanced', () => {
  for (const [locale, html] of Object.entries(pages)) {
    for (const tag of ['html', 'head', 'body', 'main', 'header', 'footer', 'nav', 'section', 'div', 'ul', 'ol', 'li', 'p', 'a', 'h1', 'h2', 'h3', 'button', 'time', 'span']) {
      assert.equal(
        countOpen(html, tag),
        countClose(html, tag),
        `${locale}: unbalanced <${tag}>`,
      );
    }
  }
});

test('every section renders with the right number of entries', () => {
  for (const [locale, html] of Object.entries(pages)) {
    for (const section of sectionsFor(content.sections, locale)) {
      assert.ok(html.includes(`id="${section.id}"`), `${locale}: section ${section.id} missing`);
      for (const item of section.items) {
        assert.ok(
          html.includes(`id="${section.id}-${item.id}"`),
          `${locale}: entry ${section.id}-${item.id} missing`,
        );
      }
    }
  }
});

test('an English-only section never leaks into the Japanese page', () => {
  assert.ok(pages.en.includes('id="phrases"'));
  assert.ok(!pages.ja.includes('id="phrases"'));
  assert.ok(!pages.ja.includes('Gochisousama'));
});

test('no untranslated or undefined values reach the HTML', () => {
  for (const [locale, html] of Object.entries(pages)) {
    assert.ok(!html.includes('undefined'), `${locale}: "undefined" in output`);
    assert.ok(!/>\s*null\s*</.test(html), `${locale}: "null" in output`);
    assert.ok(!html.includes('[object Object]'), `${locale}: stringified object in output`);
    assert.ok(!/\{\{|\$\{/.test(html), `${locale}: unresolved template placeholder`);
  }
});

test('the Japanese page is Japanese and the English page has no stray Japanese', () => {
  const cjk = /[\u3040-\u30ff\u4e00-\u9faf]/u;
  assert.ok(cjk.test(pages.ja), 'Japanese page contains Japanese');

  // Text explicitly marked lang="ja" (the decorative name on a photo-less card) is deliberate.
  const main = pages.en
    .slice(pages.en.indexOf('<main'), pages.en.indexOf('</main>'))
    .replace(/<([a-z]+)[^>]*\slang="ja"[^>]*>[^<]*<\/\1>/g, '');
  const blocks = main.split('<section class="section" id="').slice(1);
  assert.equal(blocks.length, sectionsFor(content.sections, 'en').length);
  for (const block of blocks) {
    const id = block.slice(0, block.indexOf('"'));
    if (id === 'phrases') {
      assert.ok(cjk.test(block), 'the phrases section deliberately shows Japanese');
      continue;
    }
    assert.ok(!cjk.test(block), `English section ${id} contains Japanese text`);
  }

  // Hero and nav: the only Japanese allowed is the city name in the eyebrow line.
  const preamble = main
    .slice(0, main.indexOf('<section class="section"'))
    .replace(/\u798f\u5ca1|\u4e5d\u5dde/g, '');
  assert.ok(!cjk.test(preamble), 'English hero/nav contains unexpected Japanese');
});

test('every locale page links to the other locale', () => {
  assert.match(pages.en, /href="\.\.\/ja\/"/);
  assert.match(pages.ja, /href="\.\.\/en\/"/);
  // The switcher is what the root redirect remembers, so it must be tagged.
  assert.match(pages.en, /data-lang-link="ja"/);
  assert.match(pages.ja, /data-lang-link="en"/);
});

test('canonical and hreflang links are absolute and complete', () => {
  for (const [locale, html] of Object.entries(pages)) {
    assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}${BASE}/${locale}/">`));
    for (const alt of content.site.locales) {
      assert.ok(html.includes(`hreflang="${alt}" href="${ORIGIN}${BASE}/${alt}/"`), `${locale}: no hreflang for ${alt}`);
    }
    assert.ok(html.includes('hreflang="x-default"'));
  }
});

test('internal asset references resolve to files that exist', () => {
  const pageFiles = ['index.html', '404.html', 'en/index.html', 'ja/index.html'];
  for (const page of pageFiles) {
    const html = read(page);
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|#|mailto:)/.test(ref)) continue;
      const withoutBase = ref.startsWith(`${BASE}/`) ? ref.slice(BASE.length) : ref;
      const target = withoutBase.startsWith('/')
        ? join(outDir, withoutBase)
        : resolvePath(join(outDir, dirname(page)), withoutBase);
      const candidate = target.endsWith('/') ? join(target, 'index.html') : target;
      assert.ok(existsSync(candidate), `${page}: dead reference ${ref}`);
    }
  }
});

test('every in-page anchor points at an element that exists', () => {
  for (const [locale, html] of Object.entries(pages)) {
    const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    assert.ok(anchors.length > 5);
    for (const anchor of anchors) {
      assert.ok(html.includes(`id="${anchor}"`), `${locale}: anchor #${anchor} has no target`);
    }
  }
});

test('aria-labelledby references resolve', () => {
  for (const [locale, html] of Object.entries(pages)) {
    for (const [, id] of html.matchAll(/aria-labelledby="([^"]+)"/g)) {
      assert.ok(html.includes(`id="${id}"`), `${locale}: aria-labelledby ${id} has no target`);
    }
  }
});

test('filter chips are declared as toggle buttons with labels', () => {
  const chips = [...pages.en.matchAll(/<button class="chip[^"]*"[^>]*>([^<]+)<\/button>/g)];
  assert.ok(chips.length >= 3, 'filters rendered');
  for (const [tag] of chips) {
    assert.match(tag, /aria-pressed="(true|false)"/);
    assert.match(tag, /data-filter="/);
  }
  for (const [, label] of chips) assert.ok(label.trim().length > 0);
});

test('tag chips are localised, not raw keys', () => {
  for (const key of Object.keys(content.site.tags)) {
    if (!pages.en.includes(`data-filter="${key}"`)) continue;
    assert.ok(
      pages.en.includes(`>${t(content.site.tags[key], 'en')}</button>`) ||
        pages.en.includes(`>${t(content.site.tags[key], 'en')}</li>`),
      `tag ${key} not rendered in English`,
    );
    assert.ok(
      pages.ja.includes(`>${t(content.site.tags[key], 'ja')}</button>`) ||
        pages.ja.includes(`>${t(content.site.tags[key], 'ja')}</li>`),
      `tag ${key} not rendered in Japanese`,
    );
  }
});

test('map links go to a maps search with an encoded query', () => {
  const links = [...pages.en.matchAll(/href="(https:\/\/www\.google\.com\/maps[^"]*)"/g)].map((m) => m[1]);
  assert.ok(links.length >= 10, 'map links present');
  for (const link of links) {
    const url = new URL(link.replaceAll('&amp;', '&'));
    assert.equal(url.origin, 'https://www.google.com');
    assert.ok(url.searchParams.get('query'), `no query in ${link}`);
  }
});

test('external links are rel-protected', () => {
  for (const [locale, html] of Object.entries(pages)) {
    for (const [tag] of html.matchAll(/<a [^>]*href="https?:\/\/[^"]+"[^>]*>/g)) {
      assert.match(tag, /rel="[^"]*noopener/, `${locale}: ${tag} lacks rel=noopener`);
    }
  }
});

test('the content security policy is strict and allows the JSON-LD by hash', () => {
  for (const [locale, html] of Object.entries(pages)) {
    const csp = html.match(/content="([^"]*default-src[^"]*)"/)[1].replaceAll('&#39;', "'");
    assert.match(csp, /default-src 'none'/);
    assert.ok(!csp.includes("'unsafe-inline'"), `${locale}: CSP must not allow unsafe-inline`);
    assert.ok(!csp.includes("'unsafe-eval'"), `${locale}: CSP must not allow unsafe-eval`);
    assert.match(csp, /base-uri 'self'/);
    assert.match(csp, /form-action 'none'/);

    const ld = html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)[1];
    const hash = `sha256-${createHash('sha256').update(ld, 'utf8').digest('base64')}`;
    assert.ok(csp.includes(`'${hash}'`), `${locale}: CSP hash does not match the JSON-LD block`);
    const parsed = JSON.parse(ld);
    assert.equal(parsed['@context'], 'https://schema.org');
    assert.equal(parsed.inLanguage, locale);
  }
});

test('no inline event handlers, inline styles or inline scripts are emitted', () => {
  for (const page of ['index.html', '404.html', 'en/index.html', 'ja/index.html']) {
    const html = read(page);
    assert.ok(!/ on[a-z]+="/.test(html), `${page}: inline event handler`);
    assert.ok(!/ style="/.test(html), `${page}: inline style attribute`);
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    for (const [, attrs, body] of scripts) {
      const isData = attrs.includes('application/ld+json');
      assert.ok(isData || body.trim() === '', `${page}: executable inline script`);
    }
  }
});

test('404 uses base-prefixed absolute paths so it works from any depth', () => {
  const html = read('404.html');
  assert.ok(html.includes(`href="${BASE}/assets/styles.css"`));
  assert.ok(html.includes(`href="${BASE}/en/"`));
  assert.match(html, /name="robots" content="noindex, nofollow"/);
});

test('the root forwards by locale instead of asking', () => {
  const html = read('index.html');
  assert.ok(!html.includes('gate-link'), 'the language chooser must be gone');
  assert.ok(!html.includes('gate-title'));
  assert.match(html, /data-locales="en ja"/);
  assert.match(html, /data-default="en"/);
  // Blocking, in <head>, so nothing is painted before the redirect.
  assert.match(html, /<script src="assets\/gate\.js"><\/script>/);
  assert.ok(html.indexOf('assets/gate.js') < html.indexOf('</head>'));
  assert.ok(!/gate\.js"[^>]*defer/.test(html), 'the redirect must not be deferred');
  // Without JavaScript: refresh to the default locale, plus visible links.
  assert.match(html, /<noscript><meta http-equiv="refresh" content="0; url=\.\/en\/"><\/noscript>/);
  assert.ok(html.includes('href="./en/" lang="en"'));
  assert.ok(html.includes('href="./ja/" lang="ja"'));
  assert.match(html, /name="robots" content="noindex, follow"/);
  assert.ok(html.includes('hreflang="x-default" href="./en/"'));
});

test('the root page makes no third-party requests and keeps a strict policy', () => {
  const html = read('index.html');
  assert.ok(!html.includes('fonts.googleapis.com'), 'the redirect needs no webfont');
  const csp = html.match(/content="([^"]*default-src[^"]*)"/)[1].replaceAll('&#39;', "'");
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.ok(!csp.includes("'unsafe-inline'"));
});

test('the sitemap lists both locales with alternates', () => {
  const xml = read('sitemap.xml');
  for (const locale of content.site.locales) {
    assert.ok(xml.includes(`<loc>${ORIGIN}${BASE}/${locale}/</loc>`));
    assert.ok(xml.includes(`hreflang="${locale}"`));
  }
  assert.ok(read('robots.txt').includes(`Sitemap: ${ORIGIN}${BASE}/sitemap.xml`));
});

test('a build without an origin skips the sitemap instead of emitting bad URLs', () => {
  const bare = mkdtempSync(join(tmpdir(), 'fukuoka-bare-'));
  build({ origin: '', base: '', outDir: bare });
  assert.ok(!existsSync(join(bare, 'sitemap.xml')));
  const html = readFileSync(join(bare, 'en/index.html'), 'utf8');
  assert.ok(!html.includes('rel="canonical"'));
  assert.ok(html.includes('href="../assets/styles.css"'), 'assets stay relative without a base');
});

test('hostile content is escaped, never injected', () => {
  const payload = '<img src=x onerror="alert(1)">';
  const poisoned = structuredClone(content);
  poisoned.site.updated = '2026-01-01';
  poisoned.sections[1].items[0].name.en = payload;
  poisoned.sections[1].items[0].map = 'Hakata" onmouseover="alert(1)';
  const html = renderPage(poisoned, 'en', { origin: ORIGIN, base: BASE });
  assert.ok(!html.includes(payload), 'the payload must not survive as markup');
  assert.ok(!/<img src=x/i.test(html), 'no img element may be injected');
  assert.ok(
    !/<[a-z][^>]*\son[a-z]+\s*=/i.test(html),
    'no element may carry an inline event handler attribute',
  );
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
});

test('content cannot close the JSON-LD block early', () => {
  const payload = '</script><script>alert(1)</script><!--';
  const poisoned = structuredClone(content);
  poisoned.site.updated = '2026-01-01';
  poisoned.site.description.en = payload;
  const html = renderPage(poisoned, 'en', { origin: ORIGIN, base: BASE });
  assert.ok(!html.includes('<script>alert(1)'), 'the payload must not open a script element');
  assert.ok(!html.includes('<!--'), 'the payload must not open a comment');

  const ld = html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)[1];
  assert.equal(JSON.parse(ld).description, payload, 'the data itself survives intact');
  const hash = `sha256-${createHash('sha256').update(ld, 'utf8').digest('base64')}`;
  const csp = html.match(/content="([^"]*default-src[^"]*)"/)[1].replaceAll('&#39;', "'");
  assert.ok(csp.includes(`'${hash}'`), 'the CSP hash still covers the escaped block');
});

test('the dark-mode toggle announces its state from the start', () => {
  const app = readFileSync(join(outDir, 'assets/app.js'), 'utf8');
  for (const html of Object.values(pages)) {
    assert.match(html, /data-theme-toggle[^>]*aria-pressed="false"/, 'toggle starts as a toggle button');
  }
  assert.match(app, /syncToggle\(\)/, 'app.js corrects aria-pressed to the real theme on load');
});

test('photos ship with exact dimensions, alt text and a srcset that resolves', () => {
  for (const [locale, html] of Object.entries(pages)) {
    const images = [...html.matchAll(/<img ([^>]*)>/g)].map((m) => m[1]);
    assert.ok(images.length > 1, `${locale}: no photos rendered`);
    for (const attrs of images) {
      const attr = (name) => attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
      const where = `${locale}: ${attr('src')}`;
      assert.ok(attr('alt')?.trim(), `${where} has no alt text`);
      const fileFor = (url) => resolvePath(join(outDir, locale), url);

      // The width/height attributes reserve exactly the space the file needs.
      const size = webpSize(readFileSync(fileFor(attr('src'))));
      assert.equal(Number(attr('width')), size.width, `${where}: width attribute`);
      assert.equal(Number(attr('height')), size.height, `${where}: height attribute`);

      const candidates = attr('srcset').split(', ').map((entry) => entry.split(' '));
      assert.ok(candidates.length >= 2, `${where}: srcset offers one size only`);
      for (const [url, descriptor] of candidates) {
        assert.ok(existsSync(fileFor(url)), `${where}: srcset points at missing ${url}`);
        assert.equal(`${webpSize(readFileSync(fileFor(url))).width}w`, descriptor, `${where}: ${url} descriptor`);
      }
      assert.ok(attr('sizes'), `${where}: srcset without sizes`);

      // The hero is above the fold; everything else waits until it is scrolled near.
      const hero = attrs.includes('hero-photo');
      assert.equal(attr('loading'), hero ? undefined : 'lazy', `${where}: loading`);
    }
  }
});

test('every photo is rendered and credited with author, licence and source', () => {
  for (const [key, photo] of Object.entries(content.photos)) {
    const sectionId = key.split('/')[0];
    for (const [locale, html] of Object.entries(pages)) {
      const section = content.sections.find((s) => s.id === sectionId);
      if (section && !sectionsFor([section], locale).length) continue;
      const files = PHOTO_FORMATS[photoFormat(key)].widths.map((w) => photoFile(key, w));
      assert.ok(files.every((file) => html.includes(`../photos/${file}`)), `${locale}: ${key} is not shown`);
      assert.equal(html.split(`src="../photos/${files[0]}"`).length - 1, 1, `${locale}: ${key} shown more than once`);

      const credits = html.slice(html.indexOf('<details class="credits">'), html.indexOf('</details>'));
      assert.ok(credits.includes(`href="${esc(photo.source)}"`), `${locale}: ${key} source not credited`);
      assert.ok(credits.includes(esc(photo.author)), `${locale}: ${key} author not credited`);
      assert.ok(credits.includes(esc(photo.license)), `${locale}: ${key} licence not credited`);
      if (photo.licenseUrl) assert.ok(credits.includes(`href="${esc(photo.licenseUrl)}"`), `${locale}: ${key} licence link`);
    }
  }
});

test('a card without a photo in a photo section gets a decorative tile; other sections stay plain', () => {
  for (const section of content.sections.filter((s) => s.layout === 'cards')) {
    const withPhotos = section.items.filter((item) => content.photos[`${section.id}/${item.id}`]);
    const block = pages.en.slice(pages.en.indexOf(`<section class="section" id="${section.id}"`));
    const body = block.slice(0, block.indexOf('</section>'));
    const tiles = (body.match(/class="card-photo card-tile" aria-hidden="true"/g) || []).length;
    if (withPhotos.length === 0) {
      assert.ok(!body.includes('card-photo'), `${section.id}: no photos, so no photo slots`);
    } else {
      assert.equal(tiles, section.items.length - withPhotos.length, `${section.id}: tiles fill the gaps`);
    }
  }
});

test('build reports what it produced', () => {
  assert.equal(result.base, BASE);
  assert.equal(result.origin, ORIGIN);
  assert.match(result.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(result.locales, ['en', 'ja']);
  assert.ok(result.written.length >= 12);
});

test('files in public/ are copied verbatim, for CNAME and share images', () => {
  const publicDir = mkdtempSync(join(tmpdir(), 'fukuoka-public-'));
  writeFileSync(join(publicDir, 'CNAME'), 'guide.example.com\n');
  const out = mkdtempSync(join(tmpdir(), 'fukuoka-passthrough-'));
  const report = build({ origin: 'https://guide.example.com', base: '', outDir: out, publicDir });
  assert.equal(readFileSync(join(out, 'CNAME'), 'utf8').trim(), 'guide.example.com');
  assert.ok(report.written.includes('CNAME'));
  assert.ok(
    readFileSync(join(out, 'en/index.html'), 'utf8').includes(
      '<link rel="canonical" href="https://guide.example.com/en/">',
    ),
  );
});

test('turning webfonts off removes every third-party request', () => {
  const offline = structuredClone(content);
  offline.site.webfonts = false;
  offline.site.updated = '2026-01-01';
  const html = renderPage(offline, 'en', { origin: ORIGIN, base: BASE });
  assert.ok(!html.includes('fonts.googleapis.com'));
  assert.ok(!html.includes('fonts.gstatic.com'));
  const csp = html.match(/content="([^"]*default-src[^"]*)"/)[1].replaceAll('&#39;', "'");
  assert.match(csp, /style-src 'self';/);
  assert.match(csp, /font-src 'self';/);

  // Only what the browser fetches by itself counts; links the reader may follow do not.
  const external = [...html.matchAll(/<(?:link|script|img|source)\s[^>]*(?:href|src|srcset)="(https?:\/\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((url) => !url.startsWith('https://www.google.com/maps') && !url.startsWith(ORIGIN));
  assert.deepEqual(external, [], 'no third-party resources may remain');
});

test('the scroll spy never scrolls the page itself', () => {
  // scrollIntoView() scrolls every scrollable ancestor, the viewport included.
  // Calling it while a nav click's smooth scroll is running aborts that scroll
  // and strands the reader at the first section it happens to pass.
  const app = readFileSync(join(outDir, 'assets/app.js'), 'utf8');
  const code = app.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  assert.ok(!code.includes('.scrollIntoView('), 'move the nav strip with scrollLeft instead');
  assert.match(app, /navStrip\.scrollLeft/, 'the active chip is followed by scrolling the strip');
});
