import { AppState, type AppStateStatus, Platform } from "react-native";

import { getDeviceId } from "#/hooks/news/useNewsAnalytics";
import { storage } from "#/utils/storage";
import { classifyFailure, createId } from "./analyticsTransport";
import { client } from "./orpc";

const QUEUE_KEY = "discover_analytics_queue";
const FLUSH_INTERVAL_MS = 10_000;
const MAX_BATCH_SIZE = 50;
const MAX_QUEUE_SIZE = 500;
const MAX_SERVER_FAILURES = 5;
/** A gap this long with no events ends the session; the next event starts one. */
const SESSION_IDLE_MS = 30 * 60 * 1000;

export type DiscoverEventName =
  | "view"
  | "section"
  | "open"
  | "game_launch"
  | "game_blocked"
  | "game_report";

export type DiscoverEvent = {
  event: DiscoverEventName;
  section?: string;
  itemType?: string;
  itemId?: string;
  source?: string;
  sessionId: string;
  deviceId: string;
  platform: "android" | "ios" | "web";
  eventId: string;
  timestamp: string;
  /** Times the server answered that it could not store this event. */
  failures?: number;
};

export type DiscoverEventInput = Pick<
  DiscoverEvent,
  "event" | "section" | "itemType" | "itemId" | "source"
>;

const PLATFORM: DiscoverEvent["platform"] =
  Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web";

function toWire({ failures: _failures, ...event }: DiscoverEvent) {
  return event;
}

function capQueue(queue: DiscoverEvent[]): DiscoverEvent[] {
  return queue.length > MAX_QUEUE_SIZE
    ? queue.slice(queue.length - MAX_QUEUE_SIZE)
    : queue;
}

/**
 * Records what people do on the Discover tab, so we can tell whether it is
 * used. Same delivery rules as the news analytics: events are kept on the
 * device until the server has them, each carries an id so a batch whose reply
 * was lost is not counted twice, and the server decides who they belong to from
 * the session, not from anything sent here.
 */
class DiscoverAnalyticsClient {
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: ReturnType<
    typeof AppState.addEventListener
  > | null = null;
  private sessionId = createId();
  private lastActivityAt = Date.now();
  private readonly deviceId = getDeviceId();

  private loadQueue(): DiscoverEvent[] {
    try {
      const raw = storage.getString(QUEUE_KEY);
      if (raw) {
        return JSON.parse(raw) as DiscoverEvent[];
      }
    } catch {}
    return [];
  }

  private saveQueue(queue: DiscoverEvent[]): void {
    try {
      storage.set(QUEUE_KEY, JSON.stringify(queue));
    } catch {}
  }

  private sessionAt(now: number): string {
    if (now - this.lastActivityAt > SESSION_IDLE_MS) {
      this.sessionId = createId();
    }
    this.lastActivityAt = now;
    return this.sessionId;
  }

  track(input: DiscoverEventInput): void {
    const now = Date.now();
    const queue = this.loadQueue();
    queue.push({
      ...input,
      eventId: createId(),
      sessionId: this.sessionAt(now),
      deviceId: this.deviceId,
      platform: PLATFORM,
      timestamp: new Date(now).toISOString(),
    });
    this.saveQueue(capQueue(queue));
  }

  async flush(): Promise<void> {
    const queue = this.loadQueue();
    if (queue.length === 0) {
      return;
    }
    const batch = queue.splice(0, MAX_BATCH_SIZE);
    this.saveQueue(queue);

    const retry = await this.send(batch);
    if (retry.length > 0) {
      // Back ahead of anything queued while the request was out.
      this.saveQueue(capQueue([...retry, ...this.loadQueue()]));
    }
  }

  /** Sends a batch. Returns the events that should be tried again. */
  private async send(events: DiscoverEvent[]): Promise<DiscoverEvent[]> {
    const countFailure = () =>
      events
        .map((e) => ({ ...e, failures: (e.failures ?? 0) + 1 }))
        .filter((e) => e.failures < MAX_SERVER_FAILURES);
    try {
      const result = await client.discoverAnalytics.track({
        events: events.map(toWire),
      });
      return result.failed > 0 ? countFailure() : [];
    } catch (error) {
      switch (classifyFailure(error)) {
        case "permanent":
          return [];
        case "server":
          return countFailure();
        default:
          return events;
      }
    }
  }

  start(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setInterval(() => {
      this.flush();
    }, FLUSH_INTERVAL_MS);
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

export const discoverAnalyticsClient = new DiscoverAnalyticsClient();

/** Record a Discover event. Never throws and never waits. */
export function trackDiscover(input: DiscoverEventInput): void {
  try {
    discoverAnalyticsClient.track(input);
  } catch {}
}
