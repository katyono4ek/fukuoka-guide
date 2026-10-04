import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHOTO_FORMATS, photoFormat, photoFile } from './photos.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
export const PHOTOS = join(CONTENT, 'photos');

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot parse ${file}: ${error.message}`);
  }
};

/**
 * Loads site config plus every section file in content/sections, ordered by
 * filename. Adding a section is therefore a matter of dropping in one JSON
 * file — no code change, no registry to update.
 */
export function loadContent() {
  const site = readJson(join(CONTENT, 'site.json'));
  const files = readdirSync(join(CONTENT, 'sections'))
    .filter((name) => name.endsWith('.json'))
    .sort();
  const sections = files.map((name) => ({
    source: `content/sections/${name}`,
    ...readJson(join(CONTENT, 'sections', name)),
  }));
  // Photos are optional: credits and alt text live in one manifest, keyed by
  // "hero" or "<section id>/<item id>", so section files stay pure text.
  const manifest = join(CONTENT, 'photos.json');
  const photos = existsSync(manifest) ? readJson(manifest) : {};
  const content = { site, sections, photos };
  const problems = validate(content);
  if (problems.length) {
    throw new Error(`Content validation failed:\n  - ${problems.join('\n  - ')}`);
  }
  return content;
}

/** True for a localised string bag such as { en: "…", ja: "…" }. */
const isLocalised = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length > 0 &&
  Object.keys(value).every((key) => /^[a-z]{2}$/.test(key)) &&
  Object.values(value).every((v) => typeof v === 'string');

/**
 * Walks the content tree and reports anything that would produce a half
 * translated page: a missing locale, an empty string, an unknown tag, a
 * duplicate id, an unsupported layout.
 */
export function validate({ site, sections, photos = {} }) {
  const problems = [];
  const locales = site.locales;
  const knownTags = new Set(Object.keys(site.tags ?? {}));
  const layouts = new Set(['cards', 'notes', 'timeline']);

  const walk = (node, path, expected) => {
    if (isLocalised(node)) {
      for (const locale of expected) {
        if (!node[locale] || !node[locale].trim()) {
          problems.push(`${path}: missing "${locale}" translation`);
        }
      }
      for (const locale of Object.keys(node)) {
        if (!locales.includes(locale)) problems.push(`${path}: unknown locale "${locale}"`);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`, expected));
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) walk(child, `${path}.${key}`, expected);
    }
  };

  if (!locales?.length) problems.push('site.json: locales must be a non-empty array');
  if (!locales?.includes(site.defaultLocale)) {
    problems.push(`site.json: defaultLocale "${site.defaultLocale}" is not in locales`);
  }
  walk({ title: site.title, tagline: site.tagline, description: site.description, ui: site.ui, tags: site.tags }, 'site', locales ?? []);

  const seenSections = new Set();
  for (const section of sections) {
    const where = section.source;
    if (!section.id) problems.push(`${where}: section needs an id`);
    if (seenSections.has(section.id)) problems.push(`${where}: duplicate section id "${section.id}"`);
    seenSections.add(section.id);
    if (!layouts.has(section.layout)) {
      problems.push(`${where}: unknown layout "${section.layout}" (expected ${[...layouts].join(', ')})`);
    }
    const expected = section.locales ?? locales ?? [];
    for (const locale of expected) {
      if (!locales.includes(locale)) problems.push(`${where}: locales lists unsupported "${locale}"`);
    }
    if (!section.items?.length) problems.push(`${where}: section has no items`);

    const seenItems = new Set();
    for (const item of section.items ?? []) {
      const itemWhere = `${where}#${item.id ?? '?'}`;
      if (!item.id) problems.push(`${itemWhere}: item needs an id`);
      if (seenItems.has(item.id)) problems.push(`${itemWhere}: duplicate item id`);
      seenItems.add(item.id);
      for (const tag of item.tags ?? []) {
        if (!knownTags.has(tag)) problems.push(`${itemWhere}: tag "${tag}" is not declared in site.json`);
      }
      if (section.layout === 'timeline' && !item.steps?.length) {
        problems.push(`${itemWhere}: timeline items need steps`);
      }
      if (section.layout !== 'timeline' && !item.text) {
        problems.push(`${itemWhere}: item needs text`);
      }
      if (item.map && typeof item.map !== 'string') problems.push(`${itemWhere}: map must be a string`);
    }
    walk({ title: section.title, intro: section.intro, items: section.items }, where, expected);
  }

  for (const [key, photo] of Object.entries(photos)) {
    const where = `content/photos.json#${key}`;
    let expected = locales ?? [];
    if (key !== 'hero') {
      const [sectionId, itemId] = key.split('/');
      const section = sections.find((s) => s.id === sectionId);
      if (!section?.items?.some((item) => item.id === itemId)) {
        problems.push(`${where}: no item "${itemId}" in a section "${sectionId}"`);
        continue;
      }
      if (section.layout !== 'cards') problems.push(`${where}: photos are only shown on cards layouts`);
      expected = section.locales ?? expected;
    }
    if (!isLocalised(photo.alt)) problems.push(`${where}: alt must be a localised string`);
    else walk(photo.alt, `${where}.alt`, expected);
    for (const field of ['author', 'license']) {
      if (typeof photo[field] !== 'string' || !photo[field].trim()) problems.push(`${where}: ${field} is required`);
    }
    for (const field of ['source', 'licenseUrl']) {
      if (photo[field] !== undefined && !/^https:\/\/[^\s"<>]+$/.test(photo[field])) {
        problems.push(`${where}: ${field} must be an https URL`);
      }
    }
    if (!photo.source) problems.push(`${where}: source is required`);
    for (const width of PHOTO_FORMATS[photoFormat(key)].widths) {
      if (!existsSync(join(PHOTOS, photoFile(key, width)))) {
        problems.push(`${where}: missing content/photos/${photoFile(key, width)} (run npm run photo)`);
      }
    }
  }
  return problems;
}

/** Picks a locale out of a localised bag, falling back to the default locale. */
export const t = (bag, locale, fallback = 'en') =>
  bag == null ? '' : (bag[locale] ?? bag[fallback] ?? '');

/** Sections that should be rendered for a given locale. */
export const sectionsFor = (sections, locale) =>
  sections.filter((section) => !section.locales || section.locales.includes(locale));
