/**
 * Server-side validation, run on every content save.
 *
 * The editor widget is convenience, not a security boundary — it runs in the
 * browser. This hook is the boundary: it runs in EmDash's sandbox and refuses
 * to persist a gallery that is malformed, points at media that does not exist,
 * or carries a `storageKey` that does not match its media row. Throwing aborts
 * the save.
 */

import type { ContentHookEvent, PluginContext } from "emdash/plugin";
import {
  DEFAULT_OPTIONS,
  HARD_MAX_ITEMS,
  type GalleryItem,
  type GalleryOptions,
} from "./schema.js";
import { looksLikeGallery, validateGallery } from "./validate.js";

/** Server checks enforce shape, references, and the absolute hard cap; */
/** per-field `min`/`max` bounds are enforced in the widget. */
const SERVER_OPTIONS: GalleryOptions = {
  ...DEFAULT_OPTIONS,
  minItems: 0,
  maxItems: HARD_MAX_ITEMS,
};

/**
 * Build the `content:beforeSave` handler.
 *
 * For each field on the saved record that looks like one of our galleries, it
 * validates the shape and confirms every `mediaId` resolves to a media row
 * whose `storageKey` matches the item. Anything else is left untouched.
 */
export function createGalleryBeforeSave() {
  return async (event: ContentHookEvent, ctx: PluginContext): Promise<void> => {
    for (const [fieldSlug, value] of Object.entries(event.content)) {
      if (!looksLikeGallery(value)) continue;

      const where = `${event.collection}.${fieldSlug}`;

      const { ok, errors, items } = validateGallery(value, SERVER_OPTIONS);
      if (!ok) {
        throw new Error(`media-gallery: invalid value for ${where}: ${errors.join("; ")}`);
      }

      await assertMediaResolves(ctx, where, items);
    }
    // Returning nothing leaves the content unchanged.
  };
}

async function assertMediaResolves(
  ctx: PluginContext,
  where: string,
  items: GalleryItem[],
): Promise<void> {
  if (items.length === 0) return;

  if (!ctx.media) {
    // Capability missing — fail closed rather than silently accept unverifiable ids.
    throw new Error(
      `media-gallery: cannot verify media for ${where} — the plugin needs the "read:media" capability`,
    );
  }

  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const item of items) {
    const media = await ctx.media.get(item.mediaId);
    if (!media) {
      missing.push(item.mediaId);
      continue;
    }
    // Bind the denormalized storageKey to the real media row, so a crafted save
    // cannot point an item at an unrelated object in the media bucket. The
    // plugin-facing MediaItem type omits storageKey on some EmDash versions, so
    // read it defensively and only enforce the match when the host provides it.
    const mediaKey = (media as { storageKey?: unknown }).storageKey;
    if (item.storageKey && typeof mediaKey === "string" && item.storageKey !== mediaKey) {
      mismatched.push(item.mediaId);
    }
  }

  if (missing.length > 0) {
    throw new Error(`media-gallery: unknown media in ${where}: ${missing.join(", ")}`);
  }
  if (mismatched.length > 0) {
    throw new Error(
      `media-gallery: storageKey does not match its media row in ${where}: ${mismatched.join(", ")}`,
    );
  }
}
