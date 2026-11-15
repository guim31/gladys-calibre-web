// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys and an in-memory Calibre-Web server:
// states, counts, the "new book" event and its cursor under /data, errors and
// the connection status, the reconfiguration, the scene action and the report.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRIGGERS, WIDGET_KEYS } from '../src/hub.js';
import {
  CONFIG,
  FakeCalibre,
  SERVER_URL,
  createWorld,
  serverDevice,
  serverFeature,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const state = (w, key) => w.fake.lastState(serverFeature(w.gladys, key));
const events = (w) => w.fake.sceneEvents.filter((event) => event.key === TRIGGERS.BOOK_ADDED);

test('the first reading publishes the device, the counts and the last book', async (t) => {
  const w = await world(t);
  const [device] = w.fake.discoveredDevices;
  assert.equal(device.external_id, serverDevice(w.gladys));
  assert.equal(device.should_poll, false);
  assert.deepEqual(
    device.params.map((param) => param.name),
    ['CALIBRE_WEB_URL', 'CALIBRE_WEB_USER'],
  );
  assert.equal(state(w, 'online'), 1);
  assert.equal(state(w, 'books'), 3);
  assert.equal(state(w, 'authors'), 3);
  assert.equal(state(w, 'series'), 1);
  assert.equal(state(w, 'last_book'), 'Twenty Thousand Leagues under the Seas — Jules Verne');
  assert.deepEqual(events(w), [], 'nothing announced at the first reading');
  assert.equal(w.fake.connectionStatus?.connected ?? true, true);
});

test('a new book fires one event with its title and authors, once', async (t) => {
  const w = await world(t);
  w.clock.advance(60_000);
  w.server.addBook(w.clock.now(), {
    title: 'Twenty Years After',
    authors: ['Alexandre Dumas', 'Auguste Maquet'],
  });
  await w.hub.refresh();
  await w.hub.refresh();
  assert.deepEqual(
    events(w).map((event) => event.data),
    [{ title: 'Twenty Years After', author: 'Alexandre Dumas, Auguste Maquet' }],
  );
  assert.equal(state(w, 'books'), 4, 'counted again at once');
  assert.equal(state(w, 'authors'), 4);
  assert.equal(state(w, 'last_book'), 'Twenty Years After — Alexandre Dumas, Auguste Maquet');
});

test('the cursor survives a restart: nothing twice, nothing missed', async (t) => {
  const first = await createWorld();
  first.clock.advance(60_000);
  first.server.addBook(first.clock.now(), { title: 'Before' });
  await first.hub.refresh();
  await first.app.stop();
  assert.equal(
    JSON.parse(readFileSync(join(first.dataDir, 'calibre-web-state.json'), 'utf8')).bookId,
    4,
  );
  // While the integration was stopped, one more book.
  first.server.addBook(first.clock.now(), { title: 'While stopped' });
  const second = await world(t, {
    server: first.server,
    dataDir: first.dataDir,
    clock: first.clock,
  });
  assert.deepEqual(
    events(second).map((event) => event.data.title),
    ['While stopped'],
  );
});

test('a big import announces the last ten books only', async (t) => {
  const w = await world(t);
  for (let i = 0; i < 15; i += 1) {
    w.server.addBook(w.clock.now() + i, { title: `Book ${i}` });
  }
  await w.hub.refresh();
  assert.deepEqual(
    events(w).map((event) => event.data.title),
    Array.from({ length: 10 }, (_, i) => `Book ${i + 5}`),
  );
});

test('a deleted book changes the counts, announces nothing', async (t) => {
  const w = await world(t);
  w.server.deleteBook(3);
  await w.hub.refresh();
  assert.equal(state(w, 'books'), 2);
  assert.equal(state(w, 'last_book'), 'The Three Musketeers — Alexandre Dumas');
  assert.deepEqual(events(w), []);
});

test('the counts walk the pages of large lists', async (t) => {
  for (const total of [59, 60, 61, 120, 121, 1000, 1234]) {
    const server = new FakeCalibre({ pageSize: 60 });
    server.books = [];
    for (let i = 0; i < total; i += 1) {
      server.addBook(Date.parse('2026-11-01T00:00:00Z') + i, {
        title: `Book ${String(i).padStart(5, '0')}`,
        authors: [`Author ${i % 37}`],
        series: i % 3 === 0 ? `Series ${i % 11}` : undefined,
      });
    }
    const w = await world(t, { server });
    assert.equal(state(w, 'books'), total, `${total} books`);
    assert.equal(state(w, 'authors'), Math.min(total, 37));
    const requests = server.requests.filter((path) => path.startsWith('/opds/books/'));
    assert.ok(requests.length <= 2 * Math.log2(total / 60 + 1) + 3, `${requests.length} requests`);
  }
});

test('the counts are read again hourly, not at each reading', async (t) => {
  const w = await world(t);
  const counted = () => w.server.requests.filter((path) => path.startsWith('/opds/books/')).length;
  const before = counted();
  w.clock.advance(10 * 60_000);
  await w.hub.refresh();
  assert.equal(counted(), before);
  w.clock.advance(60 * 60_000);
  await w.hub.refresh();
  assert.equal(counted(), before + 1);
});

test('anonymous browsing: no user, no Authorization header', async (t) => {
  const server = new FakeCalibre({ anonymous: true });
  const w = await world(t, { server, config: { server_url: SERVER_URL } });
  assert.equal(state(w, 'books'), 3);
  assert.ok(w.network.log.every((request) => !request.headers?.Authorization));
  const [device] = w.fake.discoveredDevices;
  assert.deepEqual(
    device.params.map((param) => param.name),
    ['CALIBRE_WEB_URL'],
  );
});

test('hidden lists leave their count empty, the server stays online', async (t) => {
  const server = new FakeCalibre();
  server.hidden.add('author').add('series');
  const w = await world(t, { server });
  assert.equal(state(w, 'online'), 1);
  assert.equal(state(w, 'books'), 3);
  assert.equal(state(w, 'authors'), undefined);
  assert.equal(state(w, 'series'), undefined);
});

test('errors: wrong password, hidden "Recently added", server down, not Calibre-Web', async (t) => {
  const wrong = await world(t, { config: { ...CONFIG, password: 'wrong' } });
  assert.equal(state(wrong, 'online'), 0);
  assert.equal(wrong.fake.connectionStatus.connected, false);
  assert.equal(
    wrong.fake.connectionStatus.message.fr,
    'Calibre-Web : utilisateur ou mot de passe refusé',
  );

  const hidden = new FakeCalibre();
  hidden.hidden.add('new');
  const w = await world(t, { server: hidden });
  assert.match(w.fake.connectionStatus.message.en, /Recently added/);

  const down = await world(t);
  down.server.online = false;
  await down.hub.refresh();
  assert.equal(state(down, 'online'), 0);
  assert.equal(state(down, 'books'), 3, 'the last count stays');
  assert.equal(down.fake.connectionStatus.message.en, 'Calibre-Web: the server does not answer');
  assert.equal(down.fake.transports.at(-1).transport, 'unreachable');
  down.server.online = true;
  await down.hub.refresh();
  assert.equal(state(down, 'online'), 1);
  assert.equal(down.fake.connectionStatus.connected, true);
  assert.equal(down.fake.transports.at(-1).transport, 'local');

  const other = await world(t, {
    servers: {
      [SERVER_URL]: {
        requests: [],
        handle: () => ({ status: 200, headers: {}, body: '<html>Router</html>' }),
      },
    },
  });
  assert.equal(
    other.fake.connectionStatus.message.en,
    'Calibre-Web: no Calibre-Web catalog (OPDS) at this address',
  );

  // A wrong base path: /opds itself answers 404.
  const path = await world(t, { config: { ...CONFIG, server_url: `${SERVER_URL}/wrong` } });
  assert.equal(
    path.fake.connectionStatus.message.en,
    'Calibre-Web: no Calibre-Web catalog (OPDS) at this address',
  );
});

test('never the password in a status, a param or an error', async (t) => {
  const w = await world(t, { config: { ...CONFIG, password: 'wrong-secret-77' } });
  const everything = JSON.stringify([
    w.fake.discoveredDevices,
    w.fake.connectionStatus,
    await w.fake.action('test_connection', {}),
  ]);
  assert.ok(!everything.includes('wrong-secret-77'));
});

test('another server or user starts the cursor again, silently', async (t) => {
  const other = new FakeCalibre();
  other.addBook(Date.parse('2026-11-15T01:50:00Z'), { title: 'Elsewhere' });
  const w = await world(t, {
    servers: { [SERVER_URL]: new FakeCalibre(), 'http://192.0.2.11:8083': other },
  });
  await w.fake.configUpdated({ ...CONFIG, server_url: 'http://192.0.2.11:8083' });
  assert.equal(state(w, 'books'), 4);
  assert.deepEqual(events(w), [], 'the books of the new server are not news');
});

test('onDeviceCreated republishes every state and refreshes the widget', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  await w.fake.deviceCreated(w.fake.discoveredDevices[0]);
  assert.ok(w.fake.states.length >= before + 5, 'every feature again');
  assert.ok(w.fake.widgetRefreshes.includes(WIDGET_KEYS.RECENTLY_ADDED));
});

