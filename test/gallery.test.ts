import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, resolveOptions, toRawArray, reindex, isSafeStorageKey, mediaProxyUrl } from "../src/schema.js";
import { collectMediaIds, looksLikeGallery, validateGallery } from "../src/validate.js";
import { hydrateMediaGallery, primaryImage, type MediaRow } from "../src/runtime.js";

const opts = DEFAULT_OPTIONS;

describe("schema", () => {
  it("parses arrays, JSON strings, and empties", () => {
    expect(toRawArray(null)).toEqual([]);
    expect(toRawArray("")).toEqual([]);
    expect(toRawArray("[{}]")).toEqual([{}]);
    expect(toRawArray([1, 2])).toEqual([1, 2]);
    expect(toRawArray("not json")).toEqual([]);
  });

  it("merges options over defaults and clamps", () => {
    expect(resolveOptions({ maxItems: 5 }).maxItems).toBe(5);
    expect(resolveOptions({ maxItems: 99999 }).maxItems).toBe(200); // hard cap
    expect(resolveOptions("bogus")).toEqual(DEFAULT_OPTIONS);
  });

  it("reindexes by sortOrder", () => {
    const out = reindex([
      { mediaId: "b", sortOrder: 5, isPrimary: false, meta: {} },
      { mediaId: "a", sortOrder: 1, isPrimary: true, meta: {} },
    ]);
    expect(out.map((i) => i.mediaId)).toEqual(["a", "b"]);
    expect(out.map((i) => i.sortOrder)).toEqual([0, 1]);
  });
});

describe("validateGallery", () => {
  it("accepts a well-formed gallery", () => {
    const value = [
      { mediaId: "m1", sortOrder: 0, isPrimary: true, meta: { alt_en: "front" } },
      { mediaId: "m2", sortOrder: 1, isPrimary: false, meta: {} },
    ];
    const res = validateGallery(value, opts);
    expect(res.ok).toBe(true);
    expect(res.items).toHaveLength(2);
  });

  it("rejects duplicates, multiple primaries, and bad fields", () => {
    expect(validateGallery([{ mediaId: "x" }, { mediaId: "x" }], opts).ok).toBe(false);
    expect(
      validateGallery(
        [{ mediaId: "a", isPrimary: true }, { mediaId: "b", isPrimary: true }],
        opts,
      ).ok,
    ).toBe(false);
    expect(validateGallery([{ mediaId: "" }], opts).ok).toBe(false);
    expect(validateGallery([{ mediaId: "a", sortOrder: -1 }], opts).ok).toBe(false);
  });

  it("enforces min/max", () => {
    expect(validateGallery([{ mediaId: "a" }], { ...opts, maxItems: 0 }).ok).toBe(false);
    expect(validateGallery([], { ...opts, minItems: 1 }).ok).toBe(false);
  });
});

describe("looksLikeGallery / collectMediaIds", () => {
  it("detects our shape only", () => {
    expect(looksLikeGallery([{ mediaId: "a" }])).toBe(true);
    expect(looksLikeGallery([])).toBe(false);
    expect(looksLikeGallery([{ foo: 1 }])).toBe(false);
    expect(looksLikeGallery("hello")).toBe(false);
  });

  it("collects unique ids in order", () => {
    expect(collectMediaIds([{ mediaId: "a" }, { mediaId: "b" }, { mediaId: "a" }])).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("hydrateMediaGallery", () => {
  const rows = new Map<string, MediaRow>([
    ["m1", { id: "m1", storage_key: "products/1.jpg", mime_type: "image/jpeg", width: 800, height: 600, alt: "row alt" }],
    ["m2", { id: "m2", storage_key: "products/2.jpg", status: "trashed" }],
    ["m3", { id: "m3", storage_key: null }],
  ]);
  const lookup = async (ids: string[]) =>
    new Map(ids.filter((id) => rows.has(id)).map((id) => [id, rows.get(id)!]));

  it("hydrates, orders, and drops missing/trashed/keyless media", async () => {
    const value = [
      { mediaId: "m2", sortOrder: 0, isPrimary: false, meta: {} }, // trashed → dropped
      { mediaId: "m1", sortOrder: 1, isPrimary: true, meta: { alt: "item alt" } },
      { mediaId: "m3", sortOrder: 2, isPrimary: false, meta: {} }, // no storage key → dropped
      { mediaId: "gone", sortOrder: 3, isPrimary: false, meta: {} }, // missing → dropped
    ];
    const out = await hydrateMediaGallery(value, lookup);
    expect(out.map((i) => i.mediaId)).toEqual(["m1"]);
    expect(out[0]!.url).toBe("/api/media/products/1.jpg");
    expect(out[0]!.alt).toBe("item alt"); // item meta wins over row alt
    expect(primaryImage(out)?.mediaId).toBe("m1");
  });

  it("returns [] for empty values", async () => {
    expect(await hydrateMediaGallery(null, lookup)).toEqual([]);
    expect(await hydrateMediaGallery("[]", lookup)).toEqual([]);
  });
});

describe("storage key safety", () => {
  it("accepts legitimate relative keys", () => {
    expect(isSafeStorageKey("products/zito-zs05/0.jpeg")).toBe(true);
    expect(isSafeStorageKey("projects/e36-v10/12.webp")).toBe(true);
  });

  it("rejects traversal, absolute, scheme, and control-char keys", () => {
    expect(isSafeStorageKey("../secret/key")).toBe(false);
    expect(isSafeStorageKey("a/../../b")).toBe(false);
    expect(isSafeStorageKey("/etc/passwd")).toBe(false);
    expect(isSafeStorageKey("http://evil.example/x")).toBe(false);
    expect(isSafeStorageKey("javascript:alert(1)")).toBe(false);
    expect(isSafeStorageKey("a\nb")).toBe(false);
    expect(isSafeStorageKey("")).toBe(false);
    expect(isSafeStorageKey(123)).toBe(false);
  });

  it("mediaProxyUrl encodes safe keys and refuses unsafe ones", () => {
    expect(mediaProxyUrl("products/a b/0.jpeg")).toBe("/api/media/products/a%20b/0.jpeg");
    expect(mediaProxyUrl("../x")).toBeNull();
    expect(mediaProxyUrl("//evil.example")).toBeNull();
  });

  it("validation rejects an item with an unsafe storageKey", () => {
    const res = validateGallery(
      [{ mediaId: "m1", storageKey: "../../backups/db.sql" }],
      DEFAULT_OPTIONS,
    );
    expect(res.ok).toBe(false);
    expect(res.items).toHaveLength(0);
  });

  it("hydrate drops an item whose embedded storageKey is unsafe", async () => {
    const lookup = async () => new Map();
    const out = await hydrateMediaGallery(
      [{ mediaId: "m1", sortOrder: 0, isPrimary: false, meta: {}, storageKey: "../../etc" }],
      lookup,
    );
    expect(out).toEqual([]);
  });
});
