import { createHash } from 'node:crypto';
import { t, sectionsFor } from './content.mjs';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Everything that comes out of content/ passes through here before it reaches HTML. */
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** Map links are built from a search query, never from raw markup in content. */
const mapUrl = (query) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

const sha256 = (text) => `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@300;400;500&family=Zen+Old+Mincho:wght@400;600&display=swap';

const sakura = (cls) => {
  const petals = [0, 72, 144, 216, 288]
    .map(
      (angle) =>
        `<path d="M0 0C13-8 21-27 0-45-21-27-13-8 0 0Z" transform="rotate(${angle})"/>`,
    )
    .join('');
  const stamens = [-28, -14, 0, 14, 28]
    .map((angle) => `<line x1="0" y1="-4" x2="0" y2="-22" transform="rotate(${angle})"/>`)
    .join('');
  return `<svg class="${cls}" viewBox="-60 -60 120 120" aria-hidden="true" focusable="false"><g class="petals">${petals}</g><g class="stamens">${stamens}</g><circle class="pistil" cx="0" cy="0" r="3"/></svg>`;
};

const tagChips = (item, site, locale) =>
  (item.tags ?? [])
    .map((tag) => `<li class="tag">${esc(t(site.tags[tag], locale))}</li>`)
    .join('');

const mapLink = (item, site, locale) =>
  item.map
    ? `<a class="map-link" href="${esc(mapUrl(item.map))}" target="_blank" rel="noopener noreferrer">${esc(
        t(site.ui.map, locale),
      )}<span class="map-arrow" aria-hidden="true">↗</span></a>`
    : '';

const cardsLayout = (section, site, locale) => `
        <ul class="cards" data-grid>
${section.items
  .map(
    (item) => `          <li class="card reveal" id="${esc(`${section.id}-${item.id}`)}" data-tags="${esc(
      (item.tags ?? []).join(' '),
    )}">
            <h3 class="card-title">${esc(t(item.name, locale))}</h3>
            <p class="card-meta">${esc(t(item.meta, locale))}</p>
            <p class="card-text">${esc(t(item.text, locale))}</p>
            <div class="card-foot">
              <ul class="tags">${tagChips(item, site, locale)}</ul>
              ${mapLink(item, site, locale)}
            </div>
          </li>`,
  )
  .join('\n')}
        </ul>`;

const notesLayout = (section, site, locale) => `
        <ol class="notes">
${section.items
  .map(
    (item, index) => `          <li class="note reveal" id="${esc(`${section.id}-${item.id}`)}">
            <span class="note-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
            <div class="note-body">
              <h3 class="note-title">${esc(t(item.name, locale))}</h3>
              <p class="note-meta">${esc(t(item.meta, locale))}</p>
              <p class="note-text">${esc(t(item.text, locale))}</p>
            </div>
          </li>`,
  )
  .join('\n')}
        </ol>`;

const timelineLayout = (section, site, locale) => `
        <ol class="timeline">
