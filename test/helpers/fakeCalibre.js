// -----------------------------------------------------------------------------
// An in-memory Calibre-Web server behind the `request` seam of the client
// (src/calibre/http.js). Its feeds copy the markup of a real Calibre-Web
// 0.6.27 server (test/fixtures/calibre-web/), with the behaviors that matter:
// HTTP Basic authentication or anonymous browsing, the page size and the
// `?offset=` pagination without totals, lists hidden for a user (404), books
// added and deleted, covers, a server that does not answer.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixtureText = (name) =>
  readFileSync(new URL(`../fixtures/calibre-web/${name}`, import.meta.url), 'utf8');

// A real cover of the test library (300 × 450 JPEG).
export const COVER = readFileSync(new URL('../fixtures/calibre-web/cover-3.jpg', import.meta.url));

export const USER = 'reader';
export const PASSWORD = 'secret pass 42';

const escape = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const iso = (at) => new Date(at).toISOString().replace(/\.\d{3}Z$/, '+00:00');

// The four books of the test library, as the real server listed them.
export const LIBRARY = [
  {
    id: 1,
    title: 'Pride and Prejudice',
    authors: ['Jane Austen'],
    addedAt: Date.parse('2026-11-15T01:26:45Z'),
    cover: true,
  },
  {
    id: 2,
    title: 'The Three Musketeers',
    authors: ['Alexandre Dumas'],
    series: "The d'Artagnan Romances",
    addedAt: Date.parse('2026-11-15T01:26:48Z'),
    cover: true,
  },
  {
    id: 3,
    title: 'Twenty Thousand Leagues under the Seas',
    authors: ['Jules Verne'],
    addedAt: Date.parse('2026-11-15T01:26:53Z'),
    cover: true,
  },
];

