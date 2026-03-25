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

export const COMPONENT_STRIP_KEYS = ["id", "__component", ...SYSTEM_KEYS];
