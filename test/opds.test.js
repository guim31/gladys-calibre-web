// -----------------------------------------------------------------------------
// The OPDS parser on real feeds of Calibre-Web 0.6.27 and Calibre-Web
// Automated (test/fixtures/calibre-web/), and on the corner cases of the markup.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeXml, parseBook, parseBooks, parseFeed } from '../src/calibre/opds.js';
import { fixtureText } from './helpers/fakeCalibre.js';

test('the "Recently added" feed of Calibre-Web and of Calibre-Web Automated', () => {
  for (const name of ['cw-new.xml', 'cwa-new.xml']) {
    const feed = parseFeed(fixtureText(name));
    assert.equal(feed.next, false);
    const books = parseBooks(feed);
    assert.deepEqual(
      books.map(({ id, title, authors, cover }) => [id, title, authors.join(', '), cover]),
      [
        [4, 'Twenty Thousand Leagues under the Seas', 'Jules Verne', true],
        [3, 'The Three Musketeers', 'Alexandre Dumas', true],
        [2, 'Pride and Prejudice', 'Jane Austen', true],
      ],
    );
    // `updated` is the time the book was added (UTC), newest first.
    assert.equal(books[0].addedAt, Date.parse('2026-11-15T01:26:53Z'));
    assert.ok(books[0].addedAt > books[1].addedAt && books[1].addedAt > books[2].addedAt);
  }
});

test('the project link tells the fork from Calibre-Web', () => {
  assert.match(parseFeed(fixtureText('cw-root.xml')).uri, /janeczku\/calibre-web$/);
  assert.match(parseFeed(fixtureText('cwa-root.xml')).uri, /calibre-web-automated$/);
  assert.equal(parseFeed(fixtureText('cw-authors.xml')).entries.length, 3);
  assert.equal(parseFeed(fixtureText('cw-series.xml')).entries.length, 1);
});

test('entities, several authors, no cover, no id', () => {
  assert.equal(
    decodeXml('The d&#39;Artagnan &amp; &lt;Co&gt; &#x2014; &eacute;'),
    "The d'Artagnan & <Co> — &eacute;",
  );
  const book = parseBook(`<entry><title>A &amp; B</title><updated>bad</updated>
    <author><name>One</name></author><author><name>Two</name></author>
    <link rel="http://opds-spec.org/acquisition" href="/base/opds/download/12/epub/"/></entry>`);
  assert.deepEqual(book, {
    id: 12,
    title: 'A & B',
    authors: ['One', 'Two'],
    addedAt: null,
    cover: false,
  });
  assert.equal(parseBook('<entry><title>Lost</title></entry>'), null);
  assert.equal(parseFeed('<html><body>Login</body></html>'), null);
  assert.equal(parseFeed(''), null);
});
