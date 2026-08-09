/**
 * Shared admin-widget building blocks: media URL helper, the search hook, and a
 * reusable search-picker UI used by both the gallery and single-image widgets.
 */

import { useEffect, useRef, useState } from "react";
import { fetchPluginSettings } from "@emdash-cms/admin";
import { PLUGIN_ID } from "../schema.js";

/** Build the public media proxy URL EmDash serves from a storage key. */
export function urlFromStorageKey(storageKey: string): string {
  return "/api/media/" + storageKey.split("/").map(encodeURIComponent).join("/");
}

/** A row returned by the host's search endpoint. */
export interface MediaSearchResult {
  id: string;
  storageKey?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  filename?: string;
}

/**
 * Resolve the search endpoint: per-field `options.searchEndpoint` wins;
 * otherwise fall back to the global plugin setting (admin settings UI).
 */
export function useSearchEndpoint(fieldEndpoint: string | undefined): string | undefined {
  const [globalEndpoint, setGlobalEndpoint] = useState<string | undefined>(undefined);
  const fetched = useRef(false);

  useEffect(() => {
    if (fieldEndpoint || fetched.current) return;
    fetched.current = true;
    fetchPluginSettings(PLUGIN_ID)
      .then((res) => {
        const v = (res as { values?: Record<string, unknown> }).values?.searchEndpoint;
        if (typeof v === "string" && v !== "") setGlobalEndpoint(v);
      })
      .catch(() => {});
  }, [fieldEndpoint]);

  return fieldEndpoint || globalEndpoint;
}

/** Debounced media search against a host-provided endpoint. Inert when no endpoint. */
export function useMediaSearch(endpoint: string | undefined) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!endpoint) return;
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`);
        const data = res.ok ? ((await res.json()) as { results?: MediaSearchResult[] }) : {};
        if (!cancelled) setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [term, endpoint]);

  return { term, setTerm, results, searching };
}

/**
 * Search box + result grid. Renders nothing if no endpoint is configured.
 * Calls `onPick` with the chosen result; `exclude` hides already-selected ids.
 */
export function SearchPicker(props: {
  endpoint: string | undefined;
  onPick: (r: MediaSearchResult) => void;
  exclude?: (id: string) => boolean;
  placeholder?: string;
}) {
  const { endpoint, onPick, exclude, placeholder } = props;
  const { term, setTerm, results, searching } = useMediaSearch(endpoint);
  if (!endpoint) return null;

  const visible = results.filter((r) => !(exclude?.(r.id) ?? false));

  return (
    <div style={sx.search}>
      <input
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder={placeholder ?? "Search media by name…"}
        style={sx.input}
        aria-label="Search media"
      />
      {term.trim().length >= 2 ? (
        <div style={sx.results}>
          {searching ? (
            <span style={sx.hint}>Searching…</span>
          ) : visible.length === 0 ? (
            <span style={sx.hint}>No matches</span>
          ) : (
            visible.map((r) => {
              const url = r.storageKey ? urlFromStorageKey(r.storageKey) : null;
              return (
                <button
                  type="button"
                  key={r.id}
                  style={sx.result}
                  title={r.filename ?? r.id}
                  onClick={() => onPick(r)}
                >
                  {url ? (
                    <img src={url} alt={r.filename ?? ""} style={sx.img} loading="lazy" />
                  ) : (
                    <span style={sx.placeholder}>{r.id.slice(0, 8)}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

const sx: Record<string, React.CSSProperties> = {
  search: { marginTop: 12 },
  input: {
    width: "100%",
    maxWidth: 360,
    padding: "6px 10px",
    border: "1px solid rgba(0,0,0,0.2)",
    borderRadius: 4,
    fontSize: 13,
  },
  results: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 },
  result: {
    width: 72,
    height: 54,
    padding: 0,
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 4,
    overflow: "hidden",
    cursor: "pointer",
    background: "rgba(0,0,0,0.03)",
  },
  img: { width: "100%", height: "100%", objectFit: "cover" },
  placeholder: { fontSize: 11, opacity: 0.5, fontFamily: "monospace" },
  hint: { fontSize: 12, opacity: 0.6 },
};
