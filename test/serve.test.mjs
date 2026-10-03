/* End-to-end smoke test: builds the site, serves it, and fetches it over HTTP. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { build } from '../src/build.mjs';
import { ROOT } from '../src/content.mjs';

const PORT = 4399 + (process.pid % 200);
const origin = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  build();
  server = spawn(process.execPath, [join(ROOT, 'src', 'serve.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const started = once(server.stdout, 'data');
  await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error('server did not start')), 5000))]);
});

after(() => server?.kill());

const get = async (path) => {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
  return { status: response.status, type: response.headers.get('content-type'), body: await response.text() };
};

test('the root is a redirect, not a chooser', async () => {
  const res = await get('/');
  assert.equal(res.status, 200);
  assert.match(res.type, /text\/html/);
  assert.ok(!res.body.includes('gate-link'));
  assert.match(res.body, /assets\/gate\.js/);
});

test('both locale pages load', async () => {
  for (const locale of ['en', 'ja']) {
    const res = await get(`/${locale}/`);
    assert.equal(res.status, 200, `/${locale}/ should be 200`);
    assert.match(res.body, new RegExp(`<html lang="${locale}"`));
  }
});

test('assets load with the right content type', async () => {
  const css = await get('/assets/styles.css');
  assert.equal(css.status, 200);
  assert.match(css.type, /text\/css/);
  assert.match(css.body, /--rose:/);

  const js = await get('/assets/app.js');
  assert.equal(js.status, 200);
  assert.match(js.type, /javascript/);

  const icon = await get('/assets/favicon.svg');
  assert.equal(icon.status, 200);
  assert.match(icon.type, /image\/svg/);
});

test('an unknown path returns the 404 page', async () => {
  const res = await get('/fr/');
  assert.equal(res.status, 404);
  assert.match(res.body, /Lost in the arcade/);
});

test('the preview server refuses to escape its output directory', async () => {
  for (const path of [
    '/../package.json',
    '/../../etc/passwd',
    '/%2e%2e/package.json',
    '/assets/../../package.json',
    '/....//package.json',
  ]) {
    const res = await get(path);
    assert.equal(res.status, 404, `${path} must not be served`);
    assert.ok(!res.body.includes('"fukuoka-roadmap"'), `${path} leaked a project file`);
  }
});

test('a malformed URL gets a 404 and the server keeps running', async () => {
  for (const path of ['/%E0%A4%A', '/%', '/en/%zz']) {
    const res = await get(path);
    assert.equal(res.status, 404, `${path} should be a 404`);
  }
  const after = await get('/en/');
  assert.equal(after.status, 200, 'the server must survive a malformed request');
});
