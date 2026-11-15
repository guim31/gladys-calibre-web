// -----------------------------------------------------------------------------
// Calibre-Web client. Calibre-Web has no REST API: everything is read from its
// OPDS catalog (`/opds/...`), with HTTP Basic authentication of a Calibre-Web
// user (or none at all when the server allows anonymous browsing). The same
// routes serve Calibre-Web Automated, the fork.
//
// The feeds give no totals: a count is found by a search over the pages of a
// list (`?offset=`), about 2 × log2(pages) light requests (see count()).
//
// The password travels only in the Authorization header: never logged, never
// in an error message.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';
import { parseBooks, parseFeed } from './opds.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // user or password refused (401)
  HIDDEN: 'hidden', // the list is hidden for this user (404)
  NOT_CALIBRE: 'not_calibre', // something answers, not an OPDS catalog
  REDIRECT: 'redirect', // the address redirects (HTTP to HTTPS, a login page)
  HTTP: 'http', // any other HTTP error
});

export class CalibreError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'CalibreError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// The complete lists ("All" of the letter index) the counts read.
export const LISTS = Object.freeze({
  BOOKS: '/opds/books/letter/00',
  AUTHORS: '/opds/author/letter/00',
  SERIES: '/opds/series/letter/00',
});

// A count stops past this many pages (60 books a page by default: 60 million).
const MAX_PAGES = 1 << 20;

export class CalibreClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, with the path of a reverse proxy if any
   * @param {string} [options.username] empty: anonymous browsing
   * @param {string} [options.password]
   * @param {Function} [options.request] HTTP seam (src/calibre/http.js)
   */
  constructor({ url, username = '', password = '', request = httpRequest }) {
    this.url = url;
    this.request = request;
    this.authorization = username
      ? `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
      : null;
  }

  async send(path, { binary = false } = {}) {
    let answer;
    try {
      answer = await this.request(`${this.url}${path}`, {
        binary,
        headers: this.authorization ? { Authorization: this.authorization } : {},
      });
    } catch (err) {
      if (err.code === 'ETOOLARGE') {
        throw new CalibreError(ERROR_KINDS.HTTP, `${path.split('?')[0]}: answer too large`, {
          tooLarge: true,
        });
      }
      if (TLS_CODES.has(err.code)) {
        throw new CalibreError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      throw new CalibreError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
    }
    const route = path.split('?')[0];
    const { status, headers = {}, body } = answer;
    if (status === 401) {
      throw new CalibreError(
        ERROR_KINDS.AUTH,
        this.authorization ? 'User or password refused' : 'This server needs a user',
        { status },
      );
    }
    // Calibre-Web answers 404 when the user's visibility settings hide a
    // list (a 403 rather comes from a reverse proxy: an HTTP error).
    if (status === 404) {
      throw new CalibreError(ERROR_KINDS.HIDDEN, `${route}: HTTP ${status}`, { status });
    }
    if (status >= 300 && status < 400) {
      throw new CalibreError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status < 200 || status >= 300) {
      throw new CalibreError(ERROR_KINDS.HTTP, `${route} answered HTTP ${status}`, { status });
    }
    return { headers, body };
  }

  /** One page of a feed, parsed; NOT_CALIBRE when the answer is no Atom feed. */
  async feed(path) {
    const { body } = await this.send(path);
    const feed = parseFeed(body);
    if (!feed) {
      throw new CalibreError(ERROR_KINDS.NOT_CALIBRE, `${path.split('?')[0]}: not an OPDS feed`);
    }
    return feed;
  }

  /**
   * The root of the catalog: checks the address and the user, and names the
   * server ("Calibre-Web" or "Calibre-Web Automated", from the project link of
   * the feed).
   */
  async catalog() {
    let feed;
    try {
      feed = await this.feed('/opds');
    } catch (err) {
      // No catalog at all at this address (a wrong base path), not a hidden list.
      if (err.kind === ERROR_KINDS.HIDDEN) {
        throw new CalibreError(ERROR_KINDS.NOT_CALIBRE, `/opds: HTTP ${err.status}`);
      }
      throw err;
    }
    if (!/\/opds\/(new|books)\b/.test(feed.entries.join(''))) {
      throw new CalibreError(ERROR_KINDS.NOT_CALIBRE, '/opds: not a Calibre-Web catalog');
    }
    return {
      flavor: /calibre-web-automated/i.test(feed.uri) ? 'Calibre-Web Automated' : 'Calibre-Web',
    };
  }

  /** The first page of "Recently added" (newest first, the library's page size). */
  async newest() {
    return parseBooks(await this.feed('/opds/new'));
  }

  /**
   * The number of entries of a paginated list. Calibre-Web gives no total, but
   * a page tells whether a next one exists: a doubling search finds a page past
   * the end, a binary search the last page, whose size completes the count.
   */
  async count(path) {
    const pages = new Map();
    const page = async (index, size) => {
      if (!pages.has(index)) {
        const feed = await this.feed(index === 0 ? path : `${path}?offset=${index * size}`);
        pages.set(index, { length: feed.entries.length, next: feed.next });
      }
      return pages.get(index);
    };
    const first = await page(0, 0);
    if (!first.next) {
      return first.length;
    }
    // A page with a next one is full: its length is the page size.
    const size = first.length;
    if (size === 0) {
      throw new CalibreError(ERROR_KINDS.HTTP, `${path}: empty page with a next one`);
    }
    let low = 0; // a full page with a next one
    let high = 1;
    for (;;) {
      const current = await page(high, size);
      if (!current.next) {
        if (current.length > 0) {
          return high * size + current.length;
        }
        break; // past the end
      }
      low = high;
      high *= 2;
      if (high > MAX_PAGES) {
        throw new CalibreError(ERROR_KINDS.HTTP, `${path}: too many pages`);
      }
    }
    // page(low) has a next one, page(high) is empty.
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      const current = await page(middle, size);
      if (current.next) {
        low = middle;
      } else if (current.length === 0) {
        high = middle;
      } else {
        return middle * size + current.length;
      }
    }
    // The list shrank meanwhile: the last full page is the end.
    return (low + 1) * size;
  }

  /** The cover thumbnail of a book (JPEG or WebP bytes). */
  async cover(bookId) {
    return this.send(`/opds/cover/${encodeURIComponent(bookId)}`, { binary: true });
  }
}
