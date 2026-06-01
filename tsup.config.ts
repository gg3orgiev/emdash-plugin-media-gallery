import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    plugin: "src/plugin.ts",
    runtime: "src/runtime.ts",
    admin: "src/admin/index.tsx",
  },
  format: ["esm"],
  outExtension: () => ({ js: ".mjs" }),
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  target: "es2022",
  // Never bundle the host or peer packages — they are provided at runtime.
  external: ["emdash", "emdash/plugin", "@emdash-cms/admin", "react", "react/jsx-runtime"],
});
