import type { ShowsConfig } from "./config";
import type {
  ShowsCheckout,
  ShowsCheckoutRequest,
  ShowsEvent,
  ShowsEventQuery,
  ShowsInventory,
  ShowsList,
  ShowsPurchase,
  ShowsSession,
} from "./types";

const DEFAULT_BASE_URL = "https://api.shows.ng/v1";
const TRAILING_SLASHES = /\/+$/;
const TIMEOUT_MS = 10_000;
/** Retries are for idempotent reads only; two is enough to ride out a blip. */
const MAX_GET_RETRIES = 2;

export class ShowsApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(
    message: string,
    details: {
      status: number;
      code: string;
      requestId?: string | null;
      cause?: unknown;
    }
  ) {
    super(message, { cause: details.cause });
    this.name = "ShowsApiError";
    this.status = details.status;
    this.code = details.code;
    this.requestId = details.requestId ?? null;
  }
}

type RequestOptions = {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  idempotencyKey?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Shows wraps failures as `{ error: { code, message, request_id } }`. Anything
 * else (an HTML gateway page, an empty body) still has to become a typed error,
 * so unreadable fields simply stay undefined.
 */
function readErrorBody(body: unknown): {
  code?: string;
  message?: string;
  requestId?: string;
} {
  if (!isRecord(body)) {
    return {};
  }

  const source = isRecord(body.error) ? body.error : body;
  const { code, message, request_id, requestId } = source;

  return {
    ...(typeof code === "string" && code ? { code } : {}),
    ...(typeof message === "string" && message ? { message } : {}),
    ...(typeof request_id === "string" && request_id
      ? { requestId: request_id }
      : {}),
    ...(typeof requestId === "string" && requestId ? { requestId } : {}),
  };
}

function joinUrl(baseUrl: string | undefined, path: string): string {
  const base = (baseUrl ?? DEFAULT_BASE_URL).replace(TRAILING_SLASHES, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function withQuery(url: string, query: RequestOptions["query"]): string {
  if (!query) {
    return url;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");

  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      // A long Retry-After must not park a public GET for hours; every other
      // wait in this client is capped, so this one is too.
      return Math.min(seconds * 1000, 2000);
    }
  }

  // Jitter so a Shows outage does not turn every instance into a metronome.
  return 250 * 2 ** attempt * (0.5 + Math.random());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBody(response: Response, text: string): unknown {
  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    if (response.ok) {
      throw new ShowsApiError("Shows returned an unreadable response", {
        status: response.status,
        code: "invalid_response",
        cause: error,
      });
    }
    // A gateway's HTML error page is still just an http-code failure.
    return null;
  }
}

function errorFor(response: Response, body: unknown): ShowsApiError {
  const details = readErrorBody(body);

  return new ShowsApiError(
    details.message ?? `Shows request failed (${response.status})`,
    {
      status: response.status,
      code: details.code ?? `http_${response.status}`,
      requestId:
        response.headers.get("x-request-id") ?? details.requestId ?? null,
    }
  );
}

async function send(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    throw new ShowsApiError(
      timedOut ? "Shows request timed out" : "Could not reach Shows",
      {
        status: 0,
        code: timedOut ? "timeout" : "network_error",
        cause: error,
      }
    );
  }
}

/**
 * One Shows API call: bearer credential, JSON in and out, typed error.
 *
 * Only GETs are retried. A POST may move money, so its retry has to be decided
 * by the caller that owns the idempotency key and the body (checkout does this
 * explicitly); retrying one here would silently hide a duplicate-charge path.
 */
export async function showsRequest<T>(
  config: ShowsConfig,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const url = withQuery(joinUrl(config.baseUrl, path), options.query);
  const fetchImpl = config.fetchImpl ?? fetch;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.credential}`,
    Accept: "application/json",
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const init: RequestInit = {
    method,
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  };

  const retries = method === "GET" ? MAX_GET_RETRIES : 0;
  let response = await send(fetchImpl, url, init);

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable) {
      break;
    }

    await sleep(retryDelayMs(response, attempt));
    response = await send(fetchImpl, url, init);
  }

  const text = await response.text();
  const body = parseBody(response, text);

  if (!response.ok) {
    throw errorFor(response, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return body as T;
}

export function listEvents(
  config: ShowsConfig,
  query: ShowsEventQuery = {}
): Promise<ShowsList<ShowsEvent>> {
  return showsRequest<ShowsList<ShowsEvent>>(
    config,
    "/products/ticketing/events",
    { query }
  );
}

export function getEvent(
  config: ShowsConfig,
  eventId: string
): Promise<ShowsEvent> {
  return showsRequest<ShowsEvent>(
    config,
    `/products/ticketing/events/${encodeURIComponent(eventId)}`
  );
}

export function getSessions(
  config: ShowsConfig,
  eventId: string
): Promise<ShowsList<ShowsSession>> {
  return showsRequest<ShowsList<ShowsSession>>(
    config,
    `/products/ticketing/events/${encodeURIComponent(eventId)}/sessions`
  );
}

export function getInventory(
  config: ShowsConfig,
  eventId: string,
  sessionId?: string,
  revision?: string
): Promise<ShowsInventory> {
  return showsRequest<ShowsInventory>(
    config,
    `/products/ticketing/events/${encodeURIComponent(eventId)}/inventory`,
    { query: { sessionId, revision } }
  );
}

export function createCheckout(
  config: ShowsConfig,
  input: ShowsCheckoutRequest,
  idempotencyKey: string
): Promise<ShowsCheckout> {
  return showsRequest<ShowsCheckout>(config, "/checkouts", {
    method: "POST",
    body: input,
    idempotencyKey,
  });
}

export function getPurchase(
  config: ShowsConfig,
  reference: string
): Promise<ShowsPurchase> {
  return showsRequest<ShowsPurchase>(
    config,
    `/purchases/${encodeURIComponent(reference)}`
  );
}
