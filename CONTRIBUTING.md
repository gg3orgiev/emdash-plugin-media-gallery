# Contributing

Contributions are welcome. Issues and pull requests are the best way to propose changes.

## Development

```sh
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # tsup -> dist/
```

`emdash`, `@emdash-cms/admin`, and `react` are peer dependencies; they are installed as dev
dependencies for type-checking and the build.

## Project layout

The code is split so each module has one responsibility, and so the editor and the storefront
communicate only through a stable JSON contract.

| Path | Responsibility | Imports |
|---|---|---|
| `src/schema.ts` | Data contract: types, option defaults, parsing, and key-safety helpers | none |
| `src/validate.ts` | Pure validation: shape, bounds, duplicates, key safety | `schema` |
| `src/runtime.ts` | Storefront read-side hydration (`./runtime` export) | `schema`, `validate` |
| `src/hook.ts` | `content:beforeSave` validation, including media-row binding | `schema`, `validate`, `emdash/plugin` (types) |
| `src/plugin.ts` | Plugin manifest and registration descriptor (`.` export) | `emdash`, `hook`, `schema` |
| `src/admin/` | React field widgets and the admin entry (`./admin` export) | `react`, `@emdash-cms/admin` |

Within `src/admin/`: `index.tsx` is the admin entry module (exports `fields`), `GalleryField.tsx`
is the multi-image widget, `ImageField.tsx` is the single-image widget, and `shared.tsx` holds
the search hook and the reusable search-picker UI.

## Guidelines

- Keep `schema.ts`, `validate.ts`, and `runtime.ts` free of runtime dependencies.
- Treat the stored JSON array as a stable contract; change it only with a version bump.
- Validation that protects the database belongs in `hook.ts`, never only in the widget.
- Prefer the smallest dependency. If reordering is added, use move controls or native drag
  rather than a drag-and-drop library, to keep runtime dependencies at zero.
- Add a test for new validation or hydration behaviour, including the rejection cases.

## Testing against a real EmDash

The pure logic is covered by `vitest`. To exercise the widget and hook end to end, install the
built package into an EmDash project, register the plugin, add a `json` field with
`"widget": "media-gallery:gallery"` and the matching `_emdash_fields` row, then edit a record in
the admin and confirm the value saves and renders.

## License

By contributing, you agree that your contributions are licensed under the project's MIT license.
