// -----------------------------------------------------------------------------
// Parser of the OPDS feeds of Calibre-Web (and of its fork Calibre-Web
// Automated): Atom documents rendered by the `feed.xml` and `index.xml`
// templates of the server. A few regular expressions are enough for this
// fixed, server-generated markup, and keep the image free of an XML library.
// -----------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decode the XML entities of a text node (named and numeric). */
export function decodeXml(text) {
  return String(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
      if (code[0] === '#') {
        const point =
          code[1] === 'x' || code[1] === 'X'
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10);
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const firstText = (xml, tag) => {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? decodeXml(match[1]) : '';
};

const dateOf = (text) => {
  const at = Date.parse(text);
  return Number.isFinite(at) ? at : null;
};

/**
 * One page of a feed: its entries, whether a next page exists, and the
 * address of the project behind the server (`<author><uri>` of the feed,
 * which tells Calibre-Web Automated from Calibre-Web).
 * @param {string} xml
 * @returns {{ entries: string[], next: boolean, title: string, uri: string }|null}
 *   null when the document is not an Atom feed
 */
export function parseFeed(xml) {
  const text = String(xml ?? '');
  const start = text.search(/<feed[\s>]/);
  if (start < 0 || !text.includes('</feed>')) {
    return null;
  }
  const entries = text.slice(start).match(/<entry[\s>][\s\S]*?<\/entry>/g) ?? [];
  const head = text.slice(start).split(/<entry[\s>]/)[0];
  const author = /<author>([\s\S]*?)<\/author>/.exec(head)?.[1] ?? '';
  return {
    entries,
    next: /<link\b[^>]*\brel="next"/.test(head),
    title: firstText(head, 'title'),
    uri: firstText(author, 'uri'),
  };
}

/**
 * A book entry of an acquisition feed (`/opds/new`, `/opds/books/...`).
 * The id is the Calibre book id, read in the cover or download links
 * (`/opds/cover/12`, `/opds/download/12/epub/`); Calibre numbers its books
 * in increasing order and never reuses an id.
 * @returns {{ id: number, title: string, authors: string[], addedAt: number|null, cover: boolean }|null}
 */
export function parseBook(entry) {
  const id = Number(/\/opds\/(?:cover|download)\/(\d{1,12})\b/.exec(entry)?.[1]);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }
  const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)]
    .map((match) => decodeXml(match[1]))
    .filter(Boolean);
  return {
    id,
    title: firstText(entry, 'title') || `#${id}`,
    authors,
    // `updated` is the date the book was added to the library (`timestamp`).
    addedAt: dateOf(firstText(entry, 'updated')),
    cover: /rel="http:\/\/opds-spec\.org\/image"/.test(entry),
  };
}

/** The books of a feed page, in feed order, without the unreadable entries. */
export const parseBooks = (feed) => feed.entries.map(parseBook).filter(Boolean);
