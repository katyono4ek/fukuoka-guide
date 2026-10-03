# Fukuoka, softly · ふくおか、やさしく

A small bilingual (English / 日本語) guide to Fukuoka, Japan. Static, dependency-free,
and built from JSON so that adding a place is a content change, not a code change.

```
npm run dev      # build, then preview on http://127.0.0.1:4321
npm run verify   # build + the full test suite (what CI runs)
```

Node 20 or newer. There are no dependencies to install — `npm install` has nothing to do.

## How it is put together

```
content/
  site.json              UI strings, locales, the tag vocabulary
  sections/*.json        one file per section, rendered in filename order
src/
  content.mjs            loader + validator (the build fails on a missing translation)
  templates.mjs          HTML rendering, escaping, CSP
  build.mjs              writes dist/
  serve.mjs              local preview only
  assets/                styles.css, app.js, theme.js, gate.js (root redirect), favicon.svg
test/                    node:test suites — content, markup, HTTP
dist/                    build output (git-ignored)
```

The build emits a complete page per locale (`/en/`, `/ja/`), a redirect at `/`, a
`404.html`, a sitemap, and the assets. No client-side rendering: JavaScript only adds
the dark-mode toggle, the tag filters, the scroll reveal and the "back to top" button.
Everything reads correctly with JavaScript switched off.

`/` never asks which language you want. A blocking script in its head picks one — the
language you last switched to, else the first of `navigator.languages` the site speaks,
else `defaultLocale` — and replaces the history entry, so nothing is painted and the back
button does not bounce. Only an explicit click on the language switcher is remembered;
opening a page in one language does not override what the browser asks for. Without
JavaScript a `<noscript>` refresh sends the reader to the default locale.

## Adding content

**A new entry** — add an object to the `items` array of any section file:

```json
{
  "id": "nanzoin",
  "name": { "en": "Nanzoin Temple", "ja": "南蔵院" },
  "meta": { "en": "30 min · reclining Buddha", "ja": "30分・涅槃像" },
  "text": { "en": "…", "ja": "…" },
  "tags": ["nearby", "quiet"],
  "map": "Nanzoin Temple, Fukuoka"
}
```

`map` is a search phrase, never a URL — the build turns it into an escaped Google Maps
search link. Tags must exist in `site.json`; unknown tags fail the build.

**A new section** — drop a new file into `content/sections/`. The numeric filename prefix
decides the order, so `35-markets.json` lands between food and cafés. Pick a `layout`:
`cards`, `notes` or `timeline`. No registry to update, no import to add.

**A new language** — add the code to `locales` in `site.json`, translate every string
there, and run `npm test`: the validator lists every key that still needs translating,
file by file. Add `"locales": ["en"]` to a section to keep it out of other languages
(the `phrases` section uses this).

## Deploying

The repository ships two workflows:

- `.github/workflows/ci.yml` — build + tests on every pull request.
- `.github/workflows/deploy.yml` — tests, build, then publish to GitHub Pages on `main`.

To turn it on: **Settings → Pages → Source → GitHub Actions**, then push to `main`.
`actions/configure-pages` resolves the origin and base path, so the same workflow works
for `user.github.io`, for a project site served from `/repo-name/`, and for a custom
domain (put a `CNAME` file in `public/`, which is copied verbatim into the output).

The output is plain static files, so Cloudflare Pages, Netlify or any bucket behind a CDN
work too — build command `npm run build`, output directory `dist`, and set `SITE_ORIGIN`
(and `BASE_URL`, if it is not served from the root) so canonical URLs and the sitemap are
correct.

## Security and privacy

There is no backend, no database, no login, and no personal data — the only thing to
protect is the integrity of the page itself.

- **No secrets in the repository**, and the deploy workflow uses GitHub's OIDC Pages
  deployment rather than a long-lived token. Both workflows run with `contents: read`
  and check out without persisting credentials.
- **Every string from `content/` is HTML-escaped** before it reaches the page, and map
  links are built with `encodeURIComponent`. A test asserts that an injected
  `<img onerror=…>` payload comes out as inert text.
- **A strict Content-Security-Policy** ships in a `<meta>` tag (GitHub Pages cannot set
  headers): `default-src 'none'`, no `unsafe-inline`, no `unsafe-eval`. The one inline
  block on the page is the JSON-LD description, allowed by its SHA-256 hash, which the
  build recomputes and a test re-verifies.
- **No analytics, no cookies, no third-party scripts.** The only external request is the
  Google Fonts stylesheet. Setting `"webfonts": false` in `content/site.json` removes it
  and falls back to the system Mincho and rounded-Gothic faces, leaving the page with
  zero third-party requests.
- **`localStorage` holds two harmless keys** (`fk-theme`, and `fk-locale` once the
  language switcher is used), every access is wrapped in `try/catch`, and nothing is
  sent anywhere.
- **The preview server is local-only** (`127.0.0.1`), read-only, and refuses paths that
  try to escape `dist/` — there is a test for that too.

## Tests

`npm test` runs three suites with the Node test runner:

- **content** — every locale present and non-empty, no duplicate ids, no unknown tags or
  layouts, and the validator actually catches each of those when they are introduced.
- **markup** — balanced tags, one `h1` per page, every anchor and `aria-labelledby`
  resolving, every asset reference pointing at a file that exists, canonical/hreflang
  correctness, the CSP hash, no inline scripts/styles/handlers, and the escaping of
  hostile content.
- **http** — builds, starts the preview server, and fetches the real pages, the assets,
  a 404, and a handful of path-traversal attempts.

## Notes on the content

Written by hand, not sponsored, and deliberately light on opening hours and prices —
those change constantly. Check before you go.
