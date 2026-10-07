import type { Core } from "@strapi/strapi";
import { SHORTCUT_FIELDS } from "../constants";
import type { ImportResults } from "../types";
import { extractSchemaFieldSets } from "../utils/export/transform";
import { describeError, hasChanges } from "../utils/import/compare";
import { cleanSheetRows } from "../utils/import/file";
import {
  MEDIA_ALT_KEY,
  mergeComponentData,
  parseJsonIfNeeded,
  parseMediaAltColumn,
  setNestedPath,
} from "../utils/import/transform";

const importService = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Import a single batch of already-parsed sheet rows (header→value objects),
   * as sent by the admin UI's client-driven chunked import. Stateless: no file,
   * no background work — each call fully completes within the request, so it can
   * never exceed a reverse-proxy timeout no matter how large the source file is.
   */
  async importBatch(
    rawRows: any[],
    contentType: string,
    locale: string | null = null,
    identifierField: string | null = null,
    publishOnImport = false,
    startRow = 2
  ): Promise<ImportResults> {
    if (!strapi.contentTypes[contentType]) {
      return { created: 0, updated: 0, skipped: 0, mediaUpdated: 0, errors: [`Content type ${contentType} not found`] };
    }
    const rows = cleanSheetRows(Array.isArray(rawRows) ? rawRows : []);
    const entries = this.unflattenRows(rows, contentType);
    return this.importEntries(entries, contentType, locale, identifierField, publishOnImport, startRow);
  },

  unflattenRows(rows: any[], ctName: string): any[] {
    const attributes = strapi.contentTypes[ctName]?.attributes || {};

    const { componentFields, mediaAltFields } = extractSchemaFieldSets(attributes, strapi);

    return rows.map((row) => {
      const rowData: Record<string, any> = {};

      for (const [key, rawValue] of Object.entries(row)) {
        const value = rawValue === "" || rawValue === undefined ? null : rawValue;

        const mediaField = parseMediaAltColumn(key, mediaAltFields);
        if (mediaField) {
          if (!rowData[MEDIA_ALT_KEY]) rowData[MEDIA_ALT_KEY] = {};
          rowData[MEDIA_ALT_KEY][mediaField] = value;
          continue;
        }

        const compName = componentFields.find((name) => key === name || key.startsWith(`${name}_`));

        if (compName) {
          if (key === compName) {
            rowData[compName] = parseJsonIfNeeded(value);
          } else {
            if (!rowData[compName]) rowData[compName] = {};
            setNestedPath(rowData[compName], key.slice(compName.length + 1), value);
          }
          continue;
        }

        if (value === null) {
          rowData[key] = null;
        } else if (
          attributes[key] &&
          (attributes[key] as any).customField &&
          (attributes[key] as any).default === "[]"
        ) {
          rowData[key] = String(value).split("|");
        } else {
          rowData[key] = parseJsonIfNeeded(value);
        }
      }

      return rowData;
    });
  },

  async resolveRelationValue(
    value: any,
    target: string,
    locale: string | null = null
  ): Promise<{ documentId: string } | null> {
    const targetAttr = strapi.contentTypes[target]?.attributes;
    if (!targetAttr) return null;

    const targetIsLocalized = (strapi.contentTypes[target] as any)?.pluginOptions?.i18n?.localized ?? false;
    const localeParam = targetIsLocalized && locale ? { locale } : {};

    let lookupField: string | null = null;
    let lookupValue: any = null;

    if (typeof value === "string" && value.includes(":")) {
      const colonIdx = value.indexOf(":");
      lookupField = value.slice(0, colonIdx);
      lookupValue = value.slice(colonIdx + 1);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length > 0) {
        lookupField = keys[0];
        lookupValue = value[keys[0]];
      }
    }

    if (lookupField && lookupValue != null) {
      if (!(targetAttr as any)[lookupField]) {
        throw new Error(`Field "${lookupField}" does not exist on ${target}`);
      }
      const existing = await strapi.documents(target as any).findFirst({
        filters: { [lookupField]: { $eq: lookupValue } } as any,
        ...localeParam,
      } as any);
      if (existing) return { documentId: existing.documentId };
      throw new Error(
        `Record with ${lookupField} "${lookupValue}" not found in ${target}${locale ? ` (locale: ${locale})` : ""}`
      );
    }

    if (typeof value === "string") {
      for (const shortcut of SHORTCUT_FIELDS) {
        if (!(targetAttr as any)[shortcut]) continue;
        const existing = await strapi.documents(target as any).findFirst({
          filters: { [shortcut]: { $eq: value } } as any,
          ...localeParam,
        } as any);
        if (existing) return { documentId: existing.documentId };
        throw new Error(
          `Record with ${shortcut} "${value}" not found in ${target}${locale ? ` (locale: ${locale})` : ""}`
        );
      }
    }

    return null;
  },

  /** Resolves one relation cell (`field:value`, shortcut, or `|`-joined list) to document refs. */
  async resolveRelationField(value: any, attr: any, locale: string | null): Promise<any> {
    const isArrayRelation = attr.relation === "manyToMany" || attr.relation === "oneToMany";
    if (typeof value === "string" && isArrayRelation) value = value.split("|");

    const values = Array.isArray(value) ? value : [value];
    const processed: any[] = [];
    for (const relValue of values) {
      if (!relValue) continue;
      const resolved = await this.resolveRelationValue(relValue, attr.target, locale);
      if (resolved) processed.push(resolved);
    }
    return isArrayRelation || Array.isArray(value) ? processed : processed[0];
  },

  async handleRelations(
    entry: Record<string, any>,
    contentType: string,
    locale: string | null = null
  ): Promise<Record<string, any>> {
    const attributes = strapi.contentTypes[contentType]?.attributes ?? {};
    const updatedEntry = { ...entry };

    for (const [field, attr] of Object.entries<any>(attributes)) {
      // A column absent from the sheet means "leave this relation alone"; only a column
      // that is present and empty clears it. Without this distinction a narrow sheet
      // (e.g. sku + banner.alternativeText) silently wipes every relation it omits,
      // and reports the wipe as a successful "updated".
      if (attr.type !== "relation" || !(field in entry)) continue;

      const value = entry[field];
      const isArrayRelation = attr.relation === "manyToMany" || attr.relation === "oneToMany";

      if (!value) {
        updatedEntry[field] = isArrayRelation ? [] : null;
        continue;
      }
      if (typeof value === "string" && !isArrayRelation && value.includes("|")) {
        throw new Error(`Invalid value for field ${field}: ${value} — not an array relation`);
      }

      updatedEntry[field] = await this.resolveRelationField(value, attr, locale);
    }

    return updatedEntry;
  },

  async resolveComponentRelations(
    componentData: any,
    componentUid: string,
    locale: string | null = null
  ): Promise<any> {
    const compSchema = (strapi as any).components?.[componentUid];
    if (!compSchema?.attributes) return componentData;

    if (Array.isArray(componentData)) {
      const resolved = [];
      for (const item of componentData) {
        resolved.push(await this.resolveComponentRelations(item, componentUid, locale));
      }
      return resolved;
    }

    if (!componentData || typeof componentData !== "object") return componentData;

    const result = { ...componentData };

    for (const [fieldName, attr] of Object.entries<any>(compSchema.attributes)) {
      if (!(fieldName in result) || result[fieldName] == null || result[fieldName] === "") continue;

      if (attr.type === "relation") {
        result[fieldName] = (await this.resolveRelationField(result[fieldName], attr, locale)) ?? null;
      } else if (attr.type === "component") {
        result[fieldName] = await this.resolveComponentRelations(result[fieldName], attr.component, locale);
      }
    }

    return result;
  },

  async handleComponentRelations(
    entry: Record<string, any>,
    contentType: string,
    locale: string | null = null
  ): Promise<Record<string, any>> {
    const attributes = strapi.contentTypes[contentType]?.attributes ?? {};
    const updatedEntry = { ...entry };

    for (const [fieldName, def] of Object.entries<any>(attributes)) {
      if (def.type !== "component") continue;
      if (!updatedEntry[fieldName]) continue;

      updatedEntry[fieldName] = await this.resolveComponentRelations(updatedEntry[fieldName], def.component, locale);
    }

    return updatedEntry;
  },

  /**
   * Writes `<mediaField>.alternativeText` values onto the *files* the entry's media
   * fields point at, via the upload plugin. The document service cannot do this: it
   * reads a media field as "which file to link", not as that file's metadata.
   *
   * Called outside the `hasChanges` gate in importEntries by design. A row carrying
   * only alt text produces no entry-level diff, so gating this on an entry write
   * would make every such row a silent no-op.
   *
   * A blank cell means "leave unchanged", matching updateFileInfo's nil semantics.
   */
  async applyMediaAltText(
    mediaAltValues: Record<string, any>,
    entry: any,
    results: ImportResults,
    rowLabel: string
  ): Promise<void> {
    const pending = Object.entries(mediaAltValues).filter(([, value]) => value != null && String(value).trim() !== "");
    if (pending.length === 0) return;

    if (!entry) {
      results.errors.push(`${rowLabel}: alt text given but the entry was created, so no file is linked yet`);
      return;
    }

    const uploadService = strapi.plugin("upload").service("upload");

    for (const [field, rawValue] of pending) {
      const alternativeText = String(rawValue).trim();
      const file = entry[field];

      if (!file?.id) {
        results.errors.push(`${rowLabel}: "${field}" has no file attached — alt text skipped`);
        continue;
      }
      if (file.alternativeText === alternativeText) continue;

      await uploadService.updateFileInfo(file.id, { alternativeText });
      results.mediaUpdated++;
    }
  },

  async importEntries(
    entries: any[],
    contentType: string,
    locale: string | null = null,
    identifierField: string | null = null,
    publishOnImport = false,
    startRow = 2
  ) {
    const results: ImportResults = { created: 0, updated: 0, skipped: 0, mediaUpdated: 0, errors: [] };
    const attributes = strapi.contentTypes[contentType]?.attributes ?? {};
    const { componentFields } = extractSchemaFieldSets(attributes, strapi);

    const isLocalized = (strapi.contentTypes[contentType] as any)?.pluginOptions?.i18n?.localized ?? false;
    const localeParam = isLocalized && locale ? { locale } : {};
    const statusParam = publishOnImport ? { status: "published" as const } : {};

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const byIdentifier = identifierField && identifierField !== "id";
      const idVal = byIdentifier ? entry[identifierField] : null;
      const rowLabel = `Row ${startRow + i}${idVal != null ? ` (${identifierField}=${idVal})` : ""}`;

      try {
        if (byIdentifier && (idVal == null || (typeof idVal === "string" && !idVal.trim()))) {
          results.skipped++;
          continue;
        }

        let existing: any = null;
        const { id, [MEDIA_ALT_KEY]: mediaAltValues, ...rawData } = entry;

        if (idVal != null) {
          existing = await strapi.documents(contentType as any).findFirst({
            filters: { [identifierField]: { $eq: idVal } } as any,
            populate: "*",
            ...localeParam,
          } as any);
        } else if (id && id !== "null" && id !== "undefined") {
          existing = await strapi.documents(contentType as any).findFirst({
            filters: { id } as any,
            populate: "*",
            ...localeParam,
          } as any);
        }

        let data = await this.handleRelations(rawData, contentType, locale);
        data = await this.handleComponentRelations(data, contentType, locale);
        data = mergeComponentData(data, existing, componentFields);

        // The entry the row's media alt text applies to, if any. Set wherever we
        // matched an existing document; stays null when the row creates one.
        let mediaEntry: any = existing;

        if (existing) {
          const needsPublish = publishOnImport && existing.publishedAt == null;
          if (hasChanges(existing, data) || needsPublish) {
            await strapi.documents(contentType as any).update({
              documentId: existing.documentId,
              data,
              ...statusParam,
              ...localeParam,
            } as any);
            results.updated++;
          }
        } else {
          mediaEntry =
            locale && idVal != null
              ? await strapi.documents(contentType as any).findFirst({
                  filters: { [identifierField]: { $eq: idVal } } as any,
                  populate: "*",
                } as any)
              : null;
          if (mediaEntry) {
            await strapi.documents(contentType as any).update({
              documentId: mediaEntry.documentId,
              data,
              ...statusParam,
              ...localeParam,
            } as any);
            results.updated++;
          } else {
            await strapi.documents(contentType as any).create({
              data,
              ...statusParam,
              ...localeParam,
            } as any);
            results.created++;
          }
        }

        // Outside the hasChanges gate on purpose — see applyMediaAltText.
        if (mediaAltValues) {
          await this.applyMediaAltText(mediaAltValues, mediaEntry, results, rowLabel);
        }
      } catch (err: any) {
        const errorMsg = describeError(err);
        strapi.log.error(`${rowLabel} failed: ${errorMsg}`, err?.details || err);
        results.errors.push(`${rowLabel}: ${errorMsg}`);
        results.skipped++;
      }
    }

    return results;
  },
});

export default importService;
