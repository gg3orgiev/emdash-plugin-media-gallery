/**
 * The media-gallery data contract.
 *
 * This file is the single source of truth for what a gallery value looks like
 * on disk. The editor widget, the server validator, and the storefront runtime
 * all agree through these types — nothing else imports another module's shape.
 * Keep it dependency-free so every layer can use it.
 */

/** The plugin id, as declared in the manifest. */
export const PLUGIN_ID = "media-gallery";

/** The multi-image gallery widget name, as registered under `admin.fieldWidgets`. */
export const WIDGET_NAME = "gallery";

/** The single-image widget name (a searchable picker for an `image` field). */
export const IMAGE_WIDGET_NAME = "image";

/** The string a collection field uses to opt into the gallery widget. */
export const WIDGET_REF = `${PLUGIN_ID}:${WIDGET_NAME}`;

/** The string an `image` field uses to opt into the single-image widget. */
export const IMAGE_WIDGET_REF = `${PLUGIN_ID}:${IMAGE_WIDGET_NAME}`;

/**
 * One image in a gallery.
 *
 * `mediaId` is the canonical link to the actual file — it points at a row in the
 * EmDash `media` table. `storageKey`/`width`/`height` are denormalized render
 * hints (a cache); the server hook binds `storageKey` to its media row on save.
 */
export interface GalleryItem {
  /** Id of a row in the EmDash `media` table — the canonical reference. */
  mediaId: string;
  /** Position in the gallery, ascending from 0. */
  sortOrder: number;
  /** Exactly one item in a gallery may be primary. */
  isPrimary: boolean;
  /** Per-item metadata (e.g. `alt_en`, `alt_bg`), keyed by the option `perItemFields`. */
  meta: Record<string, string>;
  /**
   * Denormalized render hints captured from the media library when the image
   * was picked, so the editor and storefront can show a thumbnail without a
   * database lookup. The canonical link is still `mediaId`; treat these as a
   * cache. The server hook verifies `storageKey` matches the media row on save.
   */
  storageKey?: string;
  width?: number;
  height?: number;
}

/** Options an author sets on the field definition (`options` in seed.json). */
export interface GalleryOptions {
  /** Hard cap on items. Default {@link DEFAULT_OPTIONS}. */
  maxItems: number;
  /** Minimum items required to be valid. Default 0. */
  minItems: number;
  /** Allowed MIME types (exact or `type/` prefixes) passed to the picker. */
  allowedMimeTypes: string[];
  /** Per-item metadata field names shown as text inputs (e.g. `["alt_en","alt_bg"]`). */
  perItemFields: string[];
  /**
   * Optional URL of a host-provided media search endpoint. EmDash has no media
   * text search, so when set the widget renders a search box that GETs
   * `<searchEndpoint>?q=<term>` and expects
   * `{ results: [{ id, storageKey?, mimeType?, width?, height?, filename? }] }`.
   * Use a same-origin path the host access-controls. When unset, the widget
   * offers only the built-in browse picker.
   */
  searchEndpoint?: string;
}

/** Default options, merged under whatever the field declares. */
export const DEFAULT_OPTIONS: GalleryOptions = {
  maxItems: 20,
  minItems: 0,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  perItemFields: [],
};

/**
 * Absolute safety cap enforced server-side regardless of a field's `maxItems`,
 * so a hand-crafted payload cannot store an unbounded array.
 */
export const HARD_MAX_ITEMS = 200;

/**
 * Merge raw field options (which arrive as an untyped record) over the defaults.
 * Unknown keys are ignored; wrong types fall back to the default.
 */
export function resolveOptions(raw: unknown): GalleryOptions {
  const o = isRecord(raw) ? raw : {};
  const resolved: GalleryOptions = {
    maxItems: clampInt(o.maxItems, DEFAULT_OPTIONS.maxItems, 1, HARD_MAX_ITEMS),
    minItems: clampInt(o.minItems, DEFAULT_OPTIONS.minItems, 0, HARD_MAX_ITEMS),
    allowedMimeTypes: isStringArray(o.allowedMimeTypes)
      ? o.allowedMimeTypes
      : DEFAULT_OPTIONS.allowedMimeTypes,
    perItemFields: isStringArray(o.perItemFields)
      ? o.perItemFields
      : DEFAULT_OPTIONS.perItemFields,
  };
  if (typeof o.searchEndpoint === "string" && o.searchEndpoint !== "") {
    resolved.searchEndpoint = o.searchEndpoint;
  }
  return resolved;
}

/**
 * Coerce a stored field value into an array of unknowns, ready for validation.
 *
 * A `json` field may hand us an already-parsed array, a JSON string, or
 * `null`/`undefined` for an empty field. Anything else yields an empty array.
 */
export function toRawArray(value: unknown): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return [];
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Re-number items by their current order so `sortOrder` is a clean 0..n-1
 * sequence. Returns a new array; does not mutate the input.
 */
export function reindex(items: GalleryItem[]): GalleryItem[] {
  return items
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index }));
}

// --- small internal type guards (kept here so every layer shares them) ---

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A storage key is only ever a relative key inside the media bucket (e.g.
 * `products/abc/0.jpeg`). Reject anything that could escape that namespace or
 * inject a different scheme once turned into a `/api/media/<key>` URL: a leading
 * slash, a `..` path segment, a colon (blocks `http:`/`javascript:` and
 * protocol-relative paths), or control characters. This bounds what a stored
 * value can reference even if it was tampered with.
 */
export function isSafeStorageKey(key: unknown): key is string {
  if (typeof key !== "string" || key.length === 0 || key.length > 1024) return false;
  if (key.startsWith("/") || key.includes(":")) return false;
  if (/(^|\/)\.\.(\/|$)/.test(key)) return false;
  for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false; // no control characters
  }
  return true;
}

/** Build the `/api/media/<key>` proxy URL for a safe storage key (else null). */
export function mediaProxyUrl(key: unknown, base = "/api/media/"): string | null {
  if (!isSafeStorageKey(key)) return null;
  return base + key.split("/").map(encodeURIComponent).join("/");
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" && Number.isInteger(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}