${section.items
  .map(
    (item) => `          <li class="day reveal" id="${esc(`${section.id}-${item.id}`)}">
            <h3 class="day-title">${esc(t(item.name, locale))}</h3>
            <p class="day-meta">${esc(t(item.meta, locale))}</p>
            <ol class="steps">
${(item.steps ?? [])
  .map(
    (step) => `              <li class="step">
                <span class="step-time">${esc(t(step.time, locale))}</span>
                <p class="step-text">${esc(t(step.text, locale))}</p>
              </li>`,
  )
  .join('\n')}
            </ol>
          </li>`,
  )
  .join('\n')}
        </ol>`;

const LAYOUTS = { cards: cardsLayout, notes: notesLayout, timeline: timelineLayout };

const filterBar = (section, site, locale) => {
  const used = [...new Set(section.items.flatMap((item) => item.tags ?? []))];
  if (!section.filterable || used.length < 2) return '';
  const buttons = [
    `<button class="chip is-on" type="button" data-filter="*" aria-pressed="true">${esc(
      t(site.ui.filterAll, locale),
    )}</button>`,
    ...used.map(
      (tag) =>
        `<button class="chip" type="button" data-filter="${esc(tag)}" aria-pressed="false">${esc(
          t(site.tags[tag], locale),
        )}</button>`,
    ),
  ].join('\n            ');
  return `
        <div class="filters" data-filters role="group" aria-label="${esc(t(site.ui.filterLabel, locale))}">
            ${buttons}
        </div>
        <p class="filter-empty" data-empty hidden>${esc(t(site.ui.noMatches, locale))}</p>`;
};

const renderSection = (section, site, locale) => `
      <section class="section" id="${esc(section.id)}" aria-labelledby="${esc(section.id)}-heading" data-section>
        <header class="section-head">
          <span class="ornament" aria-hidden="true">${esc(section.ornament ?? '✿')}</span>
          <h2 class="section-title" id="${esc(section.id)}-heading">${esc(t(section.title, locale))}</h2>
          <p class="section-intro">${esc(t(section.intro, locale))}</p>
        </header>${filterBar(section, site, locale)}${LAYOUTS[section.layout](section, site, locale)}
      </section>`;

const navList = (sections, locale) =>
  sections
    .map(
      (section) =>
        `          <li><a href="#${esc(section.id)}">${esc(t(section.title, locale))}</a></li>`,
    )
    .join('\n');

const jsonLd = (site, locale, origin, base) => {
  const path = `${base}/${locale}/`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t(site.title, locale),
    description: t(site.description, locale),
    inLanguage: locale,
    ...(origin ? { url: `${origin}${path}` } : {}),
    about: {
      '@type': 'TouristDestination',
      name: locale === 'ja' ? '福岡市' : 'Fukuoka',
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'JP',
        addressRegion: locale === 'ja' ? '福岡県' : 'Fukuoka Prefecture',
      },
    },
  };
  return JSON.stringify(data);
};

/**
 * Content-Security-Policy is delivered as a meta tag because GitHub Pages
 * cannot set response headers. The JSON-LD block is allowed by hash so the
 * policy never needs 'unsafe-inline'.
 */
const csp = (ldHash, webfonts) =>
  [
    "default-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "img-src 'self' data:",
    `style-src 'self'${webfonts ? ' https://fonts.googleapis.com' : ''}`,
    `font-src 'self'${webfonts ? ' https://fonts.gstatic.com' : ''}`,
    `script-src 'self' '${ldHash}'`,
    "connect-src 'none'",
    "manifest-src 'self'",
  ].join('; ');

const head = ({ site, locale, title, description, assets, origin, base, alternates, ldHash, ld }) => `  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${esc(csp(ldHash, site.webfonts !== false))}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#fff7f8" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#1d1317" media="(prefers-color-scheme: dark)">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:locale" content="${esc(locale === 'ja' ? 'ja_JP' : 'en_GB')}">
  <meta name="twitter:card" content="summary">
${origin ? `  <link rel="canonical" href="${esc(`${origin}${base}/${locale}/`)}">\n` : ''}${alternates}  <link rel="icon" href="${assets}/favicon.svg" type="image/svg+xml">
${
  site.webfonts === false
    ? ''
    : `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${esc(FONT_HREF)}">
`
}  <link rel="stylesheet" href="${assets}/styles.css">
  <script src="${assets}/theme.js"></script>
  <script type="application/ld+json">${ld}</script>`;

/** One full guide page for one locale. */
export function renderPage({ site, sections }, locale, { origin = '', base = '' } = {}) {
  const visible = sectionsFor(sections, locale);
  const title = `${t(site.title, locale)} · ${locale === 'ja' ? '福岡ガイド' : 'Fukuoka guide'}`;
  const description = t(site.description, locale);
  const other = site.locales.filter((l) => l !== locale);
  const assets = '../assets';
  const ld = jsonLd(site, locale, origin, base);
  const alternates = origin
    ? `${site.locales
        .map((l) => `  <link rel="alternate" hreflang="${l}" href="${esc(`${origin}${base}/${l}/`)}">`)
        .join('\n')}\n  <link rel="alternate" hreflang="x-default" href="${esc(
        `${origin}${base}/${site.defaultLocale}/`,
      )}">\n`
    : '';

  return `<!doctype html>
<html lang="${esc(locale)}" data-locale="${esc(locale)}">
<head>
${head({ site, locale, title, description, assets, origin, base, alternates, ldHash: sha256(ld), ld })}
</head>
<body>
  <a class="skip" href="#main">${esc(t(site.ui.skipToContent, locale))}</a>
  <header class="topbar">
    <a class="wordmark" href="#top">${esc(t(site.title, locale))}</a>
    <div class="topbar-actions">
      <button class="icon-btn" type="button" data-theme-toggle aria-label="${esc(
        t(site.ui.themeLabel, locale),
      )}">
        <span class="icon-sun" aria-hidden="true">☀</span><span class="icon-moon" aria-hidden="true">☾</span>
      </button>
${other
  .map(
    (l) =>
      `      <a class="lang-btn" href="../${esc(l)}/" lang="${esc(l)}" hreflang="${esc(l)}" title="${esc(
        t(site.ui.switchLabel, locale),
      )}" data-lang-link="${esc(l)}">${esc(t(site.ui.localeName, l))}</a>`,
  )
  .join('\n')}
    </div>
  </header>

  <main id="main">
    <div class="hero" id="top">
      ${sakura('bloom bloom-a')}
      ${sakura('bloom bloom-b')}
      ${sakura('bloom bloom-c')}
      <p class="hero-eyebrow">Fukuoka · 福岡 · 九州</p>
      <h1 class="hero-title">${esc(t(site.title, locale))}</h1>
      <p class="hero-tagline">${esc(t(site.tagline, locale))}</p>
      <a class="hero-cue" href="#${esc(visible[0].id)}" aria-label="${esc(
        t(site.ui.sectionsLabel, locale),
      )}"><span aria-hidden="true">↓</span></a>
    </div>

    <nav class="sectionnav" aria-label="${esc(t(site.ui.menu, locale))}">
      <span class="sectionnav-label">${esc(t(site.ui.menu, locale))}</span>
      <ul>
