export interface HttpRequest {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  text: string;
  json: unknown;
}

/**
 * Minimal JSON client used by the provisioning adapters.
 *
 * It never throws for HTTP failures so callers can turn a 401 into a clear
 * "check your API key" message, and it always applies a timeout: a hanging
 * provider must not block a deployment forever.
 */
export async function httpRequest(
  url: string,
  request: HttpRequest = {}
): Promise<HttpResponse> {
  const response = await fetch(url, {
    method: request.method ?? 'GET',
    headers: request.headers,
    ...(request.body !== undefined ? { body: request.body } : {}),
    signal: AbortSignal.timeout(request.timeoutMs ?? 20_000),
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  return { ok: response.ok, status: response.status, text, json };
}

/** Pull a provider's error message out of an otherwise opaque response. */
export function httpErrorMessage(
  response: HttpResponse,
  fallback: string
): string {
  const body = response.json as
    | { error?: { message?: string } | string; message?: string }
    | undefined;

  const message =
    typeof body?.error === 'string'
      ? body.error
      : body?.error?.message ?? body?.message;

  return `${fallback} (HTTP ${response.status})${message ? `: ${message}` : ''}`;
}

export function formBody(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  return params.toString();
}
