import { getFetchClient, isFetchError } from "@strapi/strapi/admin";
import { PLUGIN_ID } from "../pluginId";

/**
 * The plugin's routes live on the admin API and need the administrator's token, so
 * every call goes through Strapi's own fetch client (which also refreshes it) rather
 * than a bare `fetch`. Returns the parsed JSON body; failures throw an Error whose
 * message is the server's, e.g. "403 You are not allowed to access this content type".
 */
const toError = (error: unknown): Error => {
  if (isFetchError(error)) {
    const message = error.response?.data?.error?.message ?? error.message;
    return new Error(`${error.status ?? ""} ${message}`.trim());
  }
  return error instanceof Error ? error : new Error(String(error));
};

const pluginUrl = (path: string, params?: URLSearchParams): string =>
  `/${PLUGIN_ID}${path}${params && params.size > 0 ? `?${params}` : ""}`;

export async function apiGet<T = any>(path: string, params?: URLSearchParams): Promise<T> {
  try {
    const { data } = await getFetchClient().get<T>(pluginUrl(path, params));
    return data;
  } catch (error) {
    throw toError(error);
  }
}

export async function apiSend<T = any>(method: "post" | "put", path: string, body: unknown): Promise<T> {
  try {
    const { data } = await getFetchClient()[method]<T>(pluginUrl(path), body);
    return data;
  } catch (error) {
    throw toError(error);
  }
}
