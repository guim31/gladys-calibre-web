// -----------------------------------------------------------------------------
// The hub: reads the Calibre-Web catalog (OPDS) on a timer of the container,
// publishes the states of the Calibre-Web device when they change, fires the
// "new book" scene event, and serves the scene action and the widget.
//
// One reading every `pollIntervalMs` (1 to 15 minutes, configuration): the
// first page of "Recently added" (one request). The counts of books, authors
// and series cost a few requests each (no total in OPDS, src/calibre/client.js):
// read at the start, hourly, and when the recent books change.
//
// New books: the Calibre ids of "Recently added" above the highest id seen
// (Calibre numbers its books in increasing order), with the cursor kept under
// /data, so a book is announced once, also across restarts; the first reading
// of a server is the starting point, nothing is announced for it.
//
// Gladys never polls the device (should_poll: false): the scene events must
// fire even before the device is added.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { CalibreClient, ERROR_KINDS, LISTS } from './calibre/client.js';
import { buildServerDevice, featureValues, serverIds } from './devices.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  RECENT_TEXT,
  REPORT_TEXT,
  everyLanguage,
  labelled,
  listOf,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'calibre-web-hub' });

// Widget keys (manifest `widgets`): permanent once published.
export const WIDGET_KEYS = Object.freeze({
  RECENTLY_ADDED: 'recently_added',
});

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  BOOK_ADDED: 'book_added',
});

export const HUB_TIMINGS = {
  // The counts cost a few requests: read them hourly, or when books change.
  countsMs: 60 * 60_000,
  // After a list in error, count again this soon.
  countRetryMs: 10 * 60_000,
  // At most this many scene events per reading (a first big import).
  maxEventsPerRead: 10,
  // Republish an unchanged value this often (Gladys flags a value older than 48 h).
  heartbeatMs: 12 * 60 * 60_000,
  // "Read the latest additions": the window, in days.
  recentDays: 7,
};

const signature = (config) => JSON.stringify([config.url, config.username, config.password]);

const emptySnapshot = () => ({
  reachable: null,
  flavor: null,
  books: null,
  authors: null,
  series: null,
  lastBook: null,
});

const emptySaved = (url = null) => ({ url, user: null, bookId: null });