${navList(visible, locale)}
      </ul>
    </nav>

${visible.map((section) => renderSection(section, site, locale)).join('\n')}
  </main>

  <footer class="footer">
    <span class="ornament" aria-hidden="true">✿</span>
    <p class="footer-note">${esc(t(site.ui.footerNote, locale))}</p>
    <p class="footer-meta">
      <span>${esc(t(site.ui.updated, locale))}: <time datetime="${esc(
        site.updated,
      )}">${esc(site.updated)}</time></span>
${other
  .map(
    (l) => `      <a href="../${esc(l)}/" lang="${esc(l)}" hreflang="${esc(l)}">${esc(
      t(site.ui.localeName, l),
    )}</a>`,
  )
  .join('\n')}
${site.repo ? `      <a href="${esc(site.repo)}" rel="noopener noreferrer">${esc(t(site.ui.source, locale))}</a>` : ''}
    </p>
  </footer>

  <a class="totop" href="#top" data-totop aria-label="${esc(t(site.ui.top, locale))}"><span aria-hidden="true">↑</span></a>
  <script src="../assets/app.js" defer></script>
</body>
</html>
`;
}

/**
 * Root page: no visible choice. A blocking script in the head sends the reader
 * straight to the locale they last read, else the one their browser asks for,
 * else the default. Without JavaScript the noscript refresh does the same with
 * the default locale.
 */
export function renderIndex({ site }) {
  const fallback = site.defaultLocale;
  const title = `${t(site.title, 'en')} · ${t(site.title, 'ja')}`;
  const policy = [
    "default-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "style-src 'self'",
    "font-src 'self'",
    "script-src 'self'",
    "connect-src 'none'",
  ].join('; ');

  return `<!doctype html>
<html lang="${esc(fallback)}" data-locales="${esc(site.locales.join(' '))}" data-default="${esc(
    fallback,
  )}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${esc(policy)}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(t(site.description, 'en'))}">
  <meta name="color-scheme" content="light dark">
  <meta name="robots" content="noindex, follow">
${site.locales.map((l) => `  <link rel="alternate" hreflang="${esc(l)}" href="./${esc(l)}/">`).join('\n')}
  <link rel="alternate" hreflang="x-default" href="./${esc(fallback)}/">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/styles.css">
  <script src="assets/gate.js"></script>
  <noscript><meta http-equiv="refresh" content="0; url=./${esc(fallback)}/"></noscript>
</head>
<body class="redirect-page">
  <noscript>
    <p class="redirect-note">${esc(t(site.ui.chooseLanguage, 'en'))} / ${esc(
      t(site.ui.chooseLanguage, 'ja'),
    )}</p>
    <p class="redirect-links">
${site.locales
  .map(
    (l) =>
      `      <a href="./${esc(l)}/" lang="${esc(l)}" hreflang="${esc(l)}">${esc(
        t(site.ui.localeName, l),
      )}</a>`,
  )
  .join('\n')}
    </p>
  </noscript>
</body>
</html>
`;
}

/** 404 uses absolute paths because it is served from arbitrary URLs. */
export function renderNotFound({ site }, { base = '' } = {}) {
  const prefix = base || '';
  return `<!doctype html>
<html lang="${esc(site.defaultLocale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${esc(
    "default-src 'none'; base-uri 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:",
  )}">
  <title>404 · ${esc(t(site.title, 'en'))}</title>
  <meta name="robots" content="noindex, nofollow">
  <meta name="color-scheme" content="light dark">
  <link rel="icon" href="${prefix}/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${prefix}/assets/styles.css">
</head>
<body class="gate-page">
  <main class="gate">
    ${sakura('bloom bloom-gate')}
    <p class="hero-eyebrow">404</p>
    <h1 class="gate-title">
      <span>Lost in the arcade</span>
      <span class="gate-mark" aria-hidden="true">✿</span>
      <span lang="ja">道に迷いました</span>
    </h1>
    <p class="gate-sub">That page is not here. / そのページはありません。</p>
    <div class="gate-links">
${site.locales
  .map(
    (l) =>
      `      <a class="gate-link" href="${prefix}/${esc(l)}/" lang="${esc(l)}">${esc(
        t(site.ui.localeName, l),
      )}</a>`,
  )
  .join('\n')}
    </div>
  </main>
</body>
</html>
`;
}