test('an unchanged value is republished after 12 hours (heartbeat)', async (t) => {
  const w = await world(t);
  const sent = () =>
    w.fake.states.filter((s) => s.device_feature_external_id === serverFeature(w.gladys, 'books'))
      .length;
  const before = sent();
  w.clock.advance(60 * 60_000);
  await w.hub.refresh();
  assert.equal(sent(), before);
  w.clock.advance(12 * 60 * 60_000);
  await w.hub.refresh();
  assert.equal(sent(), before + 1);
});

test('read the latest additions: a sentence in the configured language', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'fr' } });
  const ack = await w.fake.sceneAction('read_latest_additions', {});
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    sentence:
      '3 nouveau(x) livre(s) sur Calibre-Web ces 7 derniers jours : Twenty Thousand Leagues under the Seas (Jules Verne), The Three Musketeers (Alexandre Dumas) et Pride and Prejudice (Jane Austen).',
    count: 3,
    title: 'Twenty Thousand Leagues under the Seas',
  });
  w.clock.advance(8 * 24 * 60 * 60_000);
  const later = await w.fake.sceneAction('read_latest_additions', {});
  assert.equal(
    later.data.outputs.sentence,
    'Aucun nouveau livre sur Calibre-Web ces 7 derniers jours.',
  );
  assert.equal(later.data.outputs.title, '');
});

