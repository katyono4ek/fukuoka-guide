import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { loadContent, validate, t, sectionsFor, PHOTOS } from '../src/content.mjs';
import { PHOTO_FORMATS, photoFormat, photoFile } from '../src/photos.mjs';

const content = loadContent();
const clone = () => structuredClone(content);

test('the shipped content passes validation', () => {
  assert.deepEqual(validate(content), []);
});

test('every locale declared in site.json is covered by every unrestricted section', () => {
  for (const section of content.sections) {
    const expected = section.locales ?? content.site.locales;
    for (const locale of expected) {
      assert.ok(t(section.title, locale), `${section.source}: no title for ${locale}`);
      for (const item of section.items) {
        assert.ok(t(item.name, locale), `${section.source}#${item.id}: no name for ${locale}`);
      }
    }
  }
});

test('locale-restricted sections are dropped for other locales', () => {
  const en = sectionsFor(content.sections, 'en').map((s) => s.id);
  const ja = sectionsFor(content.sections, 'ja').map((s) => s.id);
  assert.ok(en.includes('phrases'), 'phrases is an English-only section');
  assert.ok(!ja.includes('phrases'));
  assert.ok(ja.length > 0 && ja.every((id) => en.includes(id)));
});

test('validation catches a missing translation', () => {
  const broken = clone();
  delete broken.sections[1].items[0].text.ja;
  const problems = validate(broken);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /missing "ja" translation/);
});

test('validation catches an empty translation', () => {
  const broken = clone();
  broken.sections[1].items[0].text.ja = '   ';
  assert.match(validate(broken).join(), /missing "ja" translation/);
});

test('validation catches an undeclared tag', () => {
  const broken = clone();
  broken.sections[1].items[0].tags = ['nonexistent-tag'];
  assert.match(validate(broken).join(), /tag "nonexistent-tag" is not declared/);
});

test('validation catches duplicate ids', () => {
  const broken = clone();
  broken.sections[1].items[1].id = broken.sections[1].items[0].id;
  assert.match(validate(broken).join(), /duplicate item id/);
});

test('validation catches an unknown layout', () => {
  const broken = clone();
  broken.sections[0].layout = 'carousel';
  assert.match(validate(broken).join(), /unknown layout "carousel"/);
});

test('validation catches an unknown locale', () => {
  const broken = clone();
  broken.sections[0].items[0].name.de = 'Zuerst';
  assert.match(validate(broken).join(), /unknown locale "de"/);
});

test('validation catches a timeline item with no steps', () => {
  const broken = clone();
  const timeline = broken.sections.find((s) => s.layout === 'timeline');
  delete timeline.items[0].steps;
  assert.match(validate(broken).join(), /timeline items need steps/);
});

test('validation catches a photo for an item that does not exist', () => {
  const broken = clone();
  broken.photos['food/takoyaki'] = broken.photos['food/yatai'];
  assert.match(validate(broken).join(), /no item "takoyaki" in a section "food"/);
});

test('validation catches photo alt text missing a translation', () => {
  const broken = clone();
  delete broken.photos.hero.alt.ja;
  assert.match(validate(broken).join(), /photos\.json#hero\.alt: missing "ja" translation/);
});

test('validation insists on credit fields and https links', () => {
  const broken = clone();
  broken.photos.hero.author = ' ';
  broken.photos['food/yatai'].source = 'javascript:alert(1)';
  delete broken.photos['food/udon'].license;
  const problems = validate(broken).join('\n');
  assert.match(problems, /#hero: author is required/);
  assert.match(problems, /#food\/yatai: source must be an https URL/);
  assert.match(problems, /#food\/udon: license is required/);
});

test('validation catches a photo whose files were never generated', () => {
  const broken = clone();
  const [section] = broken.sections.filter((s) => s.layout === 'cards' && s.id === 'cafes');
  broken.photos[`cafes/${section.items[0].id}`] = { ...broken.photos.hero };
  assert.match(validate(broken).join(), /missing content\/photos\/cafes-.*-640\.webp/);
});

test('validation refuses photos on layouts that do not show them', () => {
  const broken = clone();
  const notes = broken.sections.find((s) => s.layout === 'notes');
  broken.photos[`${notes.id}/${notes.items[0].id}`] = broken.photos.hero;
  assert.match(validate(broken).join(), /photos are only shown on cards layouts/);
});

test('content/photos holds exactly the files the manifest needs', () => {
  const expected = Object.keys(content.photos)
    .flatMap((key) => PHOTO_FORMATS[photoFormat(key)].widths.map((width) => photoFile(key, width)))
    .sort();
  assert.deepEqual(readdirSync(PHOTOS).sort(), expected, 'remove orphaned photos or add them to photos.json');
});

test('loadContent throws rather than emitting a half-translated site', () => {
  const broken = clone();
  delete broken.sections[0].items[0].text.ja;
  assert.throws(() => {
    const problems = validate(broken);
    if (problems.length) throw new Error(`Content validation failed:\n  - ${problems.join('\n  - ')}`);
  }, /Content validation failed/);
});

test('content is substantial enough to be useful', () => {
  const total = content.sections.reduce((n, s) => n + s.items.length, 0);
  assert.ok(content.sections.length >= 6, 'at least six sections');
  assert.ok(total >= 40, `at least forty entries, got ${total}`);
});
