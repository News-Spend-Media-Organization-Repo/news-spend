/**
 * Display labels for ContentReport reasons, shared by the urgent alert and the
 * nightly digest so the two emails never drift apart. Keys must stay in sync
 * with the `reason` options in the ContentReport collection.
 */
export const REASON_LABELS: Record<string, string> = {
  spam: "Spam or Advertising",
  harassment: "Harassment or Bullying",
  "hate-speech": "Hate Speech or Discrimination",
  misinformation: "Misinformation",
  "personal-info": "Personal Information",
  inappropriate: "Explicit or Inappropriate Content",
  "off-topic": "Off-Topic",
  trolling: "Trolling or Deliberate Provocation",
  illegal: "Illegal Activity",
  other: "Other",
};

/**
 * Reasons that bypass the nightly digest and trigger an immediate admin email.
 * These are the categories where a day of latency is not defensible.
 */
export const URGENT_REASONS = new Set([
  "illegal",
  "hate-speech",
  "harassment",
  "inappropriate",
]);
