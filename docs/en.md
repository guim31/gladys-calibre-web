# Calibre-Web

Connect your [Calibre-Web](https://github.com/janeczku/calibre-web) library
(the web front end of a Calibre e-book library, self-hosted) to Gladys: the
number of books, authors and series, the last book added, the latest additions
with their covers on the dashboard, and a scene event for every new book.
[Calibre-Web Automated](https://github.com/crocodilestick/calibre-web-automated)
works the same way.

The integration was tested against real Calibre-Web 0.6.27 and Calibre-Web
Automated servers (their Docker images), not yet in a real Gladys installation:
feedback welcome on the [Gladys forum](https://community.gladysassistant.com)
or in the [issues](https://github.com/guim31/gladys-calibre-web/issues).

## Requirements

- Gladys Assistant 5.1.0 or later.
- A **Calibre-Web** or **Calibre-Web Automated** server reachable from Gladys,
  on your network (or behind a reverse proxy).
- A **Calibre-Web user** and its password. The integration reads the OPDS
  catalog of Calibre-Web as this user: it sees the books this user sees. A
  reader account is enough; a dedicated account is a good idea. If anonymous
  browsing is enabled on the server, the user can stay empty.
- In the settings of this user, the **Recently added** list must stay visible
  (it is by default).

## Setup

1. Install the integration from the Gladys catalog.
2. In **Configuration**, enter the **Server URL** with its port (for example
   `http://192.168.1.20:8083`; behind a reverse proxy,
   `https://example.org/books`), the **User** and the **Password**.
3. If you wish, choose how often the server is read (every 5 minutes by
   default) and the language of the names.
4. Save, then click **Test the connection**: it shows the server
   (Calibre-Web or Calibre-Web Automated), the user and the counts it finds.
5. In the **Discovery** tab, add the **Calibre-Web** device.

## Device

**Calibre-Web** (one device for the server, seen through the configured user):

| Feature             | Meaning                                                     |
| ------------------- | ----------------------------------------------------------- |
| **Online**          | 1 while the integration reads the server                    |
| **Books**           | books of the library                                        |
| **Authors**         | authors with at least one book                              |
| **Series**          | series with at least one book                               |
| **Last book added** | title and authors of the last book added ("Title — Author") |

If the author or series list is hidden for the user (Calibre-Web user
settings), its count stays empty.

## Dashboard

- **Calibre-Web: recently added**: a grid of the last 12 books added, with
  their covers and authors, and the number of books and authors. The setting
  **Show the book and author counts** hides the two figures.

## Scenes

### Triggers

- **New book added**: a new book appears in the Calibre library (uploaded in
  Calibre-Web, added with Calibre, or ingested by Calibre-Web Automated).
  Filter: the author, exactly as shown in Calibre-Web (several authors:
  `Author One, Author Two`). Information: book title, author(s).

Nothing is announced at the first start: the books already in the library are
the starting point.

### Actions

- **Read the latest Calibre-Web additions**: a sentence for a notification or a
  speaker, for example _"2 new book(s) on Calibre-Web in the last 7 days: Pride
  and Prejudice (Jane Austen) and Twenty Years After (Alexandre Dumas)."_
  Results: the sentence, the number of new books, the title of the latest one
  (among the first page of "Recently added", 60 books by default).

### Scene ideas

- **A new book by my favourite author**: when _New book added_ with the author
  filled in, send a notification "New book: {title}".
- **Sunday digest**: every Sunday at 10 am, _Read the latest Calibre-Web
  additions_, then send the sentence as a message.
- **Family library**: when _New book added_, say "A new book is on the
  library: {title}" on the living room speaker.

## Troubleshooting

- **"the server does not answer"**: check the address and the port from the
  Gladys machine. Gladys runs the integration in a container: `localhost` is
  the container itself, use the IP address of the machine.
- **"user or password refused"**: check them by logging in to Calibre-Web.
  A server without anonymous browsing needs a user.
- **"the "Recently added" list is hidden for this user"**: in Calibre-Web,
  Admin → the user → show "Recently added" again.
- **"no Calibre-Web catalog (OPDS) at this address"** or **"the address
  redirects"**: a server behind a reverse proxy needs its base path
  (`https://example.org/books`); a login page of the proxy blocks the catalog.
- **"certificate refused"**: HTTPS with a self-signed certificate is not
  supported; use the `http://` address of your network.
- No cover in the widget: the book has none, or Calibre-Web serves a cover
  larger than 300 KB (Calibre-Web sends the full cover, Calibre-Web Automated
  a small thumbnail): it is left out.
- The integration only logs its lifecycle; with `LOG_LEVEL=debug`, it also
  logs each new book, with its title.

## Limitations

- Calibre-Web has no API for integrations: everything comes from its OPDS
  catalog, the one e-readers use. The server is read every 1 to 15 minutes
  (one light request); a new book reaches Gladys within this interval.
- The OPDS catalog gives no totals: the integration finds them by reading a
  few pages of each list (about 2 × log2(pages) requests), at the start,
  hourly, and when the recent books change.
- Reading progress, downloads and the statistics page of Calibre-Web are not
  available in OPDS without imitating a browser: they are not read.
- At most 10 events per reading (a first big import announces 10 books, not
  hundreds), among the books of the first page of "Recently added" (60 by
  default).
- One Calibre-Web server and one user per installation of the integration.
- Not affiliated with the Calibre-Web or Calibre projects.
