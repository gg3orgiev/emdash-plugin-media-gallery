/**
 * Plugin manifest (the package's main entry).
 *
 * This is a native EmDash plugin: it declares a field widget under `admin` and
 * a server validation hook. It deliberately does not import any admin/React
 * code — the editor UI is referenced by module specifier (`admin.entry`) and
 * loaded only inside the admin bundle, keeping this entry server-safe.
 */

import { definePlugin } from "emdash";
import { createGalleryBeforeSave } from "./hook.js";
import { IMAGE_WIDGET_NAME, PLUGIN_ID, WIDGET_NAME } from "./schema.js";

/** Package version; kept in one place for the manifest and the descriptor. */
export const VERSION = "0.1.0";

/** The module specifier the host imports to load this plugin's definition. */
const ENTRYPOINT = "emdash-plugin-media-gallery";

/** The module specifier the admin bundle imports for the field widget. */
const ADMIN_ENTRY = "emdash-plugin-media-gallery/admin";

const plugin = definePlugin({
  id: PLUGIN_ID,
  version: VERSION,
  // Least privilege: we only need to read the media table to verify references.
  capabilities: ["read:media"],
  admin: {
    // Loaded by the admin bundle; see the package "./admin" export.
    entry: "emdash-plugin-media-gallery/admin",
    fieldWidgets: [
      {
        name: WIDGET_NAME,
        label: "Media Gallery",
        // We store in a built-in `json` field and drive its editing UI.
        fieldTypes: ["json"],
      },
      {
        name: IMAGE_WIDGET_NAME,
        label: "Image (searchable)",
        // A searchable single-image picker for a built-in `image` field.
        fieldTypes: ["image"],
      },
    ],
  },
  hooks: {
    "content:beforeSave": createGalleryBeforeSave(),
  },
});

export default plugin;

/**
 * Factory the EmDash plugin loader calls to instantiate the plugin.
 *
 * EmDash's generated `virtual:emdash/plugins` does
 * `import { createPlugin } from "<entrypoint>"` and calls it with the
 * descriptor's `options`. We have no options yet, so it returns the definition.
 */
export function createPlugin(_options?: Record<string, unknown>) {
  return plugin;
}

/**
 * Register the plugin in `emdash({ plugins: [...] })`.
 *
 * Returns a {@link https://github.com/emdash-cms/emdash | PluginDescriptor}: the
 * host imports `entrypoint` (this package) to get the definition above.
 *
 * `adminEntry` is required for the field widget to load — EmDash only imports a
 * plugin's admin module (into the admin bundle) when the descriptor declares it.
 *
 * @example
 * ```ts
 * import { mediaGalleryPlugin } from "emdash-plugin-media-gallery";
 * emdash({ plugins: [mediaGalleryPlugin()] });
 * ```
 */
export function mediaGalleryPlugin(): {
  id: string;
  version: string;
  entrypoint: string;
  adminEntry: string;
} {
  return { id: PLUGIN_ID, version: VERSION, entrypoint: ENTRYPOINT, adminEntry: ADMIN_ENTRY };
}

// Re-export the contract so consumers can import types/constants from the root.
export type { GalleryItem, GalleryOptions } from "./schema.js";
export { PLUGIN_ID, WIDGET_NAME, WIDGET_REF } from "./schema.js";
