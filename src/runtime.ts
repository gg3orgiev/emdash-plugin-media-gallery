/**
 * Storefront read-side helper.
 *
 * Turns a stored gallery value into render-ready images. It never writes, and
 * it never trusts the stored value: items whose media no longer resolves are
 * dropped, so a deleted image cannot break a page.
 *
 * The core function is database-agnostic — you pass a `lookup` that resolves
 * mediaIds to rows. A ready-made D1 lookup is provided for Cloudflare projects.
 */

import { type GalleryItem, DEFAULT_OPTIONS, mediaProxyUrl, reindex } from "./schema.js";
import { validateGallery } from "./validate.js";

/** A resolved row from the EmDash `media` table (only the fields we render). */
export interface MediaRow {
  id: string;
  storage_key: string | null;
  mime_type?: string | null;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  status?: string | null;
  blurhash?: string | null;
  dominant_color?: string | null;
}

/** Resolve a set of mediaIds to their rows. Missing ids are simply absent. */
export type MediaLookup = (ids: string[]) => Promise<Map<string, MediaRow>>;

/** One image ready to render. */
export interface HydratedImage {
  mediaId: string;
  url: string;
  mimeType: string | undefined;
  width: number | undefined;
  height: number | undefined;
  /** Item alt (from `meta`) falls back to the media row's own alt. */
  alt: string | undefined;
  isPrimary: boolean;
  sortOrder: number;
  meta: Record<string, string>;
  /** LQIP blurhash placeholder for progressive loading. */
  blurhash: string | undefined;
  /** LQIP dominant-color placeholder as a CSS color. */
  dominantColor: string | undefined;
}

export interface HydrateOptions {
  /**
   * Build the public URL for a media row. Defaults to the EmDash media proxy
   * convention: `/api/media/<storage_key>`.
   */
  buildUrl?: (row: MediaRow) => string | null;
  /** Which `meta` key to use as the fallback alt. Default `"alt"`. */
  altKey?: string;
}

function defaultBuildUrl(row: MediaRow): string | null {
  // Encodes per path segment and rejects unsafe keys (traversal, scheme, etc.).
  return mediaProxyUrl(row.storage_key);
}

/**
 * Hydrate a gallery value into ordered, render-ready images.
 *
 * @param value  The raw field value (array, JSON string, or null).
 * @param lookup Resolves mediaIds to `media` rows.
 */
export async function hydrateMediaGallery(
  value: unknown,
  lookup?: MediaLookup,
  options: HydrateOptions = {},
): Promise<HydratedImage[]> {
  // Reuse the validator to parse a clean, ordered item list. We do not reject
  // here — a single bad item should not blank an entire page — we just keep
  // the well-formed items the parser recovered.
  const { items } = validateGallery(value, { ...DEFAULT_OPTIONS, maxItems: Number.MAX_SAFE_INTEGER });
  const ordered = reindex(items);
  if (ordered.length === 0) return [];

  // Only look up items that lack a denormalized storageKey. If every item
  // carries one, no database round-trip happens at all.
  const needLookup = ordered.filter((i) => !i.storageKey).map((i) => i.mediaId);
  const rows = lookup && needLookup.length > 0 ? await lookup(needLookup) : new Map<string, MediaRow>();

  const buildUrl = options.buildUrl ?? defaultBuildUrl;
  const altKey = options.altKey ?? "alt";

  const out: HydratedImage[] = [];
  for (const item of ordered) {
    const row = rows.get(item.mediaId);
    // Prefer the embedded storageKey; fall back to the looked-up row.
    const storageKey = item.storageKey ?? row?.storage_key ?? null;
    if (row && isTrashed(row)) continue; // dropped if the looked-up row is trashed
    if (!storageKey) continue; // unresolvable → drop rather than render a broken image
    const url = buildUrl({ ...row, id: item.mediaId, storage_key: storageKey });
    if (!url) continue;
    out.push({
      mediaId: item.mediaId,
      url,
      mimeType: row?.mime_type ?? undefined,
      width: item.width ?? row?.width ?? undefined,
      height: item.height ?? row?.height ?? undefined,
      alt: pickAlt(item, row, altKey),
      isPrimary: item.isPrimary,
      sortOrder: item.sortOrder,
      meta: item.meta,
      blurhash: item.blurhash ?? row?.blurhash ?? undefined,
      dominantColor: item.dominantColor ?? row?.dominant_color ?? undefined,
    });
  }
  return out;
}

/** The primary image if one is flagged, else the first, else undefined. */
export function primaryImage(images: HydratedImage[]): HydratedImage | undefined {
  return images.find((i) => i.isPrimary) ?? images[0];
}

// --- D1 convenience (Cloudflare). Generic enough to avoid a hard D1 dep. ---

interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  all<T = unknown>(): Promise<{ results?: T[] }>;
}
interface D1Like {
  prepare(query: string): D1PreparedLike;
}

/**
 * A {@link MediaLookup} backed by a Cloudflare D1 database. Resolves all ids in
 * a single `IN (...)` query.
 */
export function d1MediaLookup(db: D1Like): MediaLookup {
  return async (ids) => {
    const map = new Map<string, MediaRow>();
    if (ids.length === 0) return map;
    const placeholders = ids.map(() => "?").join(",");
    const sql =
      `SELECT id, storage_key, mime_type, width, height, alt, status, blurhash, dominant_color ` +
      `FROM media WHERE id IN (${placeholders})`;
    const { results } = await db.prepare(sql).bind(...ids).all<MediaRow>();
    for (const row of results ?? []) map.set(row.id, row);
    return map;
  };
}

function isTrashed(row: MediaRow): boolean {
  // EmDash marks live media `ready`; anything explicitly trashed/deleted is skipped.
  return row.status === "trashed" || row.status === "deleted";
}

function pickAlt(item: GalleryItem, row: MediaRow | undefined, altKey: string): string | undefined {
  const fromItem = item.meta[altKey];
  if (fromItem && fromItem.trim() !== "") return fromItem;
  return row?.alt ?? undefined;
}
