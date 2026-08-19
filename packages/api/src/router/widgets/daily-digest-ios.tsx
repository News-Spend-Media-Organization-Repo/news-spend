import { Voltra as V } from "@use-voltra/ios/server";
import type { ReactNode } from "react";
import { widgetTheme as t } from "./theme";
import type { DigestData, NewsItem } from "./widget-data-fetchers";
import { newsDeepLink } from "./widget-data-fetchers";

const ACCENT = t.accentDigest;

/** Fills the widget so text sits on a known surface rather than the system container. */
function Surface({ children }: { children: ReactNode }) {
  return (
    <V.ZStack style={{ flex: 1, backgroundColor: t.surface }}>
      {children}
    </V.ZStack>
  );
}

/**
 * The greeting doubles as the eyebrow. It keeps the brand voice while freeing
 * the line the date used to occupy, since the date is already in the status bar.
 */
function Eyebrow({ greeting }: { greeting: string }) {
  return (
    <V.Text style={{ fontSize: 11, fontWeight: "600", color: ACCENT }}>
      {greeting.toUpperCase()}
    </V.Text>
  );
}

function Empty({ greeting }: { greeting: string }) {
  return (
    <Surface>
      <V.VStack spacing={6} style={{ padding: 16 }}>
        <Eyebrow greeting={greeting} />
        <V.Text style={{ fontSize: 14, color: t.textMuted }}>
          Nothing new yet
        </V.Text>
      </V.VStack>
    </Surface>
  );
}

function SmallDailyDigest({ digest }: { digest: DigestData }) {
  const lead = digest.stories[0];
  if (!lead) {
    return <Empty greeting={digest.greeting} />;
  }

  const remaining = digest.stories.length - 1;

  return (
    <Surface>
      <V.Link destination={newsDeepLink(lead)}>
        <V.VStack spacing={10} style={{ padding: 16, flex: 1 }}>
          <Eyebrow greeting={digest.greeting} />
          <V.Text
            numberOfLines={4}
            style={{ fontSize: 16, fontWeight: "600", color: t.textPrimary }}
          >
            {lead.title}
          </V.Text>
          <V.Spacer />
          {remaining > 0 ? (
            <V.Text style={{ fontSize: 11, color: t.textMuted }}>
              {`+ ${remaining} more today`}
            </V.Text>
          ) : null}
        </V.VStack>
      </V.Link>
    </Surface>
  );
}

function SecondaryItem({ item }: { item: NewsItem }) {
  return (
    <V.Link destination={newsDeepLink(item)}>
      {/* Single line by design: a clean ellipsis reads better than two ragged
          clamped lines, and buys the lead story room to breathe. */}
      <V.Text
        numberOfLines={1}
        style={{ fontSize: 13, color: t.textSecondary }}
      >
        {item.title}
      </V.Text>
    </V.Link>
  );
}

function MediumDailyDigest({ digest }: { digest: DigestData }) {
  const lead = digest.stories[0];
  if (!lead) {
    return <Empty greeting={digest.greeting} />;
  }

  const rest = digest.stories.slice(1, 3);

  return (
    <Surface>
      <V.VStack spacing={10} style={{ padding: 16, flex: 1 }}>
        {/* An explicit Spacer, not justifyContent. These map to SwiftUI HStacks,
            where space-between does not separate the children. */}
        <V.HStack style={{ alignItems: "center" }}>
          <Eyebrow greeting={digest.greeting} />
          <V.Spacer />
          {/* "What did I miss" is the digest's whole job, and the count answers it
              before any headline is read. */}
          <V.Text style={{ fontSize: 11, color: t.textMuted }}>
            {`${digest.stories.length} new`}
          </V.Text>
        </V.HStack>

        <V.Link destination={newsDeepLink(lead)}>
          <V.Text
            numberOfLines={2}
            style={{ fontSize: 16, fontWeight: "600", color: t.textPrimary }}
          >
            {lead.title}
          </V.Text>
        </V.Link>

        {rest.length > 0 ? (
          <V.Divider style={{ backgroundColor: t.hairline }} />
        ) : null}

        <V.VStack spacing={8}>
          {rest.map((item) => (
            <SecondaryItem item={item} key={item.id} />
          ))}
        </V.VStack>
        <V.Spacer />
      </V.VStack>
    </Surface>
  );
}

export function DailyDigestIOS({
  digest,
  family,
}: {
  digest: DigestData;
  family?: string;
}) {
  if (family === "systemMedium") {
    return <MediumDailyDigest digest={digest} />;
  }
  return <SmallDailyDigest digest={digest} />;
}
