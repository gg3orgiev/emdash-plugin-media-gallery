# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Planned

- Drag-to-reorder, per-item alt-text inputs, and a primary-toggle control in the gallery widget.

## [0.1.0]

### Added

- Gallery field widget (`media-gallery:gallery`) for a built-in `json` field: add images via
  search or the EmDash media picker, remove them, with thumbnails.
- Single-image widget (`media-gallery:image`): a searchable replacement for the built-in image
  picker that reads and writes EmDash's native image value, so existing selections are preserved.
- Media search: when a field declares the `searchEndpoint` option, the widget renders a search
  box that queries a host-provided endpoint. EmDash has no built-in text search for local media.
- Server-side validation in a `content:beforeSave` hook: shape, bounds, duplicate-id and
  single-primary checks, resolution of every `mediaId` to a non-trashed media row, and binding
  of each item's `storageKey` to its media row.
- Storage-key safety: only relative keys are accepted (no traversal, scheme, leading slash, or
  control characters), enforced both in validation and when building URLs.
- Storefront runtime helper `hydrateMediaGallery(value, lookup?, options?)`, with a
  `d1MediaLookup(db)` convenience for Cloudflare D1.
- Stable stored-value contract:
  `{ mediaId, sortOrder, isPrimary, meta, storageKey?, width?, height? }`.

### Notes

- Requires EmDash `>= 0.14.0`. No runtime dependencies; `emdash`, `@emdash-cms/admin`, and
  `react` are peer dependencies.
