const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
const apiToken = process.env.EXPO_PUBLIC_API_TOKEN?.trim();
const API_REQUEST_TIMEOUT_MS = 15_000;

function requestHeaders(): Record<string, string> {
  return apiToken ? { Authorization: `Bearer ${apiToken}` } : {};
}

export function getApiBaseUrl(): string | undefined {
  return apiBaseUrl;
}

export type ApiResponse<T> = { data: T; source: string | null; fallback: boolean };

export async function getApiResponse<T>(path: string, query?: Record<string, string | number | undefined | null>): Promise<ApiResponse<T>> {
  if (!apiBaseUrl) {
    throw new Error('Backend URL is not configured');
  }

  const queryString = query
    ? Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')
    : '';
  const requestUrl = `${apiBaseUrl}${path}${queryString ? `?${queryString}` : ''}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

  if (__DEV__) console.info('[market] request URL', requestUrl);

  try {
    const response = await fetch(requestUrl, { headers: requestHeaders(), signal: controller.signal });
    const source = response.headers.get('X-Market-Data-Source');
    const fallback = response.headers.get('X-Market-Data-Fallback') === 'true';
    if (__DEV__) console.info('[market] HTTP status', response.status, 'source', source ?? 'unknown');
    if (!response.ok) {
      throw new Error(`Backend request failed (${response.status})`);
    }

    const data = await response.json() as T;
    if (__DEV__) console.info('[market] response source', source ?? 'unknown', 'record count', data && typeof data === 'object' && 'records' in data && Array.isArray((data as { records?: unknown }).records) ? (data as { records: unknown[] }).records.length : 'invalid');
    return { data, source, fallback };
  } catch (error) {
    const message = controller.signal.aborted
      ? `Backend request timed out after ${API_REQUEST_TIMEOUT_MS}ms`
      : error instanceof Error ? error.message : 'Backend request failed';
    if (__DEV__) console.warn('[market] request error', message);
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getApi<T>(path: string): Promise<T> {
  return (await getApiResponse<T>(path)).data;
}

export async function postApi<T>(path: string, body: unknown): Promise<T> {
  if (!apiBaseUrl) throw new Error('Backend URL is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...requestHeaders() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json() as T | { error?: string };
    if (!response.ok) throw new Error(typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : `Backend request failed (${response.status})`);
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

  export async function patchApi<T>(path: string, body: unknown): Promise<T> {
    if (!apiBaseUrl) throw new Error('Backend URL is not configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${apiBaseUrl}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...requestHeaders() }, body: JSON.stringify(body), signal: controller.signal });
      const data = await response.json() as T | { error?: string };
      if (!response.ok) throw new Error(typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : `Backend request failed (${response.status})`);
      return data as T;
    } finally {
      clearTimeout(timeout);
    }
  }
