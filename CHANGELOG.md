# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Planned

- A primary-toggle control in the gallery widget.

## [0.2.0]

### Added

- Drag-to-reorder: gallery items can be reordered by dragging. Uses the native HTML5 Drag API
  with no additional dependencies. A drop indicator highlights the target position.
- Per-item alt-text inputs: when the `perItemFields` option lists metadata keys (e.g.
  `["alt_en", "alt_bg"]`), the widget renders a text input for each key below the thumbnail.
  Values are stored in the item's `meta` map and surfaced by `hydrateMediaGallery` via the
  `altKey` option (defaults to `"alt"`).

### Changed

- The widget now assigns `sortOrder` from array position on every edit, rather than re-sorting
  by old `sortOrder` values. This fixes reorder persistence after drag-drop.

### Dependencies

- Dev: emdash 0.16.1, @emdash-cms/admin 0.16.1, react 19.2.7, @types/react 19.2.16,
  tsup 8.5.1.

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
