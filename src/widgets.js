// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `recently_added`, a
// cover grid of the last books added to Calibre-Web (title and author), with
// the book and author counts (a setting hides them).
//
// The figures are sent as values, not bound to device features, so the
// widget works before the device is added to Gladys.
//
// Covers: the content declares a key per book, Gladys asks for its bytes
// through onWidgetGetImage, and the hub reads the thumbnail from Calibre-Web:
// the browser never loads a third-party URL, and the password never leaves.
// -----------------------------------------------------------------------------

import { validateWidgetImage } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from './hub.js';
import { pick } from './texts.js';

const MAX_CARDS = 12;
const MAX_IMAGE_BYTES = 300 * 1024;
const COVER_KEY = /^book-(\d{1,12})$/;

export const TEXT = {
  configure: {
    en: 'Enter the address of your Calibre-Web server in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre serveur Calibre-Web dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Calibre-Web-Servers in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su servidor Calibre-Web en la configuración de la integración.',
  },
  unreachable: {
    en: 'The Calibre-Web server does not answer: see the status of the integration.',
    fr: "Le serveur Calibre-Web ne répond pas : voyez l'état de l'intégration.",
    de: 'Der Calibre-Web-Server antwortet nicht: Sieh dir den Status der Integration an.',
    es: 'El servidor Calibre-Web no responde: consulte el estado de la integración.',
  },
  empty: {
    en: 'The library has no book yet.',
    fr: "La bibliothèque n'a encore aucun livre.",
    de: 'Die Bibliothek hat noch kein Buch.',
    es: 'La biblioteca todavía no tiene ningún libro.',
  },
  books: { en: 'Books', fr: 'Livres', de: 'Bücher', es: 'Libros' },
  authors: { en: 'Authors', fr: 'Auteurs', de: 'Autoren', es: 'Autores' },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** Image key of the cover of a book (Calibre ids are integers). */
export const coverKey = (bookId) => {
  const key = `book-${bookId}`;
  return COVER_KEY.test(key) ? key : null;
};

// Only for a book that has a cover the widget can show.
const withCover = (hub, book) => {
  const image = book.cover ? coverKey(book.id) : null;
  return image && !hub.badCovers.has(image) ? { image } : {};
};

// A boolean setting: on unless set to false (older widgets have no settings).
const shown = (settings, key) => settings?.[key] !== false && settings?.[key] !== 'false';

async function getRecentlyAdded(hub, { language = 'en', settings = {} }) {
  if (!hub.client) {
    return message(TEXT.configure, language);
  }
  if (hub.error && hub.recent.length === 0) {
    return message(TEXT.unreachable, language);
  }
  const { books, authors } = hub.snapshot;
  const components = [];
  if (shown(settings, 'show_counts')) {
    if (books !== null) {
      components.push({
        type: 'value',
        value: books,
        label: t(TEXT.books, language),
        icon: 'book',
      });
    }
    if (authors !== null) {
      components.push({
        type: 'value',
        value: authors,
        label: t(TEXT.authors, language),
        icon: 'users',
      });
    }
  }
  if (hub.recent.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.empty, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'grid',
      items: hub.recent.slice(0, MAX_CARDS).map((book) => ({
        title: fit(book.title, 60),
        // In a grid, a date would replace the subtitle: the author matters more.
        ...(book.authors.length > 0 ? { subtitle: fit(book.authors.join(', '), 60) } : {}),
        ...withCover(hub, book),
      })),
    });
  }
  return { ttl_seconds: 300, components };
}

async function noAction(hub, { actionKey }) {
  throw new Error(`Unknown action ${actionKey}`);
}

/**
 * Bytes of a cover, as raw base64 (onWidgetGetImage). Only the keys this
 * widget declares, only from the configured server.
 */
export async function getImage(hub, imageKey) {
  const match = COVER_KEY.exec(String(imageKey));
  if (!match) {
    throw new Error(`Unknown image ${imageKey}`);
  }
  const client = hub.requireClient();
  // Calibre-Web serves the full cover (Calibre-Web Automated a thumbnail): one
  // above the limit of the core, or in a format it refuses, is left out of
  // the next contents instead of showing as a broken image.
  const refuse = (reason) => {
    hub.rejectCover(imageKey);
    return new Error(`Cover ${imageKey} not shown: ${reason}`);
  };
  let body;
  try {
    ({ body } = await client.cover(match[1]));
  } catch (err) {
    throw err.tooLarge ? refuse('over 4 MB') : err;
  }
  if (!Buffer.isBuffer(body) || body.length === 0 || body.length > MAX_IMAGE_BYTES) {
    throw refuse(`${body?.length ?? 0} bytes`);
  }
  const image = body.toString('base64');
  const problems = validateWidgetImage(image);
  if (problems.length > 0) {
    throw refuse(problems.join('; '));
  }
  return image;
}

export const WIDGETS = {
  [WIDGET_KEYS.RECENTLY_ADDED]: { get: getRecentlyAdded, action: noAction },
};
