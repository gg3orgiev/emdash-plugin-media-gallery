/**
 * Single-image widget (admin UI) — a searchable replacement for EmDash's
 * built-in image picker, which has no search for the local library.
 *
 * It is bound to an `image`-type field via `widget: "media-gallery:image"` and
 * reads/writes EmDash's native `ImageFieldValue` shape, so existing selections
 * persist and the storefront (which reads `meta.storageKey`) is unaffected.
 */

import { useState } from "react";
import { MediaPickerModal } from "@emdash-cms/admin";
import { resolveOptions } from "../schema.js";
import { SearchPicker, urlFromStorageKey, useSearchEndpoint, type MediaSearchResult } from "./shared.js";
import type { FieldWidgetProps } from "./GalleryField.js";

/** EmDash's native image-field value (matched exactly for compatibility). */
interface ImageFieldValue {
  id: string;
  provider?: string;
  src?: string;
  previewUrl?: string;
  alt?: string;
  width?: number;
  height?: number;
  meta?: Record<string, unknown>;
}

interface MediaPick {
  id: string;
  storageKey?: string;
  width?: number;
  height?: number;
  url?: string;
  blurhash?: string;
  dominantColor?: string;
}

export default function ImageField(props: FieldWidgetProps) {
  const { value, onChange, label, id, required } = props;
  const options = resolveOptions(props.options);
  const searchEndpoint = useSearchEndpoint(options.searchEndpoint);
  const [pickerOpen, setPickerOpen] = useState(false);

  const current = parseValue(value);
  const currentUrl = displayUrl(current);

  /** Write the native ImageFieldValue shape EmDash and the storefront expect. */
  function select(picked: MediaPick) {
    setPickerOpen(false);
    if (!picked.storageKey) return; // local media must resolve to a storage key
    const next: ImageFieldValue = {
      id: picked.id,
      provider: "local",
      meta: { storageKey: picked.storageKey },
    };
    if (typeof picked.width === "number") next.width = picked.width;
    if (typeof picked.height === "number") next.height = picked.height;
    onChange(next);
  }

  function clear() {
    onChange(null);
  }

  return (
    <div data-field={id}>
      <div style={styles.header}>
        <span style={styles.label}>
          {label}
          {required ? <span style={styles.required}> *</span> : null}
        </span>
      </div>

      {currentUrl ? (
        <div style={styles.current}>
          <div style={styles.thumb}>
            <img src={currentUrl} alt={current?.alt ?? ""} style={styles.img} />
          </div>
          <div style={styles.actions}>
            <button type="button" style={styles.btn} onClick={() => setPickerOpen(true)}>
              Change
            </button>
            <button type="button" style={styles.btn} onClick={clear}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button type="button" style={styles.empty} onClick={() => setPickerOpen(true)}>
          + Select image
        </button>
      )}

      <SearchPicker
        endpoint={searchEndpoint}
        onPick={(r: MediaSearchResult) => select(r)}
        placeholder="Search media by name…"
      />

      <MediaPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={select}
        localOnly
        mediaKind="image"
        mimeTypeFilters={options.allowedMimeTypes}
        title="Select image"
      />
    </div>
  );
}

/** Normalize the field value (object, JSON string, or legacy URL string). */
function parseValue(value: unknown): ImageFieldValue | null {
  if (!value) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (s === "") return null;
    if (s.startsWith("{")) {
      try {
        return JSON.parse(s) as ImageFieldValue;
      } catch {
        return null;
      }
    }
    return { id: s, src: s }; // legacy direct URL
  }
  if (typeof value === "object") return value as ImageFieldValue;
  return null;
}

/** Resolve a thumbnail URL from the stored value, mirroring the native widget. */
function displayUrl(v: ImageFieldValue | null): string | null {
  if (!v) return null;
  const storageKey = typeof v.meta?.storageKey === "string" ? (v.meta.storageKey as string) : null;
  if (storageKey) return urlFromStorageKey(storageKey);
  return v.previewUrl ?? v.src ?? null;
}

const styles: Record<string, React.CSSProperties> = {
  header: { marginBottom: 8 },
  label: { fontWeight: 600, fontSize: 14 },
  required: { color: "#c0392b" },
  current: { display: "flex", alignItems: "flex-start", gap: 12 },
  thumb: {
    width: 160,
    height: 120,
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 4,
    overflow: "hidden",
    background: "rgba(0,0,0,0.03)",
  },
  img: { width: "100%", height: "100%", objectFit: "cover" },
  actions: { display: "flex", flexDirection: "column", gap: 6 },
  btn: { fontSize: 12, cursor: "pointer", padding: "4px 10px" },
  empty: {
    width: "100%",
    maxWidth: 360,
    padding: "20px 0",
    border: "1px dashed rgba(0,0,0,0.3)",
    borderRadius: 4,
    cursor: "pointer",
    background: "transparent",
  },
};
