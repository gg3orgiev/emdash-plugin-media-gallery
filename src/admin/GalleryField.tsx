/**
 * The gallery editing widget (admin UI).
 *
 * Add images via search (host endpoint) or the EmDash media picker, and remove
 * them. Reordering, the primary toggle, and per-item alt text arrive in Phase 2.
 *
 * EmDash renders this component for a `json` field whose `widget` is
 * `"media-gallery:gallery"`, passing the props below. It is controlled: we read
 * `value` and report edits through `onChange`. The editor autosaves.
 */

import { useEffect, useMemo, useState } from "react";
import { MediaPickerModal } from "@emdash-cms/admin";
import { type GalleryItem, reindex, resolveOptions } from "../schema.js";
import { validateGallery } from "../validate.js";
import { SearchPicker, urlFromStorageKey } from "./shared.js";

/** Minimal shape needed to add an item — satisfied by both a MediaItem and a search result. */
interface MediaPick {
  id: string;
  storageKey?: string;
  width?: number;
  height?: number;
  url?: string;
}

/** Props EmDash passes to a plugin field widget (verified against the admin bundle). */
export interface FieldWidgetProps {
  value: unknown;
  onChange: (value: unknown) => void;
  label: string;
  id: string;
  required?: boolean;
  options?: unknown;
  minimal?: boolean;
}

export default function GalleryField(props: FieldWidgetProps) {
  const { value, onChange, label, id, required } = props;
  const options = useMemo(() => resolveOptions(props.options), [props.options]);

  // Derive the current items straight from the controlled value.
  const items = useMemo<GalleryItem[]>(
    () => reindex(validateGallery(value, { ...options, maxItems: Number.MAX_SAFE_INTEGER, minItems: 0 }).items),
    [value, options],
  );

  // Map of mediaId → thumbnail URL, filled in for older items (mediaId only) by
  // querying the media-by-id endpoint. Items with a storageKey skip this.
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  const atLimit = items.length >= options.maxItems;

  // Resolve thumbnails for items that have neither a storageKey nor a known URL.
  useEffect(() => {
    const missing = items.filter((it) => !it.storageKey && !urls[it.mediaId]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map(async (it) => {
        try {
          const res = await fetch(`/_emdash/api/media/${encodeURIComponent(it.mediaId)}`);
          if (!res.ok) return null;
          const m = (await res.json()) as { url?: string; storageKey?: string };
          const url = m.url ?? (m.storageKey ? urlFromStorageKey(m.storageKey) : null);
          return url ? ([it.mediaId, url] as const) : null;
        } catch {
          return null;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const found = pairs.filter((p): p is readonly [string, string] => p !== null);
      if (found.length > 0) setUrls((u) => ({ ...u, ...Object.fromEntries(found) }));
    });
    return () => {
      cancelled = true;
    };
  }, [items, urls]);

  function commit(next: GalleryItem[]) {
    onChange(reindex(ensurePrimary(next)));
  }

  /** Append a media item (from the picker or a search result). Ignores duplicates. */
  function addMedia(picked: MediaPick) {
    if (items.some((it) => it.mediaId === picked.id)) return;
    const url = picked.url ?? (picked.storageKey ? urlFromStorageKey(picked.storageKey) : null);
    if (url) setUrls((u) => ({ ...u, [picked.id]: url }));
    const item: GalleryItem = {
      mediaId: picked.id,
      sortOrder: items.length,
      isPrimary: items.length === 0,
      meta: {},
    };
    // Denormalize render hints so thumbnails survive reload without a lookup.
    if (picked.storageKey) item.storageKey = picked.storageKey;
    if (typeof picked.width === "number") item.width = picked.width;
    if (typeof picked.height === "number") item.height = picked.height;
    commit([...items, item]);
  }

  function removeImage(mediaId: string) {
    commit(items.filter((it) => it.mediaId !== mediaId));
  }

  return (
    <div data-field={id}>
      <div style={styles.header}>
        <span style={styles.label}>
          {label}
          {required ? <span style={styles.required}> *</span> : null}
        </span>
        <span style={styles.count}>
          {items.length}
          {options.maxItems < Number.MAX_SAFE_INTEGER ? ` / ${options.maxItems}` : ""}
        </span>
      </div>

      {items.length === 0 ? (
        <button type="button" style={styles.empty} onClick={() => setPickerOpen(true)}>
          + Add images
        </button>
      ) : (
        <div style={styles.grid}>
          {items.map((item) => {
            const url = item.storageKey ? urlFromStorageKey(item.storageKey) : urls[item.mediaId] ?? null;
            return (
              <div key={item.mediaId} style={styles.card}>
                <div style={styles.thumb}>
                  {url ? (
                    <img src={url} alt={item.meta.alt_en ?? ""} style={styles.img} loading="lazy" />
                  ) : (
                    <span style={styles.placeholder}>{shortId(item.mediaId)}</span>
                  )}
                  {item.isPrimary ? <span style={styles.badge}>primary</span> : null}
                </div>
                <button
                  type="button"
                  style={styles.remove}
                  aria-label={`Remove image ${shortId(item.mediaId)}`}
                  onClick={() => removeImage(item.mediaId)}
                >
                  Remove
                </button>
              </div>
            );
          })}

          {!atLimit ? (
            <button type="button" style={styles.add} onClick={() => setPickerOpen(true)}>
              + Add
            </button>
          ) : null}
        </div>
      )}

      {!atLimit ? (
        <SearchPicker
          endpoint={options.searchEndpoint}
          exclude={(mid) => items.some((it) => it.mediaId === mid)}
          onPick={addMedia}
        />
      ) : null}

      <MediaPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={addMedia}
        localOnly
        mediaKind="image"
        mimeTypeFilters={options.allowedMimeTypes}
        title="Add to gallery"
      />
    </div>
  );
}

/** Guarantee exactly one primary: if none is set, the first item becomes primary. */
function ensurePrimary(items: GalleryItem[]): GalleryItem[] {
  if (items.length === 0) return items;
  if (items.some((it) => it.isPrimary)) return items;
  return items.map((it, i) => (i === 0 ? { ...it, isPrimary: true } : it));
}

function shortId(id: string): string {
  return id.length > 8 ? `#${id.slice(0, 8)}` : `#${id}`;
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  label: { fontWeight: 600, fontSize: 14 },
  required: { color: "#c0392b" },
  count: { fontSize: 12, opacity: 0.6 },
  grid: { display: "flex", flexWrap: "wrap", gap: 12 },
  card: { width: 120, display: "flex", flexDirection: "column", gap: 4 },
  thumb: {
    position: "relative",
    width: 120,
    height: 90,
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 4,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.03)",
  },
  img: { width: "100%", height: "100%", objectFit: "cover" },
  placeholder: { fontSize: 11, opacity: 0.5, fontFamily: "monospace" },
  badge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    fontSize: 10,
    padding: "1px 5px",
    borderRadius: 3,
    background: "rgba(0,0,0,0.7)",
    color: "#fff",
  },
  remove: { fontSize: 12, cursor: "pointer" },
  add: {
    width: 120,
    height: 90,
    border: "1px dashed rgba(0,0,0,0.3)",
    borderRadius: 4,
    cursor: "pointer",
    background: "transparent",
  },
  empty: {
    width: "100%",
    padding: "24px 0",
    border: "1px dashed rgba(0,0,0,0.3)",
    borderRadius: 4,
    cursor: "pointer",
    background: "transparent",
  },
};
