/**
 * Shared constants for the giveaway draw engine.
 *
 * Tier eligibility thresholds are platform business rules and are deliberately
 * NOT configurable by the giveaway administrator (spec §1, §7, §8, §11).
 */

export const PRIZE_TIERS = ["tier1", "tier2", "tier3"] as const;
export type PrizeTier = (typeof PRIZE_TIERS)[number];

export const PRIZE_TIER_OPTIONS = [
  { label: "Tier 1 – High Tier Prizes", value: "tier1" },
  { label: "Tier 2 – Mid Tier Prizes", value: "tier2" },
  { label: "Tier 3 – Low Tier Prizes", value: "tier3" },
] as const;

/** Order in which tiers are processed during a draw (spec §12). */
export const TIER_PROCESSING_ORDER: readonly PrizeTier[] = [
  "tier1",
  "tier2",
  "tier3",
];

/**
 * Primary eligibility path — must all be satisfied within the active giveaway
 * period (spec §11).
 */
export const PRIMARY_ELIGIBILITY: Record<
  PrizeTier,
  { tickets: number; boosts: number; featuredOffers: number }
> = {
  tier1: { tickets: 10, boosts: 3, featuredOffers: 1 },
  tier2: { tickets: 4, boosts: 2, featuredOffers: 1 },
  tier3: { tickets: 1, boosts: 0, featuredOffers: 0 },
};

/**
 * Consecutive giveaway eligibility path — the per-giveaway bar that must be met
 * in each of `CONSECUTIVE_GIVEAWAYS_REQUIRED` giveaways in a row (spec §11).
 * Tier 3 has no consecutive path; one valid ticket already qualifies.
 */
export const CONSECUTIVE_ELIGIBILITY: Record<
  PrizeTier,
  { tickets: number; boosts: number; featuredOffers: number } | null
> = {
  tier1: { tickets: 3, boosts: 3, featuredOffers: 1 },
  tier2: { tickets: 2, boosts: 2, featuredOffers: 1 },
  tier3: null,
};

export const CONSECUTIVE_GIVEAWAYS_REQUIRED = 4;

/**
 * Fairness and anti-abuse rules (spec §22, and §20 rules 16–19).
 *
 * These are platform rules, not per-giveaway settings — the specification
 * states them unconditionally, so there is deliberately no toggle to disable
 * them. Use a dry run to see their effect without committing a draw.
 */

/** §22.1 — a Tier 1 or Tier 2 win bars both tiers for this many draws. */
export const HIGH_TIER_COOLDOWN_DRAWS = 1;

/** §22.2 — a Tier 1 win bars Tier 1 for this many subsequent draws. */
export const TIER1_COOLDOWN_DRAWS = 4;

/** §22.3 — winning Tier 1 this many draws running triggers a suspension. */
export const MAX_CONSECUTIVE_TIER1_WINS = 2;

/** §22.3 — length of that suspension, in draws. */
export const TIER1_SUSPENSION_DRAWS = 2;

/** §22.4 — participating this many draws running with no prize earns a waiver. */
export const LOYALTY_WAIVER_AFTER_DRAWS = 4;

/**
 * How many previously completed giveaways the draw needs to look back over.
 *
 * Every rule above resolves within this window: the Tier 1 cooldown and the
 * loyalty waiver both reach four draws back, and the consecutive-win rules
 * reach less. A win older than this is simply out of cooldown, which is the
 * correct outcome — so there is no need to load more history.
 */
export const FAIRNESS_LOOKBACK_DRAWS = Math.max(
  TIER1_COOLDOWN_DRAWS,
  LOYALTY_WAIVER_AFTER_DRAWS,
  MAX_CONSECUTIVE_TIER1_WINS + TIER1_SUSPENSION_DRAWS
);

/** Account-level trust states used by §22.5–22.8. */
export const ACCOUNT_TRUST_STATUSES = [
  "ok",
  "suspicious",
  "disqualified",
] as const;
export type AccountTrustStatus = (typeof ACCOUNT_TRUST_STATUSES)[number];

export const ACCOUNT_TRUST_STATUS_OPTIONS = [
  { label: "OK", value: "ok" },
  { label: "Suspicious — winners held for review", value: "suspicious" },
  { label: "Disqualified — excluded from draws", value: "disqualified" },
] as const;

/** Ticket states. Only `valid` participates in the draw (spec §6). */
export const TICKET_STATUSES = [
  "valid",
  "cancelled",
  "refunded",
  "reversed",
  "unpaid",
  "fraudulent",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_OPTIONS = [
  { label: "Valid", value: "valid" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refunded", value: "refunded" },
  { label: "Reversed", value: "reversed" },
  { label: "Unpaid", value: "unpaid" },
  { label: "Fraudulent", value: "fraudulent" },
] as const;

/**
 * The two engagement activities that contribute to Tier 1 and Tier 2
 * eligibility (spec §7, §8).
 *
 * Both are already real surfaces in the app, backed by `partner-content`:
 * a Boost is watching a Connect Brand advertisement (placements
 * `connect-brands-tab` / `connect-brand-video`), and a Featured Offer is an
 * item on the Lucky App Wall (placement `lucky-app-wall`). They share one
 * collection because they differ only in which surface produced them.
 */
export const ENGAGEMENT_TYPES = ["boost", "featured_offer"] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];

export const ENGAGEMENT_TYPE_OPTIONS = [
  { label: "Boost Your Luck", value: "boost" },
  { label: "Featured Offer", value: "featured_offer" },
] as const;

/**
 * Engagement completion states. Only `completed` counts towards tier
 * eligibility (spec §7, §8).
 */
export const COMPLETION_STATUSES = [
  "completed",
  "incomplete",
  "abandoned",
  "failed",
] as const;
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];

export const COMPLETION_STATUS_OPTIONS = [
  { label: "Completed", value: "completed" },
  { label: "Incomplete", value: "incomplete" },
  { label: "Abandoned", value: "abandoned" },
  { label: "Failed", value: "failed" },
] as const;

/** Giveaway lifecycle. Configuration locks once the draw begins (spec §5, §16). */
export const GIVEAWAY_STATUSES = [
  "draft",
  "active",
  "drawing",
  "completed",
  "failed",
] as const;
export type GiveawayStatus = (typeof GIVEAWAY_STATUSES)[number];

export const GIVEAWAY_STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Drawing", value: "drawing" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
] as const;

/** Statuses in which giveaway configuration may no longer be edited. */
export const LOCKED_GIVEAWAY_STATUSES: readonly GiveawayStatus[] = [
  "drawing",
  "completed",
];

/** Audit log event types (spec §17). */
export const AUDIT_EVENT_TYPES = [
  "ticket_purchase",
  "ticket_status_change",
  "boost_completion",
  "featured_offer_completion",
  "participants_snapshot",
  "candidate_pool_built",
  "candidate_pool_locked",
  "winner_disqualified",
  "replacement_selected",
  "winner_held_ticket_invalid",
  "account_excluded",
  "fairness_exclusion",
  "loyalty_waiver_applied",
  "winner_held_for_review",
  "winner_selected",
  "prize_allocated",
  "prize_exhausted",
  "tier_completed",
  "draw_started",
  "draw_resumed",
  "draw_completed",
  "draw_error",
  "winner_report_sent",
  "claim_status_change",
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const AUDIT_EVENT_TYPE_OPTIONS = AUDIT_EVENT_TYPES.map((value) => ({
  label: value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" "),
  value,
}));

export const WINNER_REPORT_RECIPIENT = "reward@newsspend.com";
