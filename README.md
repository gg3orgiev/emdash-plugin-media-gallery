# emdash-plugin-media-gallery

A multi-image gallery field for [EmDash CMS](https://github.com/emdash-cms/emdash).

Attach an ordered list of images to a record, each with per-item metadata (such as alt text) and
an optional primary flag, using the EmDash media library. A second widget turns the built-in
single-image field into a searchable picker. Both add a search box for large media libraries,
which the built-in picker lacks.

- License: MIT
- Requires: EmDash `>= 0.14.0`
- Runtime dependencies: none (EmDash and React are peer dependencies)

```
Gallery
+------+ +------+ +------+ +------+
|  ::  | |  ::  | |  ::  | |  ::  |  [ + Add ]
|  1   | |  2   | |  3   | |  4   |
+------+ +------+ +------+ +------+
[Front ] [Side  ] [3/4   ] [Detail]   (drag to reorder)
```

## Why it works this way

EmDash has no array-of-images field, and its field-type list is closed, so a plugin cannot
register a new `mediaGallery` type. It can, however, attach a custom widget to an existing field
type. This plugin therefore stores galleries in the built-in `json` field and drives the editing
UI with a React field widget. The stored value is a small, documented JSON array, which is the
stable contract between the editor and your storefront.

## Install

```sh
npm install emdash-plugin-media-gallery
```

`emdash`, `@emdash-cms/admin`, and `react` are peer dependencies provided by the host EmDash
project.

## Usage

### 1. Register the plugin

In your EmDash config (for the Astro integration, `astro.config.mjs`):

```ts
import { mediaGalleryPlugin } from "emdash-plugin-media-gallery";

emdash({
  plugins: [mediaGalleryPlugin()],
});
```

### 2. Add a gallery field

In `.emdash/seed.json`, add a `json` field that opts into the widget via `widget`:

```jsonc
{
  "slug": "gallery",
  "label": "Gallery",
  "type": "json",
  "widget": "media-gallery:gallery",
  "options": {
    "maxItems": 20,
    "minItems": 0,
    "allowedMimeTypes": ["image/jpeg", "image/png", "image/webp", "image/avif"],
    "perItemFields": ["alt_en", "alt_bg"],
    "searchEndpoint": "/api/media-search"
  }
}
```

Adding a column to an existing collection also requires a matching `_emdash_fields` row, or
EmDash silently drops the write. See the EmDash docs for schema changes.

### 3. (Optional) Searchable single-image field

The built-in image picker has no search for the local library. To replace it on an existing
`image` field, set its `widget` to `media-gallery:image`. The value is stored in EmDash's native
image shape, so existing selections are preserved:

```jsonc
{ "slug": "image", "label": "Primary image", "type": "image", "widget": "media-gallery:image",
  "options": { "searchEndpoint": "/api/media-search" } }
```

### 4. Read the gallery on your storefront

```ts
import { hydrateMediaGallery, d1MediaLookup } from "emdash-plugin-media-gallery/runtime";

const images = await hydrateMediaGallery(row.gallery, d1MediaLookup(db));
// [{ mediaId, url, mimeType, width, height, alt, isPrimary, sortOrder, meta }, ...]
// Ordered by sortOrder. Missing, trashed, or keyless media are dropped.
```

`hydrateMediaGallery(value, lookup?, options?)` is database-agnostic: pass any
`lookup: (ids) => Promise<Map<id, MediaRow>>`. `d1MediaLookup(db)` is a convenience for
Cloudflare D1 (one `IN (...)` query). URLs default to the EmDash media proxy convention
`/api/media/<storageKey>`; override with `options.buildUrl`. The helper only reads.

## Field options

| Option | Type | Default | Purpose |
|---|---|---|---|
| `maxItems` | number | 20 | Maximum images (hard server cap: 200). |
| `minItems` | number | 0 | Minimum images required to validate. |
| `allowedMimeTypes` | string[] | common image types | MIME filter passed to the picker. |
| `perItemFields` | string[] | `[]` | Per-item metadata keys shown as text inputs (e.g. alt text). |
| `searchEndpoint` | string | (none) | URL of a host search endpoint; enables the widget search box. |

## Stored value (contract)

```json
[
  { "mediaId": "01H...", "sortOrder": 0, "isPrimary": true,  "meta": { "alt_en": "Front" }, "storageKey": "products/a/0.jpeg" },
  { "mediaId": "01H...", "sortOrder": 1, "isPrimary": false, "meta": {},                    "storageKey": "products/a/1.jpeg" }
]
```

`mediaId` is the canonical reference (a row in EmDash's `media` table). `storageKey`, `width`,
and `height` are denormalized render hints so a thumbnail can be shown without a lookup; the
server hook binds `storageKey` to its media row on save. The shape is versioned with the package.

## Media search

EmDash exposes no text search for local media, so the search box delegates to a host-provided
endpoint set via the `searchEndpoint` option. The widget issues `GET <searchEndpoint>?q=<term>`
and expects:

```json
{ "results": [ { "id": "01H...", "storageKey": "products/a/1.jpeg", "mimeType": "image/jpeg", "width": 800, "height": 800, "filename": "1.jpeg" } ] }
```

The endpoint runs in the host application (it has database access the plugin does not). Use a
same-origin path, and access-control it the same way as the admin, since it returns media
metadata.

## Security model

The editor widget runs in the browser and is treated as untrusted. The authoritative checks are
in the `content:beforeSave` hook, which aborts a save when:

- the value is not a well-formed gallery array, or exceeds the hard cap (200 items);
- a `mediaId` is duplicated, or more than one item is primary;
- a `mediaId` does not resolve to a non-trashed row in `media`;
- an item's `storageKey` does not match its resolved media row, or is not a safe relative key.

A storage key is rejected unless it is a relative key with no leading slash, no `..` path
segment, no colon (which blocks `http:`, `javascript:`, and protocol-relative values), and no
control characters. URLs are encoded per path segment. The plugin declares only the `read:media`
capability and makes no network requests of its own.

To report a vulnerability, see [SECURITY.md](./SECURITY.md).

## Status

In production use. Implemented: gallery and single-image widgets, drag-to-reorder, per-item
alt-text inputs, search, server-side validation, and storefront hydration. Planned: a
primary-toggle control in the gallery widget. See [CHANGELOG.md](./CHANGELOG.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE).
