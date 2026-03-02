# strapi-export-import-excel

A Strapi v5 plugin for exporting and importing collection data as Excel (`.xlsx`) or JSON files, with a live preview UI before downloading.

**Requires:** Strapi v5 · Node.js ≥ 18

---

## Features

- **Export to Excel / JSON** — export any collection with field filtering and column reordering
- **Import from Excel / JSON** — upsert entries using a configurable identifier field; rows with empty identifiers are skipped automatically
- **Live preview** — paginated table preview before downloading, with drag-and-drop column reordering and removal
- **Per-collection field config** — configure which fields to include/exclude and their order for both export and import
- **Locale support** — export and import specific locales for i18n-enabled collections
- **Relation flattening** — relation fields are resolved to human-readable display values on export

---

## Installation

```bash
npm install strapi-export-import-excel
# or
yarn add strapi-export-import-excel
```

Then register the plugin in `config/plugins.ts`:

```ts
export default {
  'strapi-export-import-excel': {
    enabled: true,
  },
};
```

Rebuild your Strapi admin and restart the server:

```bash
npm run build
npm run develop
```

---

## Usage

### Export

1. Go to the plugin page in the Strapi admin sidebar
2. Select a collection and (optionally) a locale
3. Click **Preview & Export** to open the preview page
4. Reorder or remove columns using the column sorter
5. Click **Download Excel** to download the file

### Import

1. Select a collection and (optionally) a locale
2. Click **Upload File** and select an `.xlsx`, `.xls`, or `.json` file
3. Select the **Identifier Field** — the column used to match existing entries (rows with an empty identifier are skipped)
4. Click **Start Import**

The import will **create** new entries or **update** existing ones based on the identifier field match.

---

## API Endpoints

All endpoints are prefixed with `/api/strapi-export-import-excel`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings` | Get plugin settings |
| `PUT` | `/settings` | Update plugin settings |
| `GET` | `/collections` | List all collections |
| `GET` | `/locales` | List available locales |
| `GET` | `/collections/:uid/fields` | Get fields for a collection |
| `GET` | `/tabledata` | Paginated data preview (`contentType`, `page`, `limit`, `columns`, `locale`) |
| `GET` | `/export` | Download export (`contentType`, `format`, `columns`, `locale`) |
| `POST` | `/import` | Import file (`multipart/form-data`: `file`, `contentType`, `identifierField`, `locale`) |
| `POST` | `/import-headers` | Read column headers from a file without importing |

---

## Field Configuration

Go to **Settings → Export / Import Excel → Collections** to configure per-collection field settings:

- Toggle fields on/off for export and import
- Drag to reorder fields — the order determines the column order in the exported Excel file

---

## Notes

- Media fields are excluded from export/import
- Component fields are flattened into `componentName_subField` columns on export (single) or serialized as JSON (repeatable)
- Relation fields are exported as display values (resolved by `name`, `title`, `email`, `displayName`, or `businessEmail`)
- On import, relation values are matched back using the same shortcut fields

---

## License

MIT © [Assawin Chittanandha](https://github.com/mello-x)
