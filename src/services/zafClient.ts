import type { ApiErrorInfo, ZafUser } from '../types/zendesk';

export interface ZafRequestOptions {
  url: string;
  type?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  dataType?: 'json' | 'text';
  contentType?: string;
  data?: string | Record<string, unknown>;
  httpCompleteResponse?: boolean;
}

export interface ZafClientLike {
  get: (paths: string | string[]) => Promise<Record<string, unknown>>;
  request: <T = unknown>(options: ZafRequestOptions) => Promise<T>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ZAFClient?: {
      init: () => ZafClientLike | false;
    };
  }
}

export class ZendeskApiError extends Error {
  public readonly info: ApiErrorInfo;

  constructor(info: ApiErrorInfo) {
    super(info.message);
    this.name = 'ZendeskApiError';
    this.info = info;
  }
}

export function normalizeZafError(err: unknown): ApiErrorInfo {
  if (err instanceof ZendeskApiError) {
    return err.info;
  }

  const record = (typeof err === 'object' && err !== null ? err : {}) as Record<string, unknown>;
  const status =
    typeof record.status === 'number'
      ? record.status
      : typeof record.statusCode === 'number'
        ? record.statusCode
        : 0;

  let rawDetail = '';
  const responseJSON = record.responseJSON as Record<string, unknown> | undefined;
  if (responseJSON) {
    rawDetail =
      String(responseJSON.description ?? responseJSON.error ?? responseJSON.message ?? '');
  } else if (typeof record.responseText === 'string' && record.responseText.trim()) {
    try {
      const parsed = JSON.parse(record.responseText) as Record<string, unknown>;
      rawDetail = String(parsed.description ?? parsed.error ?? parsed.message ?? record.responseText);
    } catch {
      rawDetail = record.responseText;
    }
  } else if (err instanceof Error) {
    rawDetail = err.message;
  } else if (typeof err === 'string') {
    rawDetail = err;
  }

  return {
    status,
    isPermissionDenied: status === 401 || status === 403,
    isNotFound: status === 404,
    message: rawDetail || (status ? `HTTP ${status}` : 'Unknown request error'),
    rawDetail
  };
}

export function initZafClient(): ZafClientLike | null {
  if (typeof window === 'undefined' || !window.ZAFClient) {
    return null;
  }
  const client = window.ZAFClient.init();
  return client || null;
}

export async function getCurrentZafUser(client: ZafClientLike): Promise<ZafUser> {
  const result = await client.get(['currentUser', 'currentUser.locale']);
  const rawUser = (result.currentUser ?? {}) as Record<string, unknown>;
  const locale =
    String(result['currentUser.locale'] ?? rawUser.locale ?? navigator.language ?? 'en-US');

  return {
    id: Number(rawUser.id),
    name: String(rawUser.name ?? ''),
    email: rawUser.email ? String(rawUser.email) : undefined,
    role: rawUser.role ? String(rawUser.role) : undefined,
    locale
  };
}

export async function zafJsonRequest<T>(
  client: ZafClientLike,
  options: {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: Record<string, unknown>;
  }
): Promise<T> {
  try {
    const requestOptions: ZafRequestOptions = {
      url: options.url,
      type: options.method ?? 'GET',
      dataType: 'json'
    };

    if (options.body !== undefined) {
      requestOptions.contentType = 'application/json';
      requestOptions.data = JSON.stringify(options.body);
    }

    return await client.request<T>(requestOptions);
  } catch (err) {
    throw new ZendeskApiError(normalizeZafError(err));
  }
}
