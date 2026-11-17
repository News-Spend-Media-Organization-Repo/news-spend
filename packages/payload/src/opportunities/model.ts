/** Shared contracts. Keep this module free of server/native imports. */
export const DEFAULT_INTERESTS = [
  {
    key: "jobs",
    label: "Jobs",
    preferences: [
      "IT & Digital",
      "Business & Governance",
      "Healthcare",
      "Engineering & Technical",
      "Finance",
      "Education",
      "Customer & Technical Support",
      "Other",
    ],
  },
  {
    key: "education",
    label: "Scholarships & Education",
    preferences: [
      "Undergraduate",
      "Graduate/Postgraduate",
      "Professional & Skills Training",
      "Research",
    ],
  },
  {
    key: "immigration",
    label: "Immigration",
    preferences: [
      "Canada",
      "United States",
      "United Kingdom",
      "Australia",
      "Europe",
      "Other",
    ],
  },
  {
    key: "funding",
    label: "Grants & Funding",
    preferences: [
      "Business Grants",
      "Research & Academic",
      "Community & NGO",
      "Professional/Individual",
    ],
  },
  {
    key: "business",
    label: "Business & Entrepreneurship",
    preferences: [
      "Startup Opportunities",
      "Funding & Investment",
      "Tenders & Contracts",
      "Accelerators & Incubators",
    ],
  },
  {
    key: "technology",
    label: "Technology",
    preferences: [
      "AI & Data",
      "Software & Cloud",
      "Cybersecurity",
      "Digital Innovation",
    ],
  },
  {
    key: "internships",
    label: "Internships & Fellowships",
    preferences: [
      "Internships",
      "Fellowships",
      "Graduate Programs",
      "Apprenticeships",
    ],
  },
  {
    key: "events",
    label: "Competitions & Events",
    preferences: [
      "Competitions & Awards",
      "Conferences",
      "Hackathons & Challenges",
      "Networking Events",
    ],
  },
  {
    key: "career",
    label: "Career & Professional Development",
    preferences: [
      "Certifications & Training",
      "Career Advice",
      "Mentorship",
      "Leadership Development",
    ],
  },
  {
    key: "community",
    label: "Community & Volunteering",
    preferences: [
      "Volunteer Opportunities",
      "NGO & Social Impact",
      "Community Programs",
    ],
  },
  { key: "comedy", label: "Comedy", preferences: [] },
  { key: "communication", label: "Communication", preferences: [] },
  { key: "ai", label: "AI", preferences: [] },
];

export type Interest = { key: string; label: string; preferences: string[] };
export type FeedbackAction =
  | "open"
  | "read"
  | "save"
  | "share"
  | "more"
  | "less"
  | "dismiss";
export type TrackingStatus =
  | "Interested"
  | "Planning to Apply"
  | "In Progress"
  | "Submitted"
  | "Closed";
export type OpportunityProfile = {
  interests: string[];
  preferences: Record<string, string[]>;
  personalized: boolean;
  consent: boolean;
  notifications: {
    opportunities: boolean;
    deadlines: boolean;
    discovery: boolean;
    paused: boolean;
  };
};
export const DEFAULT_PROFILE: OpportunityProfile = {
  interests: [],
  preferences: {},
  personalized: false,
  consent: false,
  notifications: {
    opportunities: false,
    deadlines: false,
    discovery: false,
    paused: false,
  },
};

export type OpportunityContent = {
  id: string;
  title: string;
  summary: string;
  category: string;
  kind: "opportunity" | "news";
  canonicalUrl: string;
  provider: string;
  location: string;
  preferences: string[];
  details: Record<string, string>;
  deadline: string | null;
  publishedAt: string;
  trust: "official" | "verified" | "unverified";
  popularity: number;
  featured?: boolean;
  quality?: number;
  categories?: string[];
};
export type Signal = {
  opportunityId: string;
  category: string;
  action: FeedbackAction;
};
export type RankedOpportunity = OpportunityContent & {
  reason: string;
  discovery: boolean;
};

export type NotificationKind = "deadlines" | "discovery" | "opportunities";

/**
 * Who actually receives a For You notification at delivery time.
 *
 * A reader with no stored profile has never opened preferences, so there is
 * nothing to opt them out of: the deadline reminder they set is its own
 * opt-in. Digests and discovery stay opt-in through a stored profile, because
 * nothing else records their consent.
 */
export function forYouRecipients(
  candidates: string[],
  profiles: Map<string, OpportunityProfile>,
  kind: NotificationKind
): string[] {
  return candidates.filter((id) => {
    const profile = profiles.get(id);
    if (!profile) {
      return kind === "deadlines";
    }
    return (
      !profile.notifications.paused &&
      profile.notifications[kind] &&
      (kind === "deadlines" || (profile.consent && profile.personalized))
    );
  });
}

export function readProfile(value: unknown): OpportunityProfile {
  if (!value || typeof value !== "object") {
    return structuredClone(DEFAULT_PROFILE);
  }
  const v = value as Partial<OpportunityProfile>;
  return {
    interests: Array.isArray(v.interests)
      ? v.interests.filter((x): x is string => typeof x === "string")
      : [],
    preferences:
      v.preferences && typeof v.preferences === "object"
        ? Object.fromEntries(
            Object.entries(v.preferences)
              .filter(([, x]) => Array.isArray(x))
              .map(([k, x]) => [
                k,
                x.filter((s): s is string => typeof s === "string"),
              ])
          )
        : {},
    personalized: v.personalized === true,
    consent: v.consent === true,
    notifications: { ...DEFAULT_PROFILE.notifications, ...v.notifications },
  };
}
