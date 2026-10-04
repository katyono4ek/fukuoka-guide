import { rmSync, mkdirSync, writeFileSync, copyFileSync, cpSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadContent, ROOT, PHOTOS, sectionsFor } from './content.mjs';
import { renderPage, renderIndex, renderNotFound } from './templates.mjs';

const DIST = join(ROOT, 'dist');
const ASSETS = join(ROOT, 'src', 'assets');
const PUBLIC = join(ROOT, 'public');

/** Normalises a sub-path deployment prefix: "" or "/repo-name". */
const normaliseBase = (value) => {
  const trimmed = (value ?? '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

/** Strips any trailing slash from an origin such as https://user.github.io. */
const normaliseOrigin = (value) => (value ?? '').trim().replace(/\/+$/, '');

const lastCommitDate = () => {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
};

export function build({
  origin = process.env.SITE_ORIGIN,
  base = process.env.BASE_URL,
  outDir = DIST,
  publicDir = PUBLIC,
} = {}) {
  const content = loadContent();
  const site = content.site;

  site.updated = process.env.BUILD_DATE || lastCommitDate() || new Date().toLocaleDateString('en-CA');
  site.repo = process.env.REPO_URL || site.repo || '';
  const resolvedBase = normaliseBase(base ?? site.baseUrl);
  const resolvedOrigin = normaliseOrigin(origin ?? site.origin);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const written = [];
  const write = (relative, body) => {
    const target = join(outDir, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, body);
    written.push(relative);
  };

  for (const locale of site.locales) {
    write(`${locale}/index.html`, renderPage(content, locale, { origin: resolvedOrigin, base: resolvedBase }));
  }
  write('index.html', renderIndex(content));
  write('404.html', renderNotFound(content, { base: resolvedBase }));

  mkdirSync(join(outDir, 'assets'), { recursive: true });
  for (const file of readdirSync(ASSETS)) {
    copyFileSync(join(ASSETS, file), join(outDir, 'assets', file));
    written.push(`assets/${file}`);
  }

  // Photos are pre-processed by tools/photo.mjs; the build only copies them.
  if (existsSync(PHOTOS)) {
    mkdirSync(join(outDir, 'photos'), { recursive: true });
    for (const file of readdirSync(PHOTOS).filter((name) => name.endsWith('.webp'))) {
      copyFileSync(join(PHOTOS, file), join(outDir, 'photos', file));
      written.push(`photos/${file}`);
    }
  }

  // Anything in public/ is copied verbatim: CNAME for a custom domain,
  // share images, verification files.
  if (publicDir && existsSync(publicDir) && statSync(publicDir).isDirectory()) {
    cpSync(publicDir, outDir, { recursive: true });
    for (const entry of readdirSync(publicDir, { recursive: true })) {
      if (statSync(join(publicDir, entry)).isFile()) written.push(String(entry));
    }
  }

  // GitHub Pages would otherwise run Jekyll over the output.
  write('.nojekyll', '');

  if (resolvedOrigin) {
    const urls = site.locales
      .map(
        (locale) => `  <url>
    <loc>${resolvedOrigin}${resolvedBase}/${locale}/</loc>
    <lastmod>${site.updated}</lastmod>
${site.locales
  .map(
    (alt) =>
      `    <xhtml:link rel="alternate" hreflang="${alt}" href="${resolvedOrigin}${resolvedBase}/${alt}/"/>`,
  )
  .join('\n')}
  </url>`,
      )
      .join('\n');
    write(
      'sitemap.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`,
    );
    write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${resolvedOrigin}${resolvedBase}/sitemap.xml\n`);
  } else {
    write('robots.txt', 'User-agent: *\nAllow: /\n');
  }

  return {
    outDir,
    written,
    origin: resolvedOrigin,
    base: resolvedBase,
    updated: site.updated,
    locales: site.locales,
    sections: site.locales.map((locale) => ({
      locale,
      sections: sectionsFor(content.sections, locale).length,
      items: sectionsFor(content.sections, locale).reduce((n, s) => n + s.items.length, 0),
    })),
  };
}

const invokedDirectly =
  process.argv[1] && existsSync(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  const result = build();
  const base = result.base || '/';
  console.log(`✿ built ${result.written.length} files → dist/`);
  for (const entry of result.sections) {
    console.log(`  ${entry.locale}: ${entry.sections} sections, ${entry.items} entries`);
  }
  console.log(`  base: ${base}   origin: ${result.origin || '(not set — sitemap skipped)'}`);
  console.log(`  updated: ${result.updated}`);
}
