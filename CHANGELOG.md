# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- A Calibre-Web device (Calibre-Web or Calibre-Web Automated, read through its
  OPDS catalog): online, number of books, authors and series, last book added.
- The scene trigger "New book added", with the title and the author of the
  book (filter: author). Nothing is announced at the first start.
- The scene action "Read the latest Calibre-Web additions": the books of the
  last 7 days as a sentence for a message or a speaker.
- The dashboard widget "Calibre-Web: recently added": the last books with
  their covers and authors, the book and author counts (a setting hides them).
- A user and password of Calibre-Web, or anonymous browsing; texts and
  documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-calibre-web/commits/main
