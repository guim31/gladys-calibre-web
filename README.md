# Calibre-Web for Gladys Assistant

External integration connecting a [Calibre-Web](https://github.com/janeczku/calibre-web)
server (the self-hosted web front end of a Calibre e-book library), or its fork
[Calibre-Web Automated](https://github.com/crocodilestick/calibre-web-automated),
to [Gladys Assistant](https://gladysassistant.com), built on the official
[JavaScript SDK](https://github.com/GladysAssistant/integration-sdk-js) and the
[integration template](https://github.com/GladysAssistant/integration-template-js).

## Features

| Surface            | What you get                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Calibre-Web device | Online, books, authors, series, last book added ("Title — Author")                            |
| Scene trigger      | `book_added` (title and author of every new book; filter: author)                             |
| Scene action       | `read_latest_additions` (the books of the last 7 days as a sentence)                          |
| Dashboard widget   | `recently_added` (cover grid of the last 12 books with their authors, book and author counts) |

Texts and documentation in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- A Calibre-Web server (tested with 0.6.27) or Calibre-Web Automated, reachable
  from Gladys on the local network or behind a reverse proxy.
- A Calibre-Web user and its password (a reader account is enough), or none if
  anonymous browsing is enabled on the server.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-calibre-web`
   (or install **Calibre-Web** from the catalog once it is listed).
2. In **Configuration**, enter the address of your server
   (`http://192.168.1.20:8083`, or `https://example.org/books` behind a
   reverse proxy), the user and the password. Save, then click **Test the
   connection**.
3. Open the **Discover** tab and add the **Calibre-Web** device.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- Calibre-Web has no REST API: the integration reads its **OPDS catalog**
  (`/opds/...`), the one e-readers use, with HTTP Basic authentication of a
  Calibre-Web user (or anonymously). The same routes serve Calibre-Web
  Automated; the project link of the feed tells which one answers.
- One reading every 1 to 15 minutes (5 by default), on a timer of the
  container (`should_poll: false`): the first page of "Recently added", one
  request.
- OPDS gives no totals: the counts of books, authors and series are found by
  a doubling then binary search over the `?offset=` pages of each list (about
  2 × log2(pages) light requests), at the start, hourly, and when the recent
  books change.
- New books: the Calibre ids of "Recently added" above the highest id seen
  (Calibre numbers its books in increasing order), with the cursor kept in
  `/data`: announced once, also across restarts; the first reading of a server
  is the starting point. At most 10 events per reading.
- The covers of the widget are served through the widget image proxy of
  Gladys: the browser never sees the server nor the password. A cover the core
  would refuse (over 300 KB: Calibre-Web serves the full cover, Calibre-Web
  Automated a thumbnail) is left out of the next contents.
- Quiet logs: the lifecycle and the errors at info, once; titles only at
  debug. The password only travels in the Authorization header.
- `/stats` of Calibre-Web needs a browser session (login form with a CSRF
  token): it is not read.

## Checked against real servers

The client, the parser and the scenarios were checked against
**Calibre-Web 0.6.27** (`lscr.io/linuxserver/calibre-web`) and **Calibre-Web
Automated** (`crocodilestick/calibre-web-automated`, September 2026 image) with a
small library of public-domain EPUBs: the feeds in `test/fixtures/calibre-web/`
are real, and the integration ran in its locked-down container (read-only, no
capabilities, 256 MB) against both servers: counts over several pages, a new
book ingested, a wrong password, a stopped server. It has not yet run in a real
Gladys installation: feedback welcome.

## Limitations

- Polling, not push: a new book reaches Gladys within the interval.
- No reading progress, downloads or statistics: not in OPDS.
- No action on the library: the integration only reads.
- One server and one Calibre-Web user per installation of the integration.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against a fake Calibre-Web server that renders the markup of the
real feeds (`test/fixtures/calibre-web/`) and the fake Gladys of the SDK; they
never touch the network. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Calibre-Web](https://github.com/janeczku/calibre-web) (GPL-3.0) by Janeczku
  and contributors, and
  [Calibre-Web Automated](https://github.com/crocodilestick/calibre-web-automated)
  (GPL-3.0) by crocodilestick and contributors: their OPDS templates and routes
  were read to parse the feeds. No code was copied from them. The logo of the
  cover is the official Calibre-Web icon (`cps/static/icon.svg` of that
  repository).
- [Calibre](https://calibre-ebook.com) by Kovid Goyal.
- Built on the official
  [integration template](https://github.com/GladysAssistant/integration-template-js)
  and [SDK](https://github.com/GladysAssistant/integration-sdk-js), after
  [gladys-kavita](https://github.com/guim31/gladys-kavita).

## Disclaimer

Not affiliated with, nor endorsed by, the Calibre-Web, Calibre-Web Automated or
Calibre projects.

## License

[Apache-2.0](LICENSE)
