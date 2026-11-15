import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseServerUrl } from '../src/config.js';

test('the address typed by the user becomes a base URL', () => {
  assert.equal(parseServerUrl('192.0.2.10:8083'), 'http://192.0.2.10:8083');
  assert.equal(parseServerUrl(' http://192.0.2.10:8083/ '), 'http://192.0.2.10:8083');
  assert.equal(parseServerUrl('https://example.org/books/'), 'https://example.org/books');
  assert.equal(parseServerUrl('http://192.0.2.10:8083/book/12?x=1#top'), 'http://192.0.2.10:8083');
  assert.equal(
    parseServerUrl('https://example.org/calibre/opds/new'),
    'https://example.org/calibre',
  );
  assert.equal(parseServerUrl('https://example.org/calibre/login'), 'https://example.org/calibre');
  assert.equal(parseServerUrl('http://192.0.2.10:8083/author/3'), 'http://192.0.2.10:8083');
  assert.equal(parseServerUrl('http://user:secret@192.0.2.10:8083'), null);
  assert.equal(parseServerUrl('ftp://192.0.2.10'), null);
  assert.equal(parseServerUrl(''), null);
  assert.equal(parseServerUrl(42), null);
});

test('normalizeConfig: defaults, anonymous browsing, invalid configuration', () => {
  assert.deepEqual(normalizeConfig({}), {
    url: null,
    username: '',
    password: '',
    incomplete: false,
    pollIntervalMs: 300_000,
    language: DEFAULT_CONFIG.language,
  });
  // No user: anonymous browsing, a password alone is ignored.
  assert.deepEqual(normalizeConfig({ server_url: '192.0.2.10:8083', password: 'x' }), {
    url: 'http://192.0.2.10:8083',
    username: '',
    password: '',
    incomplete: false,
    pollIntervalMs: 300_000,
    language: 'fr',
  });
  const config = normalizeConfig({
    server_url: '192.0.2.10:8083',
    username: ' reader ',
    password: ' spaced ',
    poll_interval: '60',
    language: 'de',
  });
  assert.deepEqual(config, {
    url: 'http://192.0.2.10:8083',
    username: 'reader',
    password: ' spaced ',
    incomplete: false,
    pollIntervalMs: 60_000,
    language: 'de',
  });
  assert.equal(normalizeConfig({ username: 'reader' }).incomplete, true);
  assert.equal(normalizeConfig({ server_url: 'x:8083', username: 'a:b' }).incomplete, true);
  assert.equal(normalizeConfig({ poll_interval: '7', language: 'it' }).pollIntervalMs, 300_000);
});
