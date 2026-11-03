"use client";

import { NOTIFICATION_DESTINATIONS } from "@news-spend-media/utils/appRoutes";
import {
  FieldLabel,
  ReactSelect,
  type ReactSelectOption,
  useField,
} from "@payloadcms/ui";
import type { JSONFieldClientComponent } from "payload";
import { useEffect, useMemo, useState } from "react";

import {
  parseNotificationDestination,
  withArticleDestination,
  withScreenDestination,
  withWebDestination,
} from "../../lib/notification-link";

type Article = { id: string; title: string; slug: string };
type Target = "article" | "screen" | "web";

const TARGETS: ReactSelectOption[] = [
  { label: "A news article", value: "article" },
  { label: "A screen in the app", value: "screen" },
  { label: "A web page", value: "web" },
];

const SCREEN_OPTIONS: ReactSelectOption[] = NOTIFICATION_DESTINATIONS.map(
  (screen) => ({
    label: screen.label,
    value: screen.value,
  })
);

const pick = (option: ReactSelectOption | ReactSelectOption[] | null) =>
  Array.isArray(option) ? option[0] : option;

/**
 * Destination picker for a push campaign.
 *
 * The stored value is still the `data` JSON the app routes by, but an operator
 * picks "article" (searchable, labelled by headline) or a named screen instead
 * of typing `{"url": ...}` and hoping. System-created notifications (comment
 * replies, giveaway wins) carry links this picker does not model; those are
 * left untouched and shown read-only unless the operator replaces them.
 */
export const NotificationDestinationField: JSONFieldClientComponent = ({
  path,
  field,
}) => {
  const { value, setValue, showError, errorMessage } = useField<
    Record<string, unknown> | null | undefined
  >({ path });

  const data = useMemo(
    () =>
      value && typeof value === "object" && !Array.isArray(value) ? value : {},
    [value]
  );
  const destination = useMemo(() => parseNotificationDestination(data), [data]);
  const destinationTarget = destination?.target;
  const articleId =
    destination?.target === "article" ? destination.articleId : undefined;
  const articleSlug =
    destination?.target === "article" ? destination.articleSlug : undefined;

  const [target, setTarget] = useState<Target>(destinationTarget ?? "article");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pinned, setPinned] = useState<Article | null>(null);
  const [webUrl, setWebUrl] = useState(
    destination?.target === "web" ? (destination.url ?? "") : ""
  );

  // Follow the stored value when it changes outside the picker (form reset).
  useEffect(() => {
    if (destinationTarget) {
      setTarget(destinationTarget);
    }
  }, [destinationTarget]);

  const destinationWebUrl =
    destination?.target === "web" ? destination.url : undefined;

  useEffect(() => {
    if (destinationWebUrl !== undefined) {
      setWebUrl(destinationWebUrl);
    }
  }, [destinationWebUrl]);

  // Search the article archive. Debounced; the first page is the latest.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setFailed(false);

      const params = new URLSearchParams({
        depth: "0",
        limit: "20",
        sort: "-publishedAt",
        "where[_status][equals]": "published",
      });
      if (search.trim()) {
        params.set("where[title][like]", search.trim());
      }

      try {
        const response = await fetch(`/api/news?${params}`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const body = (await response.json()) as { docs: Article[] };
        setResults(body.docs);
      } catch {
        if (!controller.signal.aborted) {
          setFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  // The selected article may not be in the current search page.
  useEffect(() => {
    if (!(articleId || articleSlug)) {
      setPinned(null);
      return;
    }

    const controller = new AbortController();
    const url = articleId
      ? `/api/news/${encodeURIComponent(articleId)}?depth=0`
      : `/api/news?depth=0&limit=1&where[slug][equals]=${encodeURIComponent(
          articleSlug ?? ""
        )}`;

    fetch(url, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as {
          doc?: Article;
          docs?: Article[];
        };
        const article = body.doc ?? body.docs?.[0];
        if (article) {
          setPinned(article);
        }
      })
      .catch(() => {
        // The picker still renders; the stored id is kept either way.
      });

    return () => controller.abort();
  }, [articleId, articleSlug]);

  const articles = useMemo(() => {
    const byId = new Map<string, Article>();
    if (pinned) {
      byId.set(pinned.id, pinned);
    }
    for (const article of results) {
      byId.set(article.id, article);
    }
    return [...byId.values()];
  }, [pinned, results]);

  const articleOptions: ReactSelectOption[] = articles.map((article) => ({
    label: article.title,
    value: article.id,
  }));

  const selectedArticleId = articleId ?? pinned?.id;

  const note =
    destination === undefined && typeof data.url === "string"
      ? `This notification currently opens “${data.url}”. Choosing a destination above replaces it.`
      : null;

  return (
    <div className="field-type">
      <FieldLabel label={field.label} path={path} required={field.required} />

      {typeof field.admin?.description === "string" && (
        <p className="field-description" style={{ marginBottom: 8 }}>
          {field.admin.description}
        </p>
      )}

      <ReactSelect
        onChange={(option) => {
          const picked = pick(option);
          if (picked) {
            setTarget(picked.value as Target);
          }
        }}
        options={TARGETS}
        value={TARGETS.find((option) => option.value === target)}
      />

      {target === "article" ? (
        <div style={{ marginTop: 12 }}>
          <ReactSelect
            isLoading={loading}
            isSearchable
            onChange={(option) => {
              const picked = pick(option);
              const article = articles.find(
                (candidate) => candidate.id === picked?.value
              );
              if (article) {
                setValue(withArticleDestination(data, article));
                setPinned(article);
              }
            }}
            onInputChange={(input) => setSearch(input)}
            options={articleOptions}
            placeholder="Search published articles by title"
            value={articleOptions.find(
              (option) => option.value === selectedArticleId
            )}
          />
          {failed && (
            <div className="field-error" style={{ marginTop: 8 }}>
              Could not load articles. Reload the page and try again.
            </div>
          )}
        </div>
      ) : target === "screen" ? (
        <div style={{ marginTop: 12 }}>
          <ReactSelect
            isSearchable
            onChange={(option) => {
              const picked = pick(option);
              if (picked) {
                setValue(withScreenDestination(data, String(picked.value)));
              }
            }}
            options={SCREEN_OPTIONS}
            placeholder="Choose a screen"
            value={
              destination?.target === "screen"
                ? SCREEN_OPTIONS.find(
                    (screen) => screen.value === destination.screen
                  )
                : undefined
            }
          />
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <input
            onChange={(event) => {
              setWebUrl(event.target.value);
              setValue(withWebDestination(data, event.target.value));
            }}
            placeholder="https://example.com/page"
            style={{
              border: "1px solid var(--theme-elevation-150)",
              borderRadius: 4,
              padding: "8px 12px",
              width: "100%",
            }}
            type="url"
            value={webUrl}
          />
          <p className="field-description" style={{ marginTop: 8 }}>
            Opens in the app&apos;s browser. Use a full http:// or https://
            address.
          </p>
        </div>
      )}

      {note && (
        <p className="field-description" style={{ marginTop: 8 }}>
          {note}
        </p>
      )}

      {showError && errorMessage && (
        <div className="field-error" style={{ marginTop: 8 }}>
          {errorMessage}
        </div>
      )}
    </div>
  );
};

export default NotificationDestinationField;
