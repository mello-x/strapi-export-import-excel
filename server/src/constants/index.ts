export const SYSTEM_KEYS = [
  "documentId",
  "locale",
  "createdAt",
  "updatedAt",
  "publishedAt",
  "createdBy",
  "updatedBy",
  "localizations",
  "status",
];

export const SHORTCUT_FIELDS = ["name", "title"];

/**
 * The only file-metadata field writable from a spreadsheet, addressed as
 * `<mediaField>.alternativeText`. Deliberately excludes `name` (renaming an
 * asset in bulk is destructive) and `caption`.
 */
export const MEDIA_ALT_SUBFIELD = "alternativeText";

export const COMPONENT_STRIP_KEYS = ["id", "__component", ...SYSTEM_KEYS];