function head(path, { next, offset }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/" xmlns:dcterms="http://purl.org/dc/terms/">
  <icon>/static/favicon.ico</icon>
  <id>urn:uuid:2853dacf-ed79-42f5-8e8a-a7bb3d1ae6a2</id>
  <updated>2026-11-15T02:29:32+00:00</updated>
  <link rel="self"
        href="${path}?"
        type="application/atom+xml;profile=opds-catalog;type=feed;kind=navigation"/>
  <link rel="start"
        href="/opds"
        type="application/atom+xml;profile=opds-catalog;type=feed;kind=navigation"/>
${
  next
    ? `  <link rel="next"
        title="Next"
        href="${path}?offset=${offset}"
        type="application/atom+xml;profile=opds-catalog;type=feed;kind=navigation"/>
`
    : ''
}  <link type="application/atom+xml" rel="search" title="Search" href="/opds/search/{searchTerms}" />
  <title>Calibre-Web</title>
  <author>
    <name>Calibre-Web</name>
    <uri>https://github.com/janeczku/calibre-web</uri>
  </author>
`;
}

const bookEntry = (book) => `
  <entry>
    <title>${escape(book.title)}</title>
    <id>urn:uuid:00000000-0000-4000-8000-${String(book.id).padStart(12, '0')}</id>
    <updated>${iso(book.addedAt)}</updated>
${book.authors.map((name) => `      <author>\n        <name>${escape(name)}</name>\n      </author>`).join('\n')}
    <published>101-01-01T00:00:00+00:00</published>
      <dcterms:language>eng</dcterms:language>
    <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">
    ${book.series ? `SERIES: ${escape(book.series)} [1]<br/>` : ''}
    </div></content>
${
  book.cover
    ? `    <link type="image/jpeg" href="/opds/cover/${book.id}" rel="http://opds-spec.org/image"/>
    <link type="image/jpeg" href="/opds/cover/${book.id}" rel="http://opds-spec.org/image/thumbnail"/>`
    : ''
}
    <link rel="http://opds-spec.org/acquisition" href="/opds/download/${book.id}/epub/"
          length="1492" title="EPUB" mtime="${iso(book.addedAt)}" type="application/epub+zip"/>
  </entry>`;

const listEntry = (folder, id, name) => `
  <entry>
    <title>${escape(name)}</title>
    <id>/opds/${folder}/${id}</id>
    <link rel="subsection" type="application/atom+xml;profile=opds-catalog" href="/opds/${folder}/${id}"/>
  </entry>`;

const atom = (status, body) => ({
  status,
  headers: { 'content-type': 'application/atom+xml; charset=utf-8' },
  body,
});

export class FakeCalibre {
  constructor({ user = USER, password = PASSWORD, anonymous = false, pageSize = 60 } = {}) {
    this.user = user;
    this.password = password;
    this.anonymous = anonymous;
    this.pageSize = pageSize;
    this.online = true;
    this.books = LIBRARY.map((book) => ({ ...book }));
    /** Lists hidden for the user (visibility settings): 'new', 'author', 'series'. */
    this.hidden = new Set();
    this.covers = new Map(LIBRARY.map((book) => [book.id, COVER]));
    this.requests = [];
    this.automated = false;
  }

  /** A book added to the library at `at`. */
  addBook(at, { title = 'New Book', authors = ['Some Author'], series, cover = false } = {}) {
    const id = Math.max(0, ...this.books.map((book) => book.id)) + 1;
    const book = { id, title, authors, series, addedAt: at, cover };
    this.books.push(book);
    return book;
  }

  deleteBook(id) {
    this.books = this.books.filter((book) => book.id !== id);
  }

  authorized(headers = {}) {
    const header = headers.Authorization ?? headers.authorization;
    if (!header) {
      return this.anonymous;
    }
    const expected = `Basic ${Buffer.from(`${this.user}:${this.password}`).toString('base64')}`;
    return header === expected;
  }

  page(path, offset, entries) {
    const slice = entries.slice(offset, offset + this.pageSize);
    const next = offset + this.pageSize < entries.length;
    return atom(
      200,
      `${head(path, { next, offset: offset + this.pageSize })}${slice.join('')}\n</feed>\n`,
    );
  }

  /** Answer one request (`path` without the base URL). */
  handle(path, { headers } = {}) {
    if (!this.online) {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
    const url = new URL(path, 'http://calibre');
    const route = url.pathname;
    const offset = Number(url.searchParams.get('offset') ?? 0);
    if (!route.startsWith('/opds')) {
      return { status: 302, headers: { location: '/login' }, body: '' };
    }
    if (!this.authorized(headers)) {
      return {
        status: 401,
        headers: { 'www-authenticate': 'Basic realm="Login Required"' },
        body: '',
      };
    }
    const sorted = [...this.books].sort((a, b) => a.title.localeCompare(b.title));
    if (route === '/opds') {
      const root = fixtureText(this.automated ? 'cwa-root.xml' : 'cw-root.xml');
      return atom(200, root);
    }
    if (route === '/opds/new') {
      if (this.hidden.has('new')) {
        return { status: 404, headers: {}, body: '<html>Not Found</html>' };
      }
      const newest = [...this.books].sort((a, b) => b.addedAt - a.addedAt);
      return this.page(route, offset, newest.map(bookEntry));
    }
    if (route === '/opds/books/letter/00') {
      return this.page(route, offset, sorted.map(bookEntry));
    }
    if (route === '/opds/author/letter/00') {
      if (this.hidden.has('author')) {
        return { status: 404, headers: {}, body: '' };
      }
      const names = [...new Set(this.books.flatMap((book) => book.authors))].sort();
      return this.page(
        route,
        offset,
        names.map((name, index) => listEntry('author', index + 1, name)),
      );
    }
    if (route === '/opds/series/letter/00') {
      if (this.hidden.has('series')) {
        return { status: 404, headers: {}, body: '' };
      }
      const names = [...new Set(this.books.map((book) => book.series).filter(Boolean))].sort();
      return this.page(
        route,
        offset,
        names.map((name, index) => listEntry('series', index + 1, name)),
      );
    }
    const cover = /^\/opds\/cover\/(\d+)$/.exec(route);
    if (cover) {
      const bytes = this.covers.get(Number(cover[1]));
      return bytes
        ? { status: 200, headers: { 'content-type': 'image/jpeg' }, body: bytes }
        : { status: 404, headers: {}, body: Buffer.alloc(0) };
    }
    return { status: 404, headers: {}, body: '' };
  }
}

/**
 * A fake network: `request(url, options)` routes each base URL to its fake
 * server, like src/calibre/http.js does over TCP.
 */
export function createNetwork(servers) {
  const log = [];
  const request = async (url, options = {}) => {
    log.push({ url, ...options });
    const base = Object.keys(servers).find((prefix) => url.startsWith(`${prefix}/`));
    if (!base) {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    }
    const server = servers[base];
    const path = url.slice(base.length);
    server.requests.push(path);
    const answer = server.handle(path, options);
    return options.binary || Buffer.isBuffer(answer.body)
      ? { ...answer, body: Buffer.isBuffer(answer.body) ? answer.body : Buffer.from(answer.body) }
      : answer;
  };
  return { request, log };
}
