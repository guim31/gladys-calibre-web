// -----------------------------------------------------------------------------
// The widget: valid content for the core in every state (configured or not,
// server down, every language), covers served from Calibre-Web, the setting
// that hides the counts, a cover the core would refuse left out.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from '../src/hub.js';
import { COVER, createWorld } from './helpers/world.js';

const KEY = WIDGET_KEYS.RECENTLY_ADDED;

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, language = 'en', settings = {}) {
  const ack = await w.fake.widgetGet(KEY, { settings, language });
  assert.equal(ack.success, true, ack.error);
  const { content: value } = ack.data;
  assert.deepEqual(validateWidgetContent(value), [], `${KEY} (${language})`);
  return value;
}

test('the widget is valid in every language and state', async (t) => {
  const configured = await world(t);
  const empty = await world(t, { config: {} });
  const down = await world(t);
  down.server.online = false;
  await down.hub.refresh();
  const none = await world(t);
  none.server.books = [];
  await none.hub.refresh();
  for (const w of [configured, empty, down, none]) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      await content(w, language);
    }
  }
  assert.equal(
    (await content(none, 'fr')).components.at(-1).text,
    "La bibliothèque n'a encore aucun livre.",
  );
});

test('recently added: the counts and a cover grid, newest first', async (t) => {
  const w = await world(t);
  w.server.addBook(w.clock.now(), { title: 'No Cover Here', authors: [] });
  await w.hub.refresh();
  const { components } = await content(w, 'fr');
  assert.deepEqual(
    components.filter((c) => c.type === 'value').map((c) => [c.label, c.value]),
    [
      ['Livres', 4],
      ['Auteurs', 3],
    ],
  );
  const grid = components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    grid.items.map((item) => [item.title, item.subtitle ?? null, item.image ?? null]),
    [
      ['No Cover Here', null, null],
      ['Twenty Thousand Leagues under the Seas', 'Jules Verne', 'book-3'],
      ['The Three Musketeers', 'Alexandre Dumas', 'book-2'],
      ['Pride and Prejudice', 'Jane Austen', 'book-1'],
    ],
  );
});

test('the setting hides the counts', async (t) => {
  const w = await world(t);
  for (const off of [false, 'false']) {
    const { components } = await content(w, 'en', { show_counts: off });
    assert.deepEqual(
      components.map((c) => c.type),
      ['card-list'],
    );
  }
});

test('covers come from Calibre-Web, only for the keys the widget declares', async (t) => {
  const w = await world(t);
  const ack = await w.fake.widgetGetImage('book-2');
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.image, COVER.toString('base64'));
  for (const key of ['book-x', '../etc/passwd', 'series-2']) {
    assert.equal((await w.fake.widgetGetImage(key)).success, false, key);
  }
});

test('a cover too large for the core is left out of the next contents', async (t) => {
  const w = await world(t);
  w.server.covers.set(1, Buffer.concat([COVER, Buffer.alloc(400 * 1024)]));
  assert.equal((await w.fake.widgetGetImage('book-1')).success, false);
  assert.ok(w.fake.widgetRefreshes.includes(KEY));
  const grid = (await content(w)).components.find((c) => c.type === 'card-list');
  const pride = grid.items.find((item) => item.title === 'Pride and Prejudice');
  assert.equal(pride.image, undefined);
  // A server down does not hide a cover.
  w.server.online = false;
  assert.equal((await w.fake.widgetGetImage('book-2')).success, false);
  w.server.online = true;
  const again = (await content(w)).components.find((c) => c.type === 'card-list');
  assert.equal(again.items.find((item) => item.title === 'The Three Musketeers').image, 'book-2');
});

test('a cover over the download limit is left out too', async (t) => {
  const w = await world(t);
  const original = w.hub.client.request;
  w.hub.client.request = async (url, options) => {
    if (url.endsWith('/opds/cover/2')) {
      throw Object.assign(new Error('Response too large'), { code: 'ETOOLARGE' });
    }
    return original(url, options);
  };
  assert.equal((await w.fake.widgetGetImage('book-2')).success, false);
  assert.ok(w.hub.badCovers.has('book-2'));
});
