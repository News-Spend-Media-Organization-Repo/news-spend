import { Voltra as V } from "@use-voltra/ios/server";
import type { ReactNode } from "react";
import { widgetTheme as t } from "./theme";
import { type NewsItem, newsDeepLink } from "./widget-data-fetchers";

const ACCENT = t.accentTrending;

/** Fills the widget so text sits on a known surface rather than the system container. */
function Surface({ children }: { children: ReactNode }) {
  return (
    <V.ZStack style={{ flex: 1, backgroundColor: t.surface }}>
      {children}
    </V.ZStack>
  );
}

function Eyebrow() {
  return (
    <V.Text style={{ fontSize: 11, fontWeight: "600", color: ACCENT }}>
      TRENDING
    </V.Text>
  );
}

function Empty() {
  return (
    <Surface>
      <V.VStack spacing={6} style={{ padding: 16 }}>
        <Eyebrow />
        <V.Text style={{ fontSize: 14, color: t.textMuted }}>
          No trending stories
        </V.Text>
      </V.VStack>
    </Surface>
  );
}

function SmallTrendingNews({ news }: { news: NewsItem[] }) {
  const lead = news[0];
  if (!lead) {
    return <Empty />;
  }

  const remaining = news.length - 1;

  return (
    <Surface>
      <V.Link destination={newsDeepLink(lead)}>
        <V.VStack spacing={10} style={{ padding: 16, flex: 1 }}>
          <Eyebrow />
          {/* The lead gets every line the small family can spare: the date and
              greeting chrome that used to sit here said nothing the status bar
              didn't already. */}
          <V.Text
            numberOfLines={4}
            style={{ fontSize: 16, fontWeight: "600", color: t.textPrimary }}
          >
            {lead.title}
          </V.Text>
          <V.Spacer />
          <V.Text style={{ fontSize: 11, color: t.textMuted }}>
            {remaining > 0
              ? `${lead.category ?? "News"} · ${remaining} more`
              : (lead.category ?? "News")}
          </V.Text>
        </V.VStack>
      </V.Link>
    </Surface>
  );
}

function RankedItem({ item, rank }: { item: NewsItem; rank: number }) {
  return (
    <V.Link destination={newsDeepLink(item)}>
      <V.HStack spacing={8} style={{ alignItems: "flex-start" }}>
        <V.Text style={{ fontSize: 12, fontWeight: "600", color: ACCENT }}>
          {String(rank)}
        </V.Text>
        <V.VStack spacing={2}>
          <V.Text
            numberOfLines={2}
            style={{ fontSize: 12, color: t.textPrimary }}
          >
            {item.title}
          </V.Text>
          {item.category ? (
            <V.Text style={{ fontSize: 11, color: t.textMuted }}>
              {item.category}
            </V.Text>
          ) : null}
        </V.VStack>
      </V.HStack>
    </V.Link>
  );
}

function MediumTrendingNews({ news }: { news: NewsItem[] }) {
  const lead = news[0];
  if (!lead) {
    return <Empty />;
  }

  const rest = news.slice(1, 3);

  return (
    <Surface>
      {/* Rank is the only thing that distinguishes this from the digest, so the
          layout leads with it: a hero plus a numbered runner-up column, rather
          than three rows of equal weight all clamped mid-word. */}
      <V.HStack spacing={14} style={{ padding: 16, flex: 1 }}>
        <V.Link destination={newsDeepLink(lead)}>
          <V.VStack spacing={8} style={{ flex: 1.15 }}>
            <Eyebrow />
            <V.Text
              numberOfLines={3}
              style={{ fontSize: 15, fontWeight: "600", color: t.textPrimary }}
            >
              {lead.title}
            </V.Text>
            <V.Spacer />
            {lead.category ? (
              <V.Text style={{ fontSize: 11, color: t.textMuted }}>
                {lead.category}
              </V.Text>
            ) : null}
          </V.VStack>
        </V.Link>

        <V.Divider style={{ backgroundColor: t.hairline }} />

        <V.VStack spacing={12} style={{ flex: 1, justifyContent: "center" }}>
          {rest.map((item, i) => (
            <RankedItem item={item} key={item.id} rank={i + 2} />
          ))}
        </V.VStack>
      </V.HStack>
    </Surface>
  );
}

export function TrendingNewsIOS({
  news,
  family,
}: {
  news: NewsItem[];
  family?: string;
}) {
  if (family === "systemMedium") {
    return <MediumTrendingNews news={news} />;
  }
  return <SmallTrendingNews news={news} />;
}
