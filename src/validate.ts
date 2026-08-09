/**
 * Pure validation for a gallery value.
 *
 * No I/O lives here: these functions only inspect the value and the options.
 * Resolving each `mediaId` to a real file needs the database, so that check
 * lives in the server hook (see `hook.ts`) which calls {@link collectMediaIds}.
 */

import {
  type GalleryItem,
  type GalleryOptions,
  HARD_MAX_ITEMS,
  isRecord,
  isSafeStorageKey,
  toRawArray,
} from "./schema.js";

export interface ValidationResult {
  /** True when the value is a well-formed gallery within bounds. */
  ok: boolean;
  /** Human-readable problems; empty when `ok`. */
  errors: string[];
  /** Parsed, well-formed items (best effort even when `ok` is false). */
  items: GalleryItem[];
}

/**
 * Check the shape and bounds of a gallery value.
 *
 * Validates: array of items; each `mediaId` a non-empty string; `sortOrder` a
 * non-negative integer; `isPrimary` a boolean; `meta` a string map; no
 * duplicate `mediaId`s; at most one primary; size within `minItems`..`maxItems`
 * and the absolute {@link HARD_MAX_ITEMS} cap.
 */
export function validateGallery(value: unknown, options: GalleryOptions): ValidationResult {
  const errors: string[] = [];
  const raw = toRawArray(value);
  const items: GalleryItem[] = [];
  const seen = new Set<string>();
  let primaryCount = 0;

  raw.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`item ${index}: expected an object`);
      return;
    }
    const { mediaId, sortOrder, isPrimary, meta, storageKey, width, height } = entry;

    if (typeof mediaId !== "string" || mediaId.trim() === "") {
      errors.push(`item ${index}: "mediaId" must be a non-empty string`);
      return;
    }
    if (seen.has(mediaId)) {
      errors.push(`item ${index}: duplicate mediaId "${mediaId}"`);
      return;
    }
    if (sortOrder !== undefined && !isNonNegativeInt(sortOrder)) {
      errors.push(`item ${index}: "sortOrder" must be a non-negative integer`);
      return;
    }
    if (isPrimary !== undefined && typeof isPrimary !== "boolean") {
      errors.push(`item ${index}: "isPrimary" must be a boolean`);
      return;
    }
    if (meta !== undefined && !isStringMap(meta)) {
      errors.push(`item ${index}: "meta" must be a map of strings`);
      return;
    }

    if (storageKey !== undefined && !isSafeStorageKey(storageKey)) {
      errors.push(`item ${index}: "storageKey" must be a safe relative media key`);
      return;
    }

    seen.add(mediaId);
    const primary = isPrimary === true;
    if (primary) primaryCount += 1;
    const item: GalleryItem = {
      mediaId,
      sortOrder: isNonNegativeInt(sortOrder) ? sortOrder : index,
      isPrimary: primary,
      meta: isStringMap(meta) ? meta : {},
    };
    // Preserve the optional denormalized render hints when present and valid.
    if (isSafeStorageKey(storageKey)) item.storageKey = storageKey;
    if (isNonNegativeInt(width)) item.width = width;
    if (isNonNegativeInt(height)) item.height = height;
    if (typeof entry.blurhash === "string" && entry.blurhash.length > 0) item.blurhash = entry.blurhash;
    if (typeof entry.dominantColor === "string" && entry.dominantColor.length > 0) item.dominantColor = entry.dominantColor;
    items.push(item);
  });

  if (primaryCount > 1) {
    errors.push(`only one item may be primary (found ${primaryCount})`);
  }
  if (items.length > HARD_MAX_ITEMS) {
    errors.push(`too many items: ${items.length} (hard limit ${HARD_MAX_ITEMS})`);
  }
  if (items.length > options.maxItems) {
    errors.push(`too many items: ${items.length} (max ${options.maxItems})`);
  }
  if (items.length < options.minItems) {
    errors.push(`too few items: ${items.length} (min ${options.minItems})`);
  }

  return { ok: errors.length === 0, errors, items };
}

/**
 * Decide whether an arbitrary field value looks like a gallery this plugin owns.
 *
 * The server hook fires for every field on every save, so it must only act on
 * values that are clearly ours. We require a non-empty array whose every entry
 * is an object carrying a string `mediaId` — a shape no built-in field produces.
 */
export function looksLikeGallery(value: unknown): boolean {
  const raw = toRawArray(value);
  if (raw.length === 0) return false;
  return raw.every((entry) => isRecord(entry) && typeof entry.mediaId === "string");
}

/** Unique, ordered list of mediaIds referenced by a value (for resolution checks). */
export function collectMediaIds(value: unknown): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of toRawArray(value)) {
    if (isRecord(entry) && typeof entry.mediaId === "string" && !seen.has(entry.mediaId)) {
      seen.add(entry.mediaId);
      ids.push(entry.mediaId);
    }
  }
  return ids;
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function isStringMap(v: unknown): v is Record<string, string> {
  return isRecord(v) && Object.values(v).every((x) => typeof x === "string");
}
