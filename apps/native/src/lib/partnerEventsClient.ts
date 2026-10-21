import { AppState, type AppStateStatus, Platform } from "react-native";

import { getDeviceId } from "#/hooks/news/useNewsAnalytics";
import type { AdPlacement } from "#/state/adManager";
import { storage } from "#/utils/storage";
import { classifyFailure, createId } from "./analyticsTransport";
import { client } from "./orpc";

const QUEUE_KEY = "partner_events_queue";
const FLUSH_INTERVAL_MS = 10_000;
const MAX_BATCH_SIZE = 50;

/** Events kept while the server is unreachable. The oldest go first. */
const MAX_QUEUE_SIZE = 1000;

/** How many times the server may fail to store an event before it is dropped. */
const MAX_SERVER_FAILURES = 5;

/** A gap this long with no events ends the session; the next event starts one. */
const SESSION_IDLE_MS = 30 * 60 * 1000;

/**
 * The server rejects a whole batch if one event breaks its schema, so every
 * limit it applies is checked here before an event can enter the queue.
 */
const MAX_CONTENT_ID_LENGTH = 64;
const MAX_ID_LENGTH = 200;
const MIN_EVENT_ID_LENGTH = 8;
const MAX_EVENT_ID_LENGTH = 64;
const MAX_POSITION = 10_000;

export type PartnerEvent = {
  contentId: string;
  event: "impression" | "click";
  surface: AdPlacement;
  position?: number;
  sessionId: string;
  deviceId: string;
  platform: "android" | "ios" | "web";
  timestamp: string;
  eventId: string;
  /** Times the server answered that it could not store this event. */
  failures?: number;
};

type NewPartnerEvent = {
  contentId: string;
  event: PartnerEvent["event"];
  surface: AdPlacement;
  position?: number;
};

function validPosition(position: number | undefined): number | undefined {
  return typeof position === "number" &&
    Number.isFinite(position) &&
    position >= 0 &&
    position <= MAX_POSITION
    ? position
    : undefined;
}

function inRange(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === "string" && value.length >= min && value.length <= max
  );
}

/** True when the event would pass the server's schema. */
function isSendable(e: PartnerEvent): boolean {
  return (
    inRange(e.contentId, 0, MAX_CONTENT_ID_LENGTH) &&
    (e.event === "impression" || e.event === "click") &&
    inRange(e.surface, 1, MAX_ID_LENGTH) &&
    inRange(e.sessionId, 1, MAX_ID_LENGTH) &&
    inRange(e.deviceId, 1, MAX_ID_LENGTH) &&
    inRange(e.eventId, MIN_EVENT_ID_LENGTH, MAX_EVENT_ID_LENGTH) &&
    inRange(e.timestamp, 0, 64)
  );
}

/** Only the fields the server's schema knows; no `failures`. */
function toWireEvent({
  contentId,
  event,
  surface,
  position,
  sessionId,
  deviceId,
  eventId,
  platform,
  timestamp,
}: PartnerEvent) {
  return {
    contentId,
    event,
    surface,
    position: validPosition(position),
    sessionId,
    deviceId,
    eventId,
    platform,
    timestamp,
  };
}

function recordServerFailure(events: PartnerEvent[]): PartnerEvent[] {
  return events
    .map((e) => ({ ...e, failures: (e.failures ?? 0) + 1 }))
    .filter((e) => e.failures < MAX_SERVER_FAILURES);
}

function capQueue(queue: PartnerEvent[]): PartnerEvent[] {
  return queue.length > MAX_QUEUE_SIZE
    ? queue.slice(queue.length - MAX_QUEUE_SIZE)
    : queue;
}

class PartnerEventsClient {
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

  private loadQueue(): PartnerEvent[] {
    try {
      const raw = storage.getString(QUEUE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed as PartnerEvent[];
        }
      }
    } catch {}
    return [];
  }

  private saveQueue(queue: PartnerEvent[]): void {
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

  /** The session an event recorded now belongs to (applies the idle rule). */
  currentSessionId(): string {
    return this.sessionAt(Date.now());
  }

  enqueue(event: NewPartnerEvent): void {
    const now = Date.now();
    const next: PartnerEvent = {
      contentId: event.contentId,
      event: event.event,
      surface: event.surface,
      position: validPosition(event.position),
      eventId: createId(),
      sessionId: this.sessionAt(now),
      deviceId: getDeviceId(),
      platform: this.platform,
      timestamp: new Date(now).toISOString(),
    };
    if (!isSendable(next) || next.contentId.length === 0) {
      return;
    }
    const queue = this.loadQueue();
    queue.push(next);
    this.saveQueue(capQueue(queue));
  }

  async flush(): Promise<void> {
    const queue = this.loadQueue();
    if (queue.length === 0) {
      return;
    }

    // Anything stored that the server would reject is dropped here, so it
    // cannot take a whole batch down with it.
    const batch = queue.splice(0, MAX_BATCH_SIZE).filter(isSendable);
    this.saveQueue(queue);
    if (batch.length === 0) {
      return;
    }

    const retry = await this.send(batch);

    if (retry.length > 0) {
      this.saveQueue(capQueue([...retry, ...this.loadQueue()]));
    }
  }

  /** Sends a batch. Returns the events that should be tried again. */
  private async send(events: PartnerEvent[]): Promise<PartnerEvent[]> {
    try {
      const result = await client.partnerContentEvents.track({
        events: events.map(toWireEvent),
      });
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

export const partnerEventsClient = new PartnerEventsClient();
