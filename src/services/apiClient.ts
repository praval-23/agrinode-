const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
const apiToken = process.env.EXPO_PUBLIC_API_TOKEN?.trim();
const API_REQUEST_TIMEOUT_MS = 15_000;

function requestHeaders(): Record<string, string> {
  return apiToken ? { Authorization: `Bearer ${apiToken}` } : {};
}

function diagnosticUrl(requestUrl: string): string {
  try {
    const url = new URL(requestUrl);
    url.username = '';
    url.password = '';
    for (const key of url.searchParams.keys()) {
      if (/key|token|secret|password|auth|credential/i.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.toString();
  } catch {
    return requestUrl.split('?')[0];
  }
}

function diagnosticBody(body: string): string {
  const safeBody = apiToken ? body.split(apiToken).join('[REDACTED]') : body;
  return safeBody
    .replace(/((?:authorization|api[_-]?key|access[_-]?token|token|secret|password)\s*["']?\s*[:=]\s*["']?)[^&\s"'<>]+/gi, '$1[REDACTED]')
    .slice(0, 200);
}

async function readJsonResponse<T>(response: Response, requestUrl: string, method: string): Promise<T> {
  const body = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  if (__DEV__ && (/\/api\/(?:market|ondc)\//i.test(requestUrl))) {
    console.info('[api] response diagnostic', {
      method,
      requestUrl: diagnosticUrl(requestUrl),
      finalUrl: diagnosticUrl(response.url || requestUrl),
      status: response.status,
      contentType: contentType || '(missing)',
      bodyPreview: diagnosticBody(body),
    });
  }

  if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType)) {
    throw new Error(`Expected a JSON response from the backend (HTTP ${response.status}, Content-Type ${contentType || 'missing'}). Check the API URL and endpoint path.`);
  }

  let data: unknown;
  try {
    data = JSON.parse(body) as unknown;
  } catch {
    throw new Error(`Backend returned invalid JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error
      : `Backend request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export function getApiBaseUrl(): string | undefined {
  return apiBaseUrl;
}

export type ApiResponse<T> = { data: T; source: string | null; fallback: boolean };

export async function getApiResponse<T>(
  path: string,
  query?: Record<string, string | number | undefined | null>,
  options: { timeoutMs?: number } = {},
): Promise<ApiResponse<T>> {
  if (!apiBaseUrl) {
    throw new Error('Backend URL is not configured');
  }

  const queryString = query
    ? Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')
    : '';
  const requestUrl = `${apiBaseUrl}${path}${queryString ? `?${queryString}` : ''}`;
  const timeoutMs = options.timeoutMs ?? API_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (__DEV__ && /\/api\/(?:market|ondc)\//i.test(requestUrl)) console.info('[api] request URL', diagnosticUrl(requestUrl));

  try {
    const response = await fetch(requestUrl, { headers: requestHeaders(), signal: controller.signal });
    const source = response.headers.get('X-Market-Data-Source');
    const fallback = response.headers.get('X-Market-Data-Fallback') === 'true';
    const data = await readJsonResponse<T>(response, requestUrl, 'GET');
    if (__DEV__) console.info('[market] response source', source ?? 'unknown', 'record count', data && typeof data === 'object' && 'records' in data && Array.isArray((data as { records?: unknown }).records) ? (data as { records: unknown[] }).records.length : 'invalid');
    return { data, source, fallback };
  } catch (error) {
    const message = controller.signal.aborted
      ? `Backend request timed out after ${timeoutMs}ms`
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
  const requestUrl = `${apiBaseUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...requestHeaders() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await readJsonResponse<T>(response, requestUrl, 'POST');
  } finally {
    clearTimeout(timeout);
  }
}

  export async function patchApi<T>(path: string, body: unknown): Promise<T> {
    if (!apiBaseUrl) throw new Error('Backend URL is not configured');
    const requestUrl = `${apiBaseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(requestUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...requestHeaders() }, body: JSON.stringify(body), signal: controller.signal });
      return await readJsonResponse<T>(response, requestUrl, 'PATCH');
    } finally {
      clearTimeout(timeout);
    }
  }
