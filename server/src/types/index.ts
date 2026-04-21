export interface ImportBatch {
  contentType: string;
  locale: string | null;
  entries: any[];
}

export interface ImportResults {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  warnings: string[];
}

export interface ExportField {
  key: string;
  enabled: boolean;
}

export interface CollectionConfig {
  enabled?: boolean;
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
  skipFields: string[];
  repeatableComponentDefs: { fieldName: string; componentUid: string }[];
  singleComponentFields: string[];
  repeatableColumns: Record<string, string[]>;
}
