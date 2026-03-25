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
}

export interface SchemaFieldSets {
  customFields: string[];
  relationFields: string[];
  skipFields: string[];
  repeatableComponentDefs: { fieldName: string; componentUid: string }[];
  singleComponentFields: string[];
  repeatableColumns: Record<string, string[]>;
}
