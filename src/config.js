// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Calibre-Web server (or Calibre-Web Automated): its address, and the
// user and password of a Calibre-Web account, or no user at all when the
// server allows anonymous browsing.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Reading intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['60', '300', '900'];

export const DEFAULT_CONFIG = {
  server_url: '',
  username: '',
  password: '',
  poll_interval: '300',
  language: 'fr',
};

// Pages of the web client a user may copy from the browser.
const CLIENT_PAGES =
  /\/(opds(\/.*)?|login|me|stats|advsearch|admin(\/.*)?|search(\/.*)?|(book|shelf)\/\d+|(author|series|category|publisher|language|ratings|formats|hot|rated|discover|unreadbooks|readbooks|table)(\/[^/]*)?)$/i;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:8083`), or the URL copied from the browser, with the base path
 * of a server behind a reverse proxy (`https://example.org/books/`). HTTP by
 * default; the query, the fragment, a trailing slash and the page of the web
 * client dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/base]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const typed = raw.trim();
  if (!typed) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `http://${typed}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname.replace(CLIENT_PAGES, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  const typed = text('server_url');
  const url = parseServerUrl(typed);
  const username = text('username');
  // A password may begin or end with a space: kept as typed.
  const password = typeof source.password === 'string' ? source.password : '';
  // A user name cannot hold a colon in HTTP Basic authentication.
  const usable = Boolean(url) && !username.includes(':');
  return {
    url: usable ? url : null,
    username: usable ? username : '',
    password: usable && username ? password : '',
    // Something typed, but not usable: the status says so.
    incomplete: Boolean(typed || username) && !usable,
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
