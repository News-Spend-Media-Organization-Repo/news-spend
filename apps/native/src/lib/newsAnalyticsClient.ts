import { AppState, type AppStateStatus, Platform } from "react-native";

import { isNetworkError } from "#/utils/isNetworkError";
import { storage } from "#/utils/storage";

import { client } from "./orpc";

const QUEUE_KEY = "news_analytics_queue";
const FLUSH_INTERVAL_MS = 10_000; // 10 seconds
const MAX_BATCH_SIZE = 50;

/** Events kept while the server is unreachable. The oldest go first. */
const MAX_QUEUE_SIZE = 1000;

/**
 * How many times the server may answer "I could not store this" before the
 * events are dropped. Without a limit a batch the database keeps refusing is
 * resent every flush for as long as the app is open.
 */
const MAX_SERVER_FAILURES = 5;

/** A gap this long with no events ends the session; the next event starts one. */
const SESSION_IDLE_MS = 30 * 60 * 1000;

export type AnalyticsEvent = {
  articleId: string;
  event:
    | "impression"
    | "view"
    | "read"
    | "like"
    | "dislike"
    | "share"
    | "comment";
  sessionId: string;
  deviceId: string;
  platform: "android" | "ios" | "web";
  metadata?: {
    position?: number;
    screen?: string;
    timeSpent?: number;
    scrollDepth?: number;
    shareMethod?: string;
  };
  timestamp: string;
  /**
   * Who was signed in when this happened. Stamped at enqueue time so a queued
   * event is never credited to whoever happens to be signed in at flush time.
   * Absent on events queued by older builds, which fall back to the flusher.
   */
  userId?: string;
  /** Times the server answered that it could not store this event. */
  failures?: number;
};

type FailureKind = "permanent" | "server" | "transient";

/** oRPC v2 errors carry a `code`, not an HTTP status. */
function orpcCodeOf(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ORPCError" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return;
}

/** The server understood the request and refused it; resending cannot help. */
const PERMANENT_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "METHOD_NOT_SUPPORTED",
  "NOT_ACCEPTABLE",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "UNPROCESSABLE_CONTENT",
]);

/** The server is fine; it asked us to wait. */
const TRANSIENT_CODES = new Set(["TOO_MANY_REQUESTS", "REQUEST_TIMEOUT"]);

/**
 * What a failed request means for the events in it.
 *
 * - `permanent`: the server refused the request itself. Resending the same
 *   events cannot succeed, and keeping them would block every event queued
 *   behind them for good.
 * - `server`: something answered but could not store them, or answered with
 *   something that is not a valid reply (a 5xx, a proxy error page, a route
 *   that no longer exists, an error we do not recognise). Retry, but only a
 *   few times.
 * - `transient`: no answer at all (offline, timeout), or the server asked us
 *   to slow down. Retry indefinitely; being offline is not the events' fault.
 */
function classifyFailure(error: unknown): FailureKind {
  if (isNetworkError(error)) {
    return "transient";
  }
  const code = orpcCodeOf(error);
  if (code !== undefined && TRANSIENT_CODES.has(code)) {
    return "transient";
  }
  return code !== undefined && PERMANENT_CODES.has(code)
    ? "permanent"
    : "server";
}

/** The server's event schema has no `userId` or `failures`; send only its fields. */
function toWireEvent({
  articleId,
  event,
  sessionId,
  deviceId,
  platform,
  metadata,
  timestamp,
}: AnalyticsEvent) {
  return {
    articleId,
    event,
    sessionId,
    deviceId,
    platform,
    metadata,
    timestamp,
  };
}

/** Counts one more refusal against each event and drops those out of chances. */
function recordServerFailure(events: AnalyticsEvent[]): AnalyticsEvent[] {
  return events
    .map((e) => ({ ...e, failures: (e.failures ?? 0) + 1 }))
    .filter((e) => e.failures < MAX_SERVER_FAILURES);
}

