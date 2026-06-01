/**
 * Admin entry module (the package's "./admin" export).
 *
 * EmDash loads this inside the admin bundle and looks up field widgets by name:
 * `fields[widgetName]`, where `widgetName` is the part after the colon in the
 * field's `widget: "media-gallery:gallery"`.
 */

import type { ComponentType } from "react";
import type { PluginAdminModule } from "@emdash-cms/admin";
import GalleryField from "./GalleryField.js";
import ImageField from "./ImageField.js";
import { IMAGE_WIDGET_NAME, WIDGET_NAME } from "../schema.js";

// EmDash imports this module as a namespace (`import * as admin`) and reads
// `admin.fields[widgetName]`, so `fields` MUST be a named export (not just on
// the default export). Components are cast because EmDash supplies the real
// props (value/onChange/options/…) at render time.
export const fields: Record<string, ComponentType> = {
  [WIDGET_NAME]: GalleryField as unknown as ComponentType,
  [IMAGE_WIDGET_NAME]: ImageField as unknown as ComponentType,
};

// Default export kept for direct `PluginAdminModule` consumers.
const adminModule: PluginAdminModule = { fields };
export default adminModule;
