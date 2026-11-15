// -----------------------------------------------------------------------------
// The Gladys device of the integration: one "Calibre-Web" device (identity
// `server:main`: moving the server to another address keeps the device and its
// history), seen through the configured Calibre-Web user:
//   online (input/binary), books, authors, series (counter-sensor/integer),
//   last_book (text/text: "Title — Author" of the last book added).
//
// Every feature is read-only (category/type couples of the core table, see
// test/gladys-rules.test.js). should_poll: false: the integration reads the
// server on its own timer (src/hub.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const SERVER_TYPE = 'server';
export const SERVER_ID = 'main';
export const URL_PARAM = 'CALIBRE_WEB_URL';
export const USER_PARAM = 'CALIBRE_WEB_USER';

// Suffixes of the feature external ids: permanent once published.
export const KEYS = Object.freeze({
  ONLINE: 'online',
  BOOKS: 'books',
  AUTHORS: 'authors',
  SERIES: 'series',
  LAST_BOOK: 'last_book',
});

// Feature names, per language (Gladys does not tell a device integration the
// user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [KEYS.ONLINE]: 'Online',
    [KEYS.BOOKS]: 'Books',
    [KEYS.AUTHORS]: 'Authors',
    [KEYS.SERIES]: 'Series',
    [KEYS.LAST_BOOK]: 'Last book added',
  },
  fr: {
    [KEYS.ONLINE]: 'En ligne',
    [KEYS.BOOKS]: 'Livres',
    [KEYS.AUTHORS]: 'Auteurs',
    [KEYS.SERIES]: 'Séries',
    [KEYS.LAST_BOOK]: 'Dernier livre ajouté',
  },
  de: {
    [KEYS.ONLINE]: 'Online',
    [KEYS.BOOKS]: 'Bücher',
    [KEYS.AUTHORS]: 'Autoren',
    [KEYS.SERIES]: 'Serien',
    [KEYS.LAST_BOOK]: 'Zuletzt hinzugefügtes Buch',
  },
  es: {
    [KEYS.ONLINE]: 'En línea',
    [KEYS.BOOKS]: 'Libros',
    [KEYS.AUTHORS]: 'Autores',
    [KEYS.SERIES]: 'Series',
    [KEYS.LAST_BOOK]: 'Último libro añadido',
  },
};

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 10_000_000;

const readOnly = { read_only: true, has_feedback: false };

const binary = (key, value) => ({
  key,
  definition: {
    ...readOnly,
    category: DEVICE_FEATURE_CATEGORIES.INPUT,
    type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
    keep_history: true,
    min: 0,
    max: 1,
  },
  value,
});

const counter = (key, value) => ({
  key,
  definition: {
    ...readOnly,
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    keep_history: true,
    min: 0,
    max: COUNTER_MAX,
  },
  value,
});

const textFeature = (key, value) => ({
  key,
  text: true,
  definition: {
    ...readOnly,
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    keep_history: false,
    min: 0,
    max: 0,
  },
  value,
});

// The text of a book: "Title — Author, Author" (the core keeps short texts).
export const bookLine = (book) =>
  (book.authors.length > 0 ? `${book.title} — ${book.authors.join(', ')}` : book.title).slice(
    0,
    255,
  );

// Order = display order in Gladys. `value` reads the snapshot of the hub.
export const FEATURES = [
  binary(KEYS.ONLINE, (s) => (s.reachable === null ? null : s.reachable ? 1 : 0)),
  counter(KEYS.BOOKS, (s) => s.books ?? null),
  counter(KEYS.AUTHORS, (s) => s.authors ?? null),
  counter(KEYS.SERIES, (s) => s.series ?? null),
  textFeature(KEYS.LAST_BOOK, (s) => (s.lastBook ? bookLine(s.lastBook) : null)),
];

export const serverIds = (gladys) => gladys.externalIds(SERVER_TYPE, SERVER_ID);

const namesOf = (language) => NAMES[language] ?? NAMES.en;

/** The discovery payload of the Calibre-Web device. */
export function buildServerDevice(gladys, { url, user }, language = 'en') {
  const ids = serverIds(gladys);
  return {
    name: 'Calibre-Web',
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: url }, ...(user ? [{ name: USER_PARAM, value: user }] : [])],
    features: FEATURES.map(({ key, definition }) => ({
      ...definition,
      name: namesOf(language)[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The value of every feature (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|string|null, text: boolean }>}
 */
export function featureValues(gladys, snapshot) {
  const ids = serverIds(gladys);
  return FEATURES.map(({ key, value, text = false }) => ({
    key,
    externalId: ids.feature(key),
    value: value(snapshot),
    text,
  }));
}