function capQueue(queue: AnalyticsEvent[]): AnalyticsEvent[] {
  return queue.length > MAX_QUEUE_SIZE
    ? queue.slice(queue.length - MAX_QUEUE_SIZE)
    : queue;
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

class NewsAnalyticsClient {
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: ReturnType<
    typeof AppState.addEventListener
  > | null = null;
  private sessionId = createId();
  private lastActivityAt = Date.now();

  readonly platform: "android" | "ios" | "web" =
    Platform.OS === "android"
      ? "android"
      : Platform.OS === "ios"
        ? "ios"
        : "web";

  // --- Queue persistence via MMKV ---

  private loadQueue(): AnalyticsEvent[] {
    try {
      const raw = storage.getString(QUEUE_KEY);
      if (raw) {
        return JSON.parse(raw) as AnalyticsEvent[];
      }
    } catch {}
    return [];
  }

  private saveQueue(queue: AnalyticsEvent[]): void {
    try {
      storage.set(QUEUE_KEY, JSON.stringify(queue));
    } catch {}
  }

  // --- Sessions ---

  /**
   * The session an event at `now` belongs to. A session used to last as long
   * as the JS process, so an app left in the background overnight reported
   * one session that spanned days.
   */
  private sessionAt(now: number): string {
    if (now - this.lastActivityAt > SESSION_IDLE_MS) {
      this.sessionId = createId();
    }
    this.lastActivityAt = now;
    return this.sessionId;
  }

  // --- Public API ---

  enqueue(
    event: Omit<AnalyticsEvent, "platform" | "timestamp" | "sessionId">
  ): void {
    const now = Date.now();
    const queue = this.loadQueue();
    queue.push({
      ...event,
      sessionId: this.sessionAt(now),
      platform: this.platform,
      timestamp: new Date(now).toISOString(),
    });
    this.saveQueue(capQueue(queue));
  }

  /**
   * Sends up to one batch. `fallbackUserId` only covers events that carry no
   * `userId` of their own, i.e. those queued by an older build.
   */
  async flush(fallbackUserId?: string): Promise<void> {
    const queue = this.loadQueue();
    if (queue.length === 0) {
      return;
    }

    // Take up to MAX_BATCH_SIZE events
    const batch = queue.splice(0, MAX_BATCH_SIZE);
    // Persist remaining events immediately
    this.saveQueue(queue);

    // The server attributes a whole request to one user, so send each user's
    // events separately.
    const byUser = new Map<string | undefined, AnalyticsEvent[]>();
    for (const e of batch) {
      const userId = e.userId ?? fallbackUserId;
      byUser.set(userId, [...(byUser.get(userId) ?? []), e]);
    }

    const retry: AnalyticsEvent[] = [];
    for (const [userId, events] of byUser) {
      retry.push(...(await this.send(userId, events)));
    }

    if (retry.length > 0) {
      // Put them back ahead of anything queued while the request was out.
      this.saveQueue(capQueue([...retry, ...this.loadQueue()]));
    }
  }

  /** Sends one user's events. Returns the ones that should be tried again. */
  private async send(
    userId: string | undefined,
    events: AnalyticsEvent[]
  ): Promise<AnalyticsEvent[]> {
    try {
      const result = await client.news.analytics.track({
        events: events.map(toWireEvent),
        userId,
      });
      // The request succeeded but the insert did not: the batch is atomic, so
      // none of it landed. The old code read only the HTTP status and lost it.
      return result.failed > 0 ? recordServerFailure(events) : [];
    } catch (error) {
      switch (classifyFailure(error)) {
        case "permanent":
          return [];
        case "server":
          return recordServerFailure(events);
        default:
          return events;
      }
    }
  }

  // --- Lifecycle ---

  start(getUserId: () => string | undefined): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      this.flush(getUserId());
    }, FLUSH_INTERVAL_MS);

    // Flush on app background
    this.appStateSubscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "background" || state === "inactive") {
          this.flush(getUserId());
        }
      }
    );
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
  }
}

export const newsAnalyticsClient = new NewsAnalyticsClient();
