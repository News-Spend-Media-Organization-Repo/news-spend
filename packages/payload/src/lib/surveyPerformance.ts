import { SURVEY_PROVIDER_IDS, type SurveyProviderId } from "./surveySettings";

export type SurveyPerformanceRow = {
  provider: SurveyProviderId;
  calls: number;
  offers: number;
  awards: number;
  users: number;
  pointsIssued: number;
  reversals: number;
  pointsReversed: number;
};

type EventDoc = {
  provider?: string | null;
  offerCount?: number | null;
};

type ActivityDoc = {
  point?: number | null;
  user?: unknown;
  metadata?: { provider?: string | null } | null;
};

const isProviderId = (value: unknown): value is SurveyProviderId =>
  typeof value === "string" &&
  (SURVEY_PROVIDER_IDS as readonly string[]).includes(value);

const userIdOf = (user: unknown): string | null => {
  if (typeof user === "string") {
    return user;
  }
  if (typeof user === "object" && user !== null) {
    const id = (user as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
};

/**
 * Per-provider totals for the staff view, over whatever rows the caller has
 * already scoped to a date range. Pure so the arithmetic is testable.
 */
export function summariseSurveyPerformance(
  events: EventDoc[],
  activities: ActivityDoc[]
): SurveyPerformanceRow[] {
  const rows = new Map<
    SurveyProviderId,
    SurveyPerformanceRow & { userSet: Set<string> }
  >();
  for (const provider of SURVEY_PROVIDER_IDS) {
    rows.set(provider, {
      provider,
      calls: 0,
      offers: 0,
      awards: 0,
      users: 0,
      pointsIssued: 0,
      reversals: 0,
      pointsReversed: 0,
      userSet: new Set(),
    });
  }

  for (const event of events) {
    const row = isProviderId(event.provider)
      ? rows.get(event.provider)
      : undefined;
    if (!row) {
      continue;
    }
    row.calls += 1;
    row.offers += Number(event.offerCount ?? 0);
  }

  for (const activity of activities) {
    const provider = activity.metadata?.provider;
    const row = isProviderId(provider) ? rows.get(provider) : undefined;
    if (!row) {
      continue;
    }

    const point = Number(activity.point ?? 0);
    if (point > 0) {
      row.awards += 1;
      row.pointsIssued += point;
      const userId = userIdOf(activity.user);
      if (userId) {
        row.userSet.add(userId);
      }
    } else if (point < 0) {
      row.reversals += 1;
      row.pointsReversed += Math.abs(point);
    }
  }

  return [...rows.values()].map(({ userSet, ...row }) => ({
    ...row,
    users: userSet.size,
  }));
}
