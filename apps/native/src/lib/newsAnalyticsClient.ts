import { AppState, type AppStateStatus, Platform } from "react-native";
import { storage } from "#/utils/storage";
import { classifyFailure, createId } from "./analyticsTransport";

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
   * Minted when the event happens and sent unchanged on every retry, so the
   * server can tell an event it already stored from a new one. That is what
   * lets a batch whose reply was lost be sent again without counting twice.
   * Absent on events queued by older builds; it is added when they are sent.
   */
  eventId?: string;
  /** Times the server answered that it could not store this event. */
  failures?: number;
};

/**
 * The server's event schema has no `failures` (and no user: the server takes
 * that from the session); send only its fields.
 */
function toWireEvent({
  articleId,
  event,
  eventId,
  sessionId,
  deviceId,
  platform,
  metadata,
  timestamp,
}: AnalyticsEvent) {
  return {
    articleId,
    event,
    eventId,
    sessionId,
    deviceId,
    platform,
    metadata,
    timestamp,
  };
}

/**
 * Gives an id to any event that has none, which is those queued by a build that
 * predates ids. Done before sending, and the events are put back with it if the
 * send fails, so the id an event was first sent under is the one it is retried
 * under.
 */
function withEventIds(events: AnalyticsEvent[]): AnalyticsEvent[] {
  return events.map((e) => (e.eventId ? e : { ...e, eventId: createId() }));
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
    event: Omit<
      AnalyticsEvent,
      "platform" | "timestamp" | "sessionId" | "eventId" | "failures"
    >
  ): void {
    const now = Date.now();
    const queue = this.loadQueue();
    queue.push({
      ...event,
      eventId: createId(),
      sessionId: this.sessionAt(now),
      platform: this.platform,
      timestamp: new Date(now).toISOString(),
    });
    this.saveQueue(capQueue(queue));
  }

  /**
   * Sends up to one batch. The server works out who the events belong to from
   * the session the request carries, so there is nothing to say about that
   * here.
   */
  async flush(): Promise<void> {
    const queue = this.loadQueue();
    if (queue.length === 0) {
      return;
    }

    // Take up to MAX_BATCH_SIZE events
    const batch = withEventIds(queue.splice(0, MAX_BATCH_SIZE));
    // Persist remaining events immediately
    this.saveQueue(queue);

    const retry = await this.send(batch);

    if (retry.length > 0) {
      // Put them back ahead of anything queued while the request was out.
      this.saveQueue(capQueue([...retry, ...this.loadQueue()]));
    }
  }

  /** Sends a batch. Returns the events that should be tried again. */
  private async send(events: AnalyticsEvent[]): Promise<AnalyticsEvent[]> {
    try {
      const result = await client.news.analytics.track({
        events: events.map(toWireEvent),
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

  start(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      this.flush();
    }, FLUSH_INTERVAL_MS);

    // Flush on app background
    this.appStateSubscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "background" || state === "inactive") {
          this.flush();
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