const sameBooks = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export class CalibreHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/calibre/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.signature = null;
    this.snapshot = emptySnapshot();
    this.error = null;
    /** The first page of "Recently added", newest first. */
    this.recent = [];
    this.countsAt = 0;
    /** Time of the last successful reading of "Recently added". */
    this.readAt = 0;
    /** A list failed at the last count (counted again sooner). */
    this.countFailed = false;
    /** Cover keys the widget cannot show (too large, unknown format). */
    this.badCovers = new Set();
    /** Last value published per feature external id: { value, at }. */
    this.published = new Map();
    this.transport = null;
    this.connection = null;
    this.devicesKey = null;
    this.saved = emptySaved();
    this.timer = null;
    this.running = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  // --- Logs ------------------------------------------------------------------

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: the next occurrence is logged again. */
  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = { ...emptySaved(), ...saved };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transport = null;
    this.connection = null;
    this.devicesKey = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    if (signature(config) !== this.signature) {
      this.signature = signature(config);
      this.reset();
      this.client = config.url
        ? new CalibreClient({
            url: config.url,
            username: config.username,
            password: config.password,
            request: this.request,
          })
        : null;
      // Another server or another user sees other books: the cursor starts again.
      if (
        config.url &&
        (this.saved.url !== config.url || this.saved.user !== (config.username || null))
      ) {
        this.saved = { ...emptySaved(config.url), user: config.username || null };
        this.store.save(this.saved);
      }
    }
    try {
      await this.publishDevices();
      await this.refresh();
    } finally {
      // Even after a failure: the next tick tries again.
      this.schedule();
    }
  }

  reset() {
    this.published.clear();
    this.snapshot = emptySnapshot();
    this.error = null;
    this.recent = [];
    this.countsAt = 0;
    this.readAt = 0;
    this.badCovers.clear();
    this.transport = null;
  }

  /** A cover the widget cannot show: left out of its next contents. */
  rejectCover(key) {
    if (this.badCovers.has(key)) {
      return;
    }
    this.badCovers.add(key);
    logger.debug(`Cover ${key} left out of the widget`);
    // Bounded: an edited cover may become usable again after a restart.
    if (this.badCovers.size > 500) {
      this.badCovers.delete(this.badCovers.values().next().value);
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEYS.RECENTLY_ADDED);
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setTimeout(async () => {
      try {
        await this.refresh();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Reading failed', err, 'error');
      }
      this.schedule();
    }, this.config.pollIntervalMs);
  }

  // --- Reading the server ------------------------------------------------------

  /** One reading. Concurrent calls share the reading in progress. */
  refresh() {
    if (this.running && this.runningClient === this.client) {
      return this.running;
    }
    // A reading of a previous configuration may still run: this one follows it.
    const previous = this.running ?? Promise.resolve();
    const run = previous
      .catch(() => {})
      .then(() => this.read())
      .finally(() => {
        if (this.running === run) {
          this.running = null;
        }
      });
    this.running = run;
    this.runningClient = this.client;
    return run;
  }

  async read() {
    if (!this.client) {
      await this.afterChanges(new Set());
      return;
    }
    const client = this.guarded(this.client);
    const changed = new Set();
    try {
      await this.readServer(client, changed);
      if (client.stale()) {
        return; // reconfigured meanwhile
      }
      if (this.error) {
        logger.info(`${this.snapshot.flavor}: connection restored`);
      } else if (this.snapshot.reachable === null) {
        const who = this.config.username ? 'as a user' : 'anonymously';
        logger.info(`${this.snapshot.flavor}: connected ${who}`);
      }
      if (this.snapshot.reachable !== true) {
        changed.add(WIDGET_KEYS.RECENTLY_ADDED);
      }
      this.error = null;
      this.snapshot.reachable = true;
      await this.publishServer();
    } catch (err) {
      if (err.stale) {
        return; // reconfigured meanwhile: this reading is dropped
      }
      if (!err.kind) {
        throw err;
      }
      if (client.stale()) {
        return;
      }
      await this.applyFailure(err, changed);
    }
    await this.afterChanges(changed);
  }

  /**
   * The client of a reading: after each answer, a reading whose client was
   * replaced (a new address or user) stops before it changes anything.
   */
  guarded(client) {
    const stale = () => client !== this.client;
    return new Proxy(client, {
      get(target, name) {
        if (name === 'stale') {
          return stale;
        }
        const value = target[name];
        if (typeof value !== 'function') {
          return value;
        }
        return async (...args) => {
          const answer = await value.apply(target, args);
          if (stale()) {
            throw Object.assign(new Error('Reconfigured during the reading'), { stale: true });
          }
          return answer;
        };
      },
    });
  }

  async applyFailure(err, changed) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    if (this.snapshot.reachable !== false) {
      changed.add(WIDGET_KEYS.RECENTLY_ADDED);
    }
    this.snapshot.reachable = false;
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`Calibre-Web: ${err.message}`);
    } else {
      logger.debug(`Calibre-Web: ${err.message} (again)`);
    }
    await this.publishServer();
  }

  async readServer(client, changed) {
    const now = this.now();
    if (!this.snapshot.flavor) {
      this.snapshot.flavor = (await client.catalog()).flavor;
    }
    const recent = await client.newest();
    const booksChanged = !sameBooks(recent, this.recent);
    if (booksChanged) {
      changed.add(WIDGET_KEYS.RECENTLY_ADDED);
    }
    this.recent = recent;
    this.snapshot.lastBook = recent[0] ?? null;
    this.readAt = now;
    // The events first: a failing count must not hold them back.
    await this.announceBooks(recent);
    if (booksChanged || now - this.countsAt >= this.timings.countsMs) {
      // A book added, edited or deleted, or an hour gone: count again.
      this.countsAt = now;
      this.countFailed = false;
      try {
        this.snapshot.books = await this.optional(client, 'books', LISTS.BOOKS);
        this.snapshot.authors = await this.optional(client, 'authors', LISTS.AUTHORS);
        this.snapshot.series = await this.optional(client, 'series', LISTS.SERIES);
      } catch (err) {
        this.countsAt = 0; // the server failed mid-way: count at the next reading
        throw err;
      }
      if (this.countFailed) {
        // A list in error: try again sooner than the hour.
        this.countsAt = now - this.timings.countsMs + this.timings.countRetryMs;
      }
    }
  }

  /**
   * A count the device can do without: a list hidden for this user (404,
   * visibility settings of Calibre-Web), or a page in error, leaves the figure
   * empty instead of the server offline. A server that stops answering, or
   * refuses the user, is the error of the whole reading.
   */
  async optional(client, name, list) {
    try {
      const count = await client.count(list);
      this.resolved(`optional-${name}`);
      return count;
    } catch (err) {
      if (err.kind === ERROR_KINDS.HIDDEN) {
        this.problem(`optional-${name}`, `Calibre-Web: ${err.message}, ${name} count left empty`);
        return null;
      }
      if (![ERROR_KINDS.HTTP, ERROR_KINDS.NOT_CALIBRE].includes(err.kind)) {
        throw err;
      }
      // A passing error: the last known figure stays.
      this.countFailed = true;
      this.problem(`optional-${name}`, `Calibre-Web: ${err.message}, ${name} count kept`);
      return this.snapshot[name];
    }
  }

  /** New books: above the highest Calibre id seen. */
  async announceBooks(recent) {
    const newest = recent.reduce((max, book) => Math.max(max, book.id), 0);
    const cursor = this.saved.bookId;
    if (!Number.isFinite(cursor)) {
      this.saved.bookId = newest;
      this.store.save(this.saved);
      return;
    }
    const fresh = recent.filter((book) => book.id > cursor).sort((a, b) => a.id - b.id);
    if (fresh.length === 0) {
      return;
    }
    this.saved.bookId = Math.max(cursor, newest);
    this.store.save(this.saved);
    for (const book of fresh.slice(-this.timings.maxEventsPerRead)) {
      logger.debug(`New book: "${book.title}"`);
      await this.fire(TRIGGERS.BOOK_ADDED, {
        title: book.title,
        author: book.authors.join(', '),
      });
    }
  }

  /** Fire a scene event (the data keys are the ones the manifest declares). */
  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishDevices() {
    const devices = this.config?.url
      ? [
          buildServerDevice(
            this.gladys,
            { url: this.config.url, user: this.config.username },
            this.config.language,
          ),
        ]
      : [];
    const key = JSON.stringify(devices);
    if (key === this.devicesKey) {
      return;
    }
    // Even an empty list: the Discovery tab then shows no stale device.
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesKey = key;
      this.resolved('devices');
    } catch (err) {
      // Sent again at the next reading.
      this.problem('devices', `Devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: publish the device again, read the server. */
  async rediscover() {
    this.devicesKey = null;
    await this.publishDevices();
    await this.refresh();
  }

  /** The user added the device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (device.external_id !== serverIds(this.gladys).device) {
      return;
    }
    await this.publishServer({ force: true });
    for (const key of Object.values(WIDGET_KEYS)) {
      this.gladys.requestWidgetRefresh(key);
    }
  }

  async publishServer({ force = false } = {}) {
    // Sent again at each reading until Gladys takes it.
    await this.publishDevices();
    const now = this.now();
    const stale = this.snapshot.reachable === false;
    const states = [];
    for (const { key, externalId, value, text } of featureValues(this.gladys, this.snapshot)) {
      if (value === null) {
        continue;
      }
      const last = this.published.get(externalId);
      // While the server is down, the last values are not republished as fresh.
      const frozen = stale && key !== 'online';
      const fresh =
        last && last.value === value && (frozen || now - last.at < this.timings.heartbeatMs);
      if (!force && fresh) {
        continue;
      }
      states.push(
        text
          ? { device_feature_external_id: externalId, text: String(value) }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishStates(states);
      for (const state of states) {
        this.published.set(state.device_feature_external_id, {
          value: state.text ?? state.state,
          at: now,
        });
      }
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(changed) {
    await this.publishTransport();
    await this.publishConnectionStatus();
    for (const key of changed) {
      this.gladys.requestWidgetRefresh(key);
    }
  }

  async publishTransport() {
    if (this.snapshot.reachable === null || !this.config?.url) {
      return;
    }
    const transport = this.snapshot.reachable
      ? DEVICE_TRANSPORTS.LOCAL
      : DEVICE_TRANSPORTS.UNREACHABLE;
    if (transport === this.transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([
        { external_id: serverIds(this.gladys).device, transport },
      ]);
      this.transport = transport;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config?.url) {
      return {
        connected: false,
        message: this.config?.incomplete ? CONNECTION_TEXT.invalid : CONNECTION_TEXT.noServer,
      };
    }
    if (this.error) {
      return {
        connected: false,
        message: everyLanguage(ERROR_TEXT[this.error.kind], (text, language) =>
          labelled('Calibre-Web', text, language).slice(0, 200),
        ),
      };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands --------------------------------------------------------------------------

  requireClient() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.noServer, this.config?.language));
    }
    return this.client;
  }

  /** The error of an action, in the language of the configuration. */
  actionError(err) {
    if (!err.kind) {
      return err;
    }
    const text = pick(ERROR_TEXT[err.kind], this.config.language);
    return new Error(labelled('Calibre-Web', text, this.config.language));
  }

  /**
   * The books added in the last days, as a sentence for a message. Reads the
   * server now.
   * @returns {Promise<{ sentence: object, count: number, title: string }>}
   */
  async latestAdditions() {
    this.requireClient();
    // A reading of the last interval is fresh enough for a 7-day summary, and
    // keeps the action within its timeout on a large library.
    if (this.error || this.now() - this.readAt > this.config.pollIntervalMs + 60_000) {
      await this.refresh();
    }
    if (this.error) {
      throw this.actionError(this.error);
    }
    const days = this.timings.recentDays;
    const since = this.now() - days * 24 * 60 * 60_000;
    const fresh = this.recent.filter((book) => (book.addedAt ?? 0) >= since);
    const titles = fresh.map((book) =>
      book.authors.length > 0 ? `${book.title} (${book.authors[0]})` : book.title,
    );
    return {
      sentence: everyLanguage(RECENT_TEXT, (text) =>
        (fresh.length === 0
          ? text.none(days)
          : text.some(fresh.length, days, listOf(titles, fresh.length, text))
        ).slice(0, 1000),
      ),
      count: fresh.length,
      title: fresh[0]?.title ?? '',
    };
  }

  /** "Test the connection": read the server now, one line. */
  async testConnection() {
    await this.refresh();
    const status = this.connectionStatus();
    if (!status.connected) {
      return status.message;
    }
    const { flavor, books, authors, series } = this.snapshot;
    return everyLanguage(REPORT_TEXT, (text) =>
      [
        text.ok(flavor, this.config.username),
        ...(books === null ? [] : [text.books(books)]),
        ...(authors === null ? [] : [text.authors(authors)]),
        ...(series === null ? [] : [text.series(series)]),
      ].join(', '),
    );
  }
}

export { ERROR_KINDS };