test('test the connection: the server, the user and the counts', async (t) => {
  const w = await world(t);
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  const message = ack.data?.message ?? ack.data;
  assert.equal(message.en, 'Calibre-Web: connected as reader, 3 book(s), 3 author(s), 1 series');
  const automated = new FakeCalibre();
  automated.automated = true;
  const cwa = await world(t, { server: automated });
  const again = await cwa.fake.action('test_connection', {});
  assert.match((again.data?.message ?? again.data).fr, /^Calibre-Web Automated : connecté/);
});

test('a count in error leaves its figure empty, events still fire', async (t) => {
  const w = await world(t);
  w.server.failing.add('/opds/author/letter/00');
  w.clock.advance(60_000);
  w.server.addBook(w.clock.now(), { title: 'Despite Errors' });
  await w.hub.refresh();
  assert.equal(state(w, 'online'), 1);
  assert.equal(state(w, 'books'), 4);
  assert.deepEqual(
    events(w).map((event) => event.data.title),
    ['Despite Errors'],
  );
  // Not counted again at each reading while the list fails.
  const before = w.server.requests.length;
  w.clock.advance(60_000);
  await w.hub.refresh();
  assert.equal(w.server.requests.length, before + 1, 'only "Recently added"');
});

test('the scene action reuses a fresh reading', async (t) => {
  const w = await world(t);
  const before = w.server.requests.length;
  await w.fake.sceneAction('read_latest_additions', {});
  assert.equal(w.server.requests.length, before);
  w.clock.advance(10 * 60_000);
  await w.fake.sceneAction('read_latest_additions', {});
  assert.equal(w.server.requests.length, before + 1);
});
