export interface ImportResults {
  created: number;
  updated: number;
  skipped: number;
  /** Files whose metadata (e.g. alternativeText) was written via the upload plugin. */
  mediaUpdated: number;
  errors: string[];
}

export interface ExportField {
  key: string;
  enabled: boolean;
}

export interface CollectionConfig {
  exportEnabled?: boolean;
  importEnabled?: boolean;
  exportFields?: ExportField[];
}

export interface PluginSettings {
  collections: Record<string, CollectionConfig>;
}

export interface SchemaFieldSets {
  customFields: string[];
  relationFields: string[];
  /** Multiple-media fields: not exportable. Single media go to mediaAltFields instead. */
  skipFields: string[];
  mediaAltFields: string[];
  /** Every component field (single and repeatable), in schema order. */
  componentFields: string[];
  repeatableComponentDefs: { fieldName: string; componentUid: string }[];
  singleComponentFields: string[];
  repeatableColumns: Record<string, string[]>;
}
