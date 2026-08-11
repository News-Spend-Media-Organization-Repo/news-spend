import { VoltraAndroid as A } from "@use-voltra/android";
import { widgetTheme as t } from "./theme";
import { type NewsItem, newsDeepLink } from "./widget-data-fetchers";

const ACCENT = t.accentTrending;

function Eyebrow() {
  return (
    <A.Text color={ACCENT} fontSize={11} style={{ fontWeight: "600" }}>
      TRENDING
    </A.Text>
  );
}

function Empty() {
  return (
    <A.Column style={{ gap: 6, padding: 16, backgroundColor: t.surface }}>
      <Eyebrow />
      <A.Text color={t.textMuted} fontSize={14}>
        No trending stories
      </A.Text>
    </A.Column>
  );
}

export function SmallTrendingNewsAndroid({ news }: { news: NewsItem[] }) {
  const lead = news[0];
  if (!lead) {
    return <Empty />;
  }

  const remaining = news.length - 1;

  return (
    <A.Column
      deepLinkUrl={newsDeepLink(lead)}
      style={{ gap: 10, padding: 16, flex: 1, backgroundColor: t.surface }}
    >
      <Eyebrow />
      <A.Text
        color={t.textPrimary}
        fontSize={16}
        maxLines={4}
        style={{ fontWeight: "600" }}
      >
        {lead.title}
      </A.Text>
      <A.Spacer />
      <A.Text color={t.textMuted} fontSize={11}>
        {remaining > 0
          ? `${lead.category ?? "News"} · ${remaining} more`
          : (lead.category ?? "News")}
      </A.Text>
    </A.Column>
  );
}

function RankedItem({ item, rank }: { item: NewsItem; rank: number }) {
  return (
    <A.Row deepLinkUrl={newsDeepLink(item)} style={{ gap: 8 }}>
      <A.Text color={ACCENT} fontSize={12} style={{ fontWeight: "600" }}>
        {String(rank)}
      </A.Text>
      <A.Column style={{ gap: 2 }}>
        <A.Text color={t.textPrimary} fontSize={12} maxLines={2}>
          {item.title}
        </A.Text>
        {item.category ? (
          <A.Text color={t.textMuted} fontSize={11}>
            {item.category}
          </A.Text>
        ) : null}
      </A.Column>
    </A.Row>
  );
}

export function MediumTrendingNewsAndroid({ news }: { news: NewsItem[] }) {
  const lead = news[0];
  if (!lead) {
    return <Empty />;
  }

  const rest = news.slice(1, 3);

  return (
    <A.Row
      style={{ gap: 14, padding: 16, flex: 1, backgroundColor: t.surface }}
    >
      <A.Column deepLinkUrl={newsDeepLink(lead)} style={{ gap: 8, flex: 1.15 }}>
        <Eyebrow />
        <A.Text
          color={t.textPrimary}
          fontSize={15}
          maxLines={3}
          style={{ fontWeight: "600" }}
        >
          {lead.title}
        </A.Text>
        <A.Spacer />
        {lead.category ? (
          <A.Text color={t.textMuted} fontSize={11}>
            {lead.category}
          </A.Text>
        ) : null}
      </A.Column>

      <A.Box style={{ width: 1, backgroundColor: t.hairline }} />

      <A.Column style={{ gap: 12, flex: 1 }}>
        {rest.map((item, i) => (
          <RankedItem item={item} key={item.id} rank={i + 2} />
        ))}
      </A.Column>
    </A.Row>
  );
}
