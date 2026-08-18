import { VoltraAndroid as A } from "@use-voltra/android";
import { widgetTheme as t } from "./theme";
import type { DigestData, NewsItem } from "./widget-data-fetchers";
import { newsDeepLink } from "./widget-data-fetchers";

const ACCENT = t.accentDigest;

/** Android has no Divider primitive — a hairline Box stands in. */
function Hairline() {
  return <A.Box style={{ height: 1, backgroundColor: t.hairline }} />;
}

function Eyebrow({ greeting }: { greeting: string }) {
  return (
    <A.Text color={ACCENT} fontSize={11} style={{ fontWeight: "600" }}>
      {greeting.toUpperCase()}
    </A.Text>
  );
}

export function SmallDailyDigestAndroid({ digest }: { digest: DigestData }) {
  const lead = digest.stories[0];
  const remaining = digest.stories.length - 1;

  return (
    <A.Column
      style={{ gap: 10, padding: 16, flex: 1, backgroundColor: t.surface }}
    >
      <Eyebrow greeting={digest.greeting} />
      {lead ? (
        <A.Column deepLinkUrl={newsDeepLink(lead)} style={{ gap: 10, flex: 1 }}>
          <A.Text
            color={t.textPrimary}
            fontSize={16}
            maxLines={4}
            style={{ fontWeight: "600" }}
          >
            {lead.title}
          </A.Text>
          <A.Spacer />
          {remaining > 0 ? (
            <A.Text color={t.textMuted} fontSize={11}>
              {`+ ${remaining} more today`}
            </A.Text>
          ) : null}
        </A.Column>
      ) : (
        <A.Text color={t.textMuted} fontSize={14}>
          Nothing new yet
        </A.Text>
      )}
    </A.Column>
  );
}

function SecondaryItem({ item }: { item: NewsItem }) {
  return (
    <A.Text
      color={t.textSecondary}
      deepLinkUrl={newsDeepLink(item)}
      fontSize={13}
      maxLines={1}
    >
      {item.title}
    </A.Text>
  );
}

export function MediumDailyDigestAndroid({ digest }: { digest: DigestData }) {
  const lead = digest.stories[0];
  const rest = digest.stories.slice(1, 3);

  if (!lead) {
    return (
      <A.Column style={{ gap: 6, padding: 16, backgroundColor: t.surface }}>
        <Eyebrow greeting={digest.greeting} />
        <A.Text color={t.textMuted} fontSize={14}>
          Nothing new yet
        </A.Text>
      </A.Column>
    );
  }

  return (
    <A.Column
      style={{ gap: 10, padding: 16, flex: 1, backgroundColor: t.surface }}
    >
      <A.Row style={{ alignItems: "center" }}>
        <Eyebrow greeting={digest.greeting} />
        <A.Spacer />
        <A.Text color={t.textMuted} fontSize={11}>
          {`${digest.stories.length} new`}
        </A.Text>
      </A.Row>

      <A.Text
        color={t.textPrimary}
        deepLinkUrl={newsDeepLink(lead)}
        fontSize={16}
        maxLines={2}
        style={{ fontWeight: "600" }}
      >
        {lead.title}
      </A.Text>

      {rest.length > 0 ? <Hairline /> : null}

      <A.Column style={{ gap: 8 }}>
        {rest.map((item) => (
          <SecondaryItem item={item} key={item.id} />
        ))}
      </A.Column>
    </A.Column>
  );
}
