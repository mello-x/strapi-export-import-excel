# strapi-export-import-excel

A Strapi v5 plugin for exporting and importing collection data as Excel (`.xlsx`) files, with live preview, nested component support, and per-collection field configuration.

**Requires:** Strapi v5 · Node.js ≥ 18

Plugin preview

<img width="1834" height="401" alt="export-import-homepage" src="https://github.com/user-attachments/assets/5448a4f1-c2bd-4139-bac4-cf88974baa1f" />

---

## Features

- **Export to Excel** — export any collection with field filtering and column reordering
- **Import from Excel / JSON** — upsert entries using a configurable identifier field
- **Nested Import** — import repeatable component data from a separate Excel file, linked to parent entries by an identifier field
- **Live preview** — paginated table preview before downloading, with drag-and-drop column reordering
- **Per-collection field config** — configure which fields to include/exclude and their order
- **Locale support** — export and import specific locales, or bulk import with one sheet per locale
- **Relation handling** — relations are exported as `field:value` format and resolved back on import
- **Repeatable components** — exported as JOIN-style rows (one row per component item, parent fields duplicated)

---

## Installation

```bash
npm install strapi-export-import-excel
# or
yarn add strapi-export-import-excel
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

Repeatable components are expanded into multiple rows — parent fields are duplicated for each component item. Component field columns use dot notation (e.g. `additionalFaqs.category`, `additionalFaqs.faqs`).

### Import

1. Select a collection and (optionally) a locale
2. Click **Upload File** and select an `.xlsx`, `.xls`, or `.json` file
3. Select the **Identifier Field** — the column used to match existing entries
4. Optionally toggle **Publish on import** and **Bulk locale upload**
5. Click **Start Import**

The import will **create** new entries or **update** existing ones based on the identifier field.

### Nested Import (Repeatable Components)

Use the **Nested Import** panel to import repeatable component data from a separate Excel file.

1. Select a collection
2. Select the **Component Field** (filtered to repeatable components only)
3. Select the **Parent Identifier Field** (the field on the parent to match entries)
4. Optionally toggle **Bulk locale upload** for multi-locale files
5. Upload the Excel file and click **Start Nested Import**

#### Excel format for nested import

| entryId | category | items |
|------|----------|-------|
| product-a | name:Electronics | title:Item 1\|title:Item 2 |
| product-a | name:Accessories | title:Item 3 |
| product-b | name:Electronics | title:Item 4 |

- First column = parent identifier value (matches the parent entry)
- Remaining columns = component field names
- Multiple rows with the same identifier = multiple items in the repeatable component array
- Relations use `field:value` format (e.g. `name:Electronics`)
- For multiple relations in one field, pipe-separate them: `title:Item 1|title:Item 2`

#### Bulk locale upload

When enabled, each sheet in the Excel file represents a locale (sheet name = locale code like `en`, `th`). All sheets are processed and component data is imported into their matching locale.

---

## Relation Format

Relations are exported and imported using the `field:value` syntax:

```
entryId:my-related-entry
```

This tells the plugin to look up the target collection where `entryId = "my-related-entry"`.

**Resolution priority on export:**
1. Fields ending in `Id` (e.g. `productId`, `categoryId`)
2. Shortcut fields (`name`, `title`)
3. First available scalar field

**Supported import formats:**
- `field:value` — explicit field lookup (recommended)
- Plain string — falls back to shortcut field matching

For array relations, pipe-separate multiple values:
```
name:Value A|name:Value B|name:Value C
```

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
| `GET` | `/tabledata` | Paginated data preview |
| `GET` | `/export` | Download export |
| `POST` | `/import` | Import file |
| `POST` | `/import-headers` | Read column headers from a file |
| `POST` | `/import-component` | Import repeatable component data |

---

## Field Configuration

Go to **Settings → Export / Import Excel → Collections** to configure per-collection field settings:

- Toggle fields on/off for export
- Drag to reorder fields — the order determines column order in the exported file

---

## Notes

- Media fields are excluded from export/import
- Single (non-repeatable) components are flattened into `componentName_subField` columns
- Repeatable components are expanded into JOIN-style rows with dot notation headers
- Nested import always publishes the updated entry by default
- Custom fields are excluded from export

---

## License

MIT © [Assawin Chittanandha](https://github.com/mello-x)
