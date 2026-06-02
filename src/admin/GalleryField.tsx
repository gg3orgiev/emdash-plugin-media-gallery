import { useCallback, useEffect, useMemo, useState } from "react";
import { MediaPickerModal } from "@emdash-cms/admin";
import { type GalleryItem, reindex, resolveOptions } from "../schema.js";
import { validateGallery } from "../validate.js";
import { SearchPicker, urlFromStorageKey } from "./shared.js";

interface MediaPick {
  id: string;
  storageKey?: string;
  width?: number;
  height?: number;
  url?: string;
}

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

  const items = useMemo<GalleryItem[]>(
    () => reindex(validateGallery(value, { ...options, maxItems: Number.MAX_SAFE_INTEGER, minItems: 0 }).items),
    [value, options],
  );

  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const atLimit = items.length >= options.maxItems;

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
    // Assign sortOrder from array position (not reindex, which re-sorts by old sortOrder).
    onChange(ensurePrimary(next).map((it, i) => ({ ...it, sortOrder: i })));
  }

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
    if (picked.storageKey) item.storageKey = picked.storageKey;
    if (typeof picked.width === "number") item.width = picked.width;
    if (typeof picked.height === "number") item.height = picked.height;
    commit([...items, item]);
  }

  function removeImage(mediaId: string) {
    commit(items.filter((it) => it.mediaId !== mediaId));
  }

  function updateMeta(mediaId: string, key: string, val: string) {
    commit(items.map((it) => it.mediaId === mediaId ? { ...it, meta: { ...it.meta, [key]: val } } : it));
  }

  // --- Drag-to-reorder (HTML5 Drag API, zero dependencies) ---

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Needed for Firefox to initiate drag
    e.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      setDragOverIndex(null);
      if (dragIndex === null || dragIndex === targetIndex) {
        setDragIndex(null);
        return;
      }
      const next = [...items];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved!);
      commit(next);
      setDragIndex(null);
    },
    [dragIndex, items],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const hasPerItemFields = options.perItemFields.length > 0;

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
          {items.map((item, index) => {
            const url = item.storageKey ? urlFromStorageKey(item.storageKey) : urls[item.mediaId] ?? null;
            const isDragging = dragIndex === index;
            const isOver = dragOverIndex === index && dragIndex !== index;
            return (
              <div
                key={item.mediaId}
                style={{
                  ...styles.card,
                  ...(hasPerItemFields ? styles.cardWide : undefined),
                  opacity: isDragging ? 0.4 : 1,
                  ...(isOver ? styles.dropTarget : undefined),
                }}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
              >
                <div style={styles.thumb}>
                  {url ? (
                    <img src={url} alt={item.meta.alt_en ?? item.meta.alt ?? ""} style={styles.img} loading="lazy" />
                  ) : (
                    <span style={styles.placeholder}>{shortId(item.mediaId)}</span>
                  )}
                  {item.isPrimary ? <span style={styles.badge}>primary</span> : null}
                  <span style={styles.dragHandle} title="Drag to reorder">&#x2630;</span>
                </div>
                {options.perItemFields.map((field) => (
                  <input
                    key={field}
                    type="text"
                    value={item.meta[field] ?? ""}
                    onChange={(e) => updateMeta(item.mediaId, field, e.target.value)}
                    placeholder={field}
                    style={styles.metaInput}
                    aria-label={`${field} for image ${shortId(item.mediaId)}`}
                  />
                ))}
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
  card: { width: 120, display: "flex", flexDirection: "column", gap: 4, cursor: "grab", transition: "opacity 150ms" },
  cardWide: { width: 160 },
  thumb: {
    position: "relative",
    width: "100%",
    aspectRatio: "4/3",
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
  dragHandle: {
    position: "absolute",
    top: 4,
    right: 4,
    fontSize: 14,
    lineHeight: "1",
    padding: "2px 4px",
    borderRadius: 3,
    background: "rgba(0,0,0,0.5)",
    color: "#fff",
    cursor: "grab",
    userSelect: "none",
  },
  dropTarget: {
    outline: "2px dashed #3b82f6",
    outlineOffset: 2,
    borderRadius: 4,
  },
  metaInput: {
    width: "100%",
    padding: "3px 6px",
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 3,
    fontSize: 12,
    boxSizing: "border-box",
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
