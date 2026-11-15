# Calibre-Web fixtures

Real answers of the OPDS catalog, captured on 15/11/2026 from the Docker images
`lscr.io/linuxserver/calibre-web` (Calibre-Web 0.6.27, `cw-*`) and
`crocodilestick/calibre-web-automated` (`cwa-*`), on a test library of four
public-domain EPUBs generated for the purpose (title, author, series and a
plain cover only).

- `*-root.xml`: `/opds`, the navigation root (the `<author><uri>` tells the fork).
- `*-new.xml`: `/opds/new`, "Recently added".
- `cw-authors.xml`, `cw-series.xml`: `/opds/author/letter/00`, `/opds/series/letter/00`.
- `cover-3.jpg`: `/opds/cover/3`.

The ids (`urn:uuid:…`) are random ids of that test library.
