import type {
  OpportunityProfile,
  TrackingStatus,
} from "@news-spend-media/payload/opportunities/model";
import type { StaticScreenProps } from "@react-navigation/native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  Share,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSnapshot } from "valtio";
import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import {
  ArrowLeftIcon,
  BellIcon,
  BookmarkSimpleIcon,
  CaretRightIcon,
  ChartLineIcon,
  DotsThreeIcon,
  EyeSlashIcon,
  FlagIcon,
  type Icon as IconComponent,
  MinusCircleIcon,
  PencilSimpleLineIcon,
  SealQuestionIcon,
  ShareNetworkIcon,
  TargetIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "#/lib/icons";
import type { RouterOutputs } from "#/lib/orpc";
import { client, orpc } from "#/lib/orpc";
import { authState } from "#/state/auth";
import { useTabBarHeight } from "#/state/route-state";

type Page =
  | "feed"
  | "intro"
  | "interests"
  | "refine"
  | "saved"
  | "dna"
  | "preferences"
  | "notifications"
  | "tracking"
  | "insights"
  | "guidance"
  | "detail";
type Item = RouterOutputs["forYou"]["feed"]["items"][number];
type Menu = {
  item: Item;
  kind: "feedback" | "report" | "reminder" | "source" | "tracking";
} | null;
const REPORT_REASONS = [
  "Expired opportunity",
  "Incorrect information",
  "Suspicious or misleading content",
  "Broken link",
  "Duplicate content",
  "Other",
] as const;
const STATUSES: TrackingStatus[] = [
  "Interested",
  "Planning to Apply",
  "In Progress",
  "Submitted",
  "Closed",
];
const LABELS: Partial<Record<Page, string>> = {
  saved: "Saved Opportunities",
  dna: "Your Opportunity DNA",
  preferences: "For You Preferences",
  notifications: "Notification Preferences",
  tracking: "Application Dashboard",
  interests: "Your Interests",
  refine: "Refine Your Interests",
  insights: "Your Insights",
  guidance: "Opportunity Guidance",
};

function Action({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      accessibilityLabel={label}
      isDisabled={disabled}
      onPress={onPress}
      size="sm"
    >
      <Button.Label>{label}</Button.Label>
    </Button>
  );
}
function MenuRow({
  icon,
  label,
  onPress,
  disabled = false,
  destructive = false,
}: {
  icon?: IconComponent;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-p-500/10 disabled:opacity-50"
      disabled={disabled}
      onPress={onPress}
    >
      {icon ? (
        <Icon
          className={destructive ? "text-danger" : "text-p-500"}
          name={icon}
          size={22}
          weight="bold"
        />
      ) : null}
      <Text
        className={`flex-1 text-base ${destructive ? "text-danger" : "text-foreground"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function Shortcut({
  icon,
  label,
  onPress,
}: {
  icon: IconComponent;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="w-32 gap-2 rounded-xl border border-separator bg-surface p-3 active:opacity-70"
      onPress={onPress}
    >
      <Icon className="text-p-500" name={icon} size={22} weight="bold" />
      <Text className="font-semibold text-sm leading-tight" numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between gap-4 py-3">
      <Text className="flex-1">{label}</Text>
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        value={value}
      />
    </View>
  );
}

export default function ForYouScreen() {
  return <ForYouExperience />;
}
export function ForYouPreferencesScreen() {
  return <ForYouExperience initialPage="preferences" />;
}
export function OpportunityScreen({
  route,
}: StaticScreenProps<{ id: string }>) {
  return <ForYouExperience initialId={route.params.id} initialPage="detail" />;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This established screen composes the app's existing For You workflows in one navigation surface.
function ForYouExperience({
  initialPage = "feed",
  initialId,
}: {
  initialPage?: Page;
  initialId?: string;
}) {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { user } = useSnapshot(authState);
  const guest = !user || user.isAnonymous === true;
  const isFocused = useIsFocused();
  const tabHeight = useTabBarHeight();
  const [page, setPage] = useState<Page>(initialPage);
  const [selectedId, setSelectedId] = useState(initialId ?? "");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [searchText, setSearchText] = useState("");
  const [draft, setDraft] = useState<OpportunityProfile | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  // The last menu shown, so the sheet keeps its content while it animates
  // closed after `menu` is cleared.
  // (React's "store information from previous renders" pattern; a ref
  // written during render would break the React Compiler's rules.)
  const [shownMenu, setShownMenu] = useState<Menu>(null);
  if (menu && menu !== shownMenu) {
    setShownMenu(menu);
  }
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [nextOffset, setNextOffset] = useState<number | null | undefined>(
    undefined
  );
  const [extraItems, setExtraItems] = useState<Item[]>([]);
  const [goals, setGoals] = useState("");
  const [guidanceResult, setGuidanceResult] = useState<{
    answer: string;
    suggestions: RouterOutputs["forYou"]["guidance"]["suggestions"];
    disclaimer: string;
  } | null>(null);
  const readSignalsSent = useRef(new Set<string>());
  const key = ["for-you", user?.id ?? "guest"];
  const catalog = useQuery({
    queryKey: [...key, "catalog"],
    queryFn: () => client.forYou.catalog(),
  });
  const profile = useQuery({
    queryKey: [...key, "profile"],
    queryFn: () => client.forYou.profile(),
    enabled: !guest,
  });
  const feed = useQuery({
    queryKey: [...key, "feed", category, search],
    queryFn: () =>
      client.forYou.feed({
        category: category || undefined,
        query: search,
        offset: 0,
        limit: 20,
      }),
  });
  const saves = useQuery({
    queryKey: [...key, "saves"],
    queryFn: () => client.forYou.saves(),
    enabled: !guest,
  });
  const detail = useQuery({
    queryKey: [...key, "detail", selectedId],
    queryFn: () => client.forYou.detail({ id: selectedId }),
    enabled: Boolean(selectedId) && page === "detail",
  });
  const insights = useQuery({
    ...orpc.forYou.insights.queryOptions(),
    enabled: !guest && page === "insights",
  });
  const guidanceMutation = useMutation(orpc.forYou.guidance.mutationOptions());
  const currentProfile = draft ?? profile.data;
  const savedIds = new Set(saves.data?.map((item) => item.id) ?? []);
  const label = (value: string) =>
    catalog.data?.find((item) => item.key === value)?.label ?? value;
  const nextPageOffset =
    nextOffset === undefined ? feed.data?.nextOffset : nextOffset;

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (menu) {
          setMenu(null);
          return true;
        }
        if (page !== "feed") {
          setPage("feed");
          return true;
        }
        return false;
      }
    );
    return () => subscription.remove();
  }, [page, menu]);

  useEffect(() => {
    const content = detail.data;
    if (
      !content ||
      page !== "detail" ||
      !isFocused ||
      guest ||
      !profile.data?.consent ||
      !profile.data.personalized ||
      readSignalsSent.current.has(content.id)
    ) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startTimer = () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        readSignalsSent.current.add(content.id);
        client.forYou
          .feedback({
            id: content.id,
            action: "read",
            eventId: Crypto.randomUUID(),
          })
          .catch(() => undefined);
      }, 15_000);
    };
    const stopTimer = () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = undefined;
    };
    if (AppState.currentState === "active") {
      startTimer();
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        startTimer();
      } else {
        stopTimer();
      }
    });
    return () => {
      stopTimer();
      subscription.remove();
    };
  }, [
    detail.data,
    guest,
    isFocused,
    page,
    profile.data?.consent,
    profile.data?.personalized,
  ]);

  function requireAccount(): boolean {
    if (!guest) {
      return true;
    }
    navigation.navigate("SignIn", { redirect: true });
    return false;
  }
  async function run(work: () => Promise<unknown>, message = "") {
    if (busy) {
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await work();
      setExtraItems([]);
      setNextOffset(undefined);
      await queryClient.invalidateQueries({ queryKey: key });
      if (message) {
        setNotice(message);
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }
  async function signal(
    item: Pick<Item, "id">,
    action: "open" | "read" | "save" | "share" | "more" | "less" | "dismiss"
  ) {
    if (!guest && profile.data?.personalized && profile.data.consent) {
      await client.forYou.feedback({
        id: item.id,
        action,
        eventId: Crypto.randomUUID(),
      });
    }
  }
  function editInterests() {
    if (requireAccount() && profile.data) {
      setDraft({
        ...profile.data,
        interests: [...profile.data.interests],
        preferences: { ...profile.data.preferences },
      });
      setPage("interests");
    }
  }
  async function persistDraft(skipRefinement = false) {
    if (!currentProfile) {
      return;
    }
    await run(async () => {
      await client.forYou.updateProfile({
        ...currentProfile,
        preferences: skipRefinement ? {} : currentProfile.preferences,
      });
      setDraft(null);
      setPage("feed");
    }, "Your preferences have been saved.");
  }
  function openItem(item: Item) {
    setSelectedId(item.id);
    setAnswer("");
    setQuestion("");
    setPage("detail");
    run(() => signal(item, "open"));
  }
  function openOpportunity(id: string) {
    setSelectedId(id);
    setAnswer("");
    setQuestion("");
    setPage("detail");
    signal({ id }, "open").catch(() => undefined);
  }
  function toggleSave(item: Pick<Item, "id">) {
    if (!requireAccount()) {
      return;
    }
    run(
      async () => {
        const saving = !savedIds.has(item.id);
        await client.forYou.save({ id: item.id, saved: saving });
        if (saving) {
          await signal(item, "save");
        }
      },
      savedIds.has(item.id) ? "Removed from Saved Opportunities" : "Saved"
    );
  }
  function updateToggle(field: "personalized" | "consent", value: boolean) {
    if (!(profile.data && requireAccount())) {
      return;
    }
    run(
      () =>
        client.forYou.updateProfile({
          ...profile.data,
          [field]: value,
          ...(field === "consent" && !value ? { personalized: false } : {}),
          ...(field === "personalized" && value ? { consent: true } : {}),
        }),
      "Personalization preferences updated"
    );
  }
  function updateNotification(
    field: keyof OpportunityProfile["notifications"],
    value: boolean
  ) {
    if (!profile.data) {
      return;
    }
    run(
      () =>
        client.forYou.updateProfile({
          ...profile.data,
          notifications: { ...profile.data.notifications, [field]: value },
        }),
      "Notification preferences updated"
    );
  }
  function card(item: Item) {
    return (
      <View
        className="gap-3 rounded-2xl border border-separator bg-surface p-4"
        key={item.id}
      >
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-muted text-sm">
            {label(item.category)} ·{" "}
            {item.kind === "news" ? "News" : "Opportunity"}
          </Text>
          <Pressable
            accessibilityLabel={`Options for ${item.title}`}
            accessibilityRole="button"
            className="-my-2 -mr-2 size-11 items-center justify-center rounded-full active:bg-p-500/10"
            onPress={() => setMenu({ item, kind: "feedback" })}
          >
            <Icon
              className="text-muted"
              name={DotsThreeIcon}
              size={22}
              weight="bold"
            />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={() => openItem(item)}>
          <Text className="font-bold text-lg">{item.title}</Text>
        </Pressable>
        <Text className="text-muted">
          {item.provider}
          {item.location ? ` · ${item.location}` : ""}
        </Text>
        <Text numberOfLines={3}>{item.summary}</Text>
        {item.deadline ? (
          <Text className="text-sm">
            {Date.parse(item.deadline) <= Date.now()
              ? "Deadline Passed"
              : `Deadline: ${new Date(item.deadline).toLocaleDateString()}`}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => setNotice(item.reason)}
        >
          <Text className="text-muted text-sm">
            Why you're seeing this · {item.reason}
          </Text>
        </Pressable>
        {/* One primary path (open) as a quiet text action; save and share are
        secondary, so they sit as icon buttons in the app's navy, the way the
        news action bar does it. Three filled buttons per card made every card
        shout and every action equal. */}
        <View className="flex-row items-center justify-between border-separator border-t pt-2">
          <Pressable
            accessibilityRole="button"
            className="min-h-11 flex-row items-center gap-1 active:opacity-60"
            disabled={busy}
            onPress={() => openItem(item)}
          >
            <Text className="font-semibold text-p-500">
              {item.kind === "news" ? "Read more" : "View opportunity"}
            </Text>
            <Icon className="text-p-500" name={CaretRightIcon} size={16} />
          </Pressable>
          <View className="flex-row items-center">
            <Pressable
              accessibilityLabel={
                savedIds.has(item.id)
                  ? `Unsave ${item.title}`
                  : `Save ${item.title}`
              }
              accessibilityRole="button"
              accessibilityState={{
                selected: savedIds.has(item.id),
                disabled: busy,
              }}
              className="size-11 items-center justify-center rounded-full active:bg-p-500/10"
              disabled={busy}
              onPress={() => toggleSave(item)}
            >
              <Icon
                className="text-p-500"
                name={BookmarkSimpleIcon}
                size={22}
                weight={savedIds.has(item.id) ? "fill" : "bold"}
              />
            </Pressable>
            <Pressable
              accessibilityLabel={`Share ${item.title}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              className="size-11 items-center justify-center rounded-full active:bg-p-500/10"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  const response = await Share.share({
                    title: item.title,
                    message: `${item.title}\nhttps://link.newsspend.com/for-you/opportunity/${item.id}`,
                  });
                  if (response.action === Share.sharedAction) {
                    await signal(item, "share");
                  }
                })
              }
            >
              <Icon className="text-p-500" name={ShareNetworkIcon} size={22} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const items = [...(feed.data?.items ?? []), ...extraItems];
  const firstVisit =
    !guest && profile.isSuccess && profile.data.interests.length === 0;
  const loading = catalog.isPending || (!guest && profile.isPending);
  const failed =
    catalog.error ??
    profile.error ??
    (page === "feed" ? feed.error : page === "detail" ? detail.error : null);
  const content = detail.data;
  return (
    <Screen statusBarStyle="light">
      <View className="flex-row items-center justify-between gap-2 bg-p-500 px-4 py-2 pt-safe-offset-1">
        <Pressable
          accessibilityLabel={
            page === "feed" ? "Refresh For You" : "Back to For You"
          }
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => {
            if (page === "feed") {
              queryClient.invalidateQueries({ queryKey: key });
            } else {
              setPage("feed");
              setDraft(null);
            }
          }}
        >
          <View className="flex-row items-center gap-2">
            {page === "feed" ? null : (
              <Icon color="white" name={ArrowLeftIcon} size={24} />
            )}
            <Text className="font-bold text-lg text-white">For You</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel="For You preferences"
          accessibilityRole="button"
          onPress={() => {
            if (requireAccount()) {
              setPage("preferences");
            }
          }}
        >
          <Text className="text-white">Preferences</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: tabHeight + 100,
          gap: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {busy || loading ? (
          <ActivityIndicator accessibilityLabel="Loading For You" />
        ) : null}
        {notice ? (
          <Pressable accessibilityRole="button" onPress={() => setNotice("")}>
            <Text
              accessibilityLiveRegion="polite"
              className="rounded-xl bg-surface p-3"
            >
              {notice}
            </Text>
          </Pressable>
        ) : null}
        {failed ? (
          <View className="gap-3">
            <Text>
              We couldn't load For You. Check your connection and try again.
            </Text>
            <Action
              label="Retry"
              onPress={() => queryClient.invalidateQueries({ queryKey: key })}
            />
          </View>
        ) : null}
        {LABELS[page] ? (
          <Text className="font-bold text-2xl">{LABELS[page]}</Text>
        ) : null}

        {(page === "intro" || (page === "feed" && firstVisit)) &&
        currentProfile ? (
          <View className="gap-4 rounded-2xl bg-surface p-5">
            <Text className="font-bold text-2xl">
              What are you interested in?
            </Text>
            <Text>
              Choose what matters to you and we'll personalize your For You
              feed.
            </Text>
            <Text>
              Discover opportunities, news and useful information from trusted
              sources.
            </Text>
            <Action label="Choose Interests" onPress={editInterests} />
          </View>
        ) : null}

        {page === "interests" && currentProfile ? (
          <>
            <Text>
              Choose what matters to you. You can change these at any time.
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {catalog.data?.map((interest) => {
                const selected = currentProfile.interests.includes(
                  interest.key
                );
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    className={`rounded-xl border p-3 ${selected ? "border-p-500 bg-p-500" : "border-separator bg-surface"}`}
                    key={interest.key}
                    onPress={() => {
                      const interests = selected
                        ? currentProfile.interests.filter(
                            (i) => i !== interest.key
                          )
                        : [...currentProfile.interests, interest.key];
                      setDraft({
                        ...currentProfile,
                        interests,
                        preferences: Object.fromEntries(
                          Object.entries(currentProfile.preferences).filter(
                            ([k]) => interests.includes(k)
                          )
                        ),
                      });
                    }}
                  >
                    <Text className={selected ? "text-white" : ""}>
                      {selected ? "✓ " : ""}
                      {interest.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Toggle
              label="Allow NewsSpend to learn from my activity"
              onChange={(consent) =>
                setDraft({ ...currentProfile, consent, personalized: consent })
              }
              value={currentProfile.consent}
            />
            <Text className="text-muted text-sm">
              Optional. Without consent, you can still browse latest and
              trending content. No behavioural personalization is recorded.
            </Text>
            <Action
              disabled={busy || currentProfile.interests.length === 0}
              label="Continue"
              onPress={() => setPage("refine")}
            />
          </>
        ) : null}

        {page === "refine" && currentProfile ? (
          <>
            <Text>
              Optional preferences help us find more relevant content.
            </Text>
            {catalog.data
              ?.filter(
                (i) =>
                  currentProfile.interests.includes(i.key) &&
                  i.preferences.length
              )
              .map((interest) => (
                <View className="gap-3" key={interest.key}>
                  <Text className="font-bold text-lg">{interest.label}</Text>
                  <Text>
                    {interest.key === "immigration"
                      ? "Which destinations interest you?"
                      : interest.key === "jobs"
                        ? "Choose up to 3 areas"
                        : "What interests you most?"}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {interest.preferences.map((preference) => {
                      const values =
                        currentProfile.preferences[interest.key] ?? [];
                      const selected = values.includes(preference);
                      return (
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          className={`rounded-full border px-3 py-2 ${selected ? "border-p-500 bg-p-500" : "border-separator"}`}
                          key={preference}
                          onPress={() => {
                            if (
                              !selected &&
                              interest.key === "jobs" &&
                              values.length >= 3
                            ) {
                              setNotice("Choose up to 3 job areas.");
                              return;
                            }
                            setDraft({
                              ...currentProfile,
                              preferences: {
                                ...currentProfile.preferences,
                                [interest.key]: selected
                                  ? values.filter((p) => p !== preference)
                                  : [...values, preference],
                              },
                            });
                          }}
                        >
                          <Text className={selected ? "text-white" : ""}>
                            {preference}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            <Action
              disabled={busy}
              label="Continue"
              onPress={() => persistDraft()}
            />
            <Action
              disabled={busy}
              label="Skip Refinement"
              onPress={() => persistDraft(true)}
            />
          </>
        ) : null}

        {page === "feed" ? (
          <>
            <Text className="text-muted">
              {feed.data?.personalized
                ? "Picked for you based on your interests"
                : "Latest and trending opportunities"}
            </Text>
            {guest ? (
              <View className="gap-3 rounded-xl bg-surface p-4">
                <Text className="font-bold text-xl">Make For You yours</Text>
                <Text>
                  Create an account and choose your interests to get
                  personalized opportunities.
                </Text>
                <Action
                  label="Create Account"
                  onPress={() => navigation.navigate("SignUp")}
                />
              </View>
            ) : null}
            {/* Places to go, not things to do: quiet tiles in one scrolling row,
            so the feed below stays the loudest thing on the screen. The last
            tile peeks past the edge to say the row scrolls. */}
            <ScrollView
              className="-mx-4"
              contentContainerClassName="gap-2 px-4"
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <Shortcut
                icon={BookmarkSimpleIcon}
                label="Saved Opportunities"
                onPress={() => {
                  if (requireAccount()) {
                    setPage("saved");
                  }
                }}
              />
              <Shortcut
                icon={TargetIcon}
                label="Opportunity DNA"
                onPress={() => {
                  if (requireAccount()) {
                    setPage("dna");
                  }
                }}
              />
              <Shortcut
                icon={ChartLineIcon}
                label="Your Insights"
                onPress={() => {
                  if (requireAccount()) {
                    setPage("insights");
                  }
                }}
              />
              <Shortcut
                icon={SealQuestionIcon}
                label="Opportunity Guidance"
                onPress={() => {
                  if (requireAccount()) {
                    setGuidanceResult(null);
                    setPage("guidance");
                  }
                }}
              />
              {guest ? null : (
                <Shortcut
                  icon={PencilSimpleLineIcon}
                  label="Edit Interests"
                  onPress={editInterests}
                />
              )}
            </ScrollView>
            {/* The same pill as the home search chips (SearchScreen). */}
            <ScrollView
              className="-mx-4"
              contentContainerClassName="items-center gap-2 px-4"
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {[
                { key: "", label: "All" },
                ...(catalog.data ?? []).filter(
                  (i) => guest || profile.data?.interests.includes(i.key)
                ),
              ].map((interest) => {
                const active = category === interest.key;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={
                      active
                        ? "rounded-full border border-p-500 bg-p-500 px-4 py-1.5"
                        : "rounded-full border border-gray-300 bg-white px-4 py-1.5"
                    }
                    hitSlop={{ top: 6, bottom: 6 }}
                    key={interest.key}
                    onPress={() => {
                      setCategory(interest.key);
                      setExtraItems([]);
                      setNextOffset(undefined);
                    }}
                  >
                    <Text
                      className={
                        active
                          ? "font-semibold text-sm text-white"
                          : "font-semibold text-gray-600 text-sm"
                      }
                    >
                      {interest.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View className="flex-row items-center gap-2">
              <TextInput
                accessibilityLabel="Search opportunities"
                className="min-h-12 flex-1 rounded-xl border border-separator bg-surface px-3 text-foreground"
                onChangeText={setSearchText}
                onSubmitEditing={() => {
                  setSearch(searchText.trim());
                  setExtraItems([]);
                  setNextOffset(undefined);
                }}
                placeholder="Search opportunities"
                placeholderTextColor="#808890"
                returnKeyType="search"
                value={searchText}
              />
              <Action
                label="Search"
                onPress={() => {
                  setSearch(searchText.trim());
                  setExtraItems([]);
                  setNextOffset(undefined);
                }}
              />
            </View>
            {feed.isPending ? <ActivityIndicator /> : null}
            {feed.isPending || items.length ? null : (
              <View className="gap-3 rounded-xl bg-surface p-4">
                <Text className="font-bold text-lg">
                  We're finding more for you
                </Text>
                <Text>
                  {search || category
                    ? "Try another interest or clear your search."
                    : "New opportunities will appear here when approved sources publish them."}
                </Text>
                {search || category ? (
                  <Action
                    label="Explore All"
                    onPress={() => {
                      setCategory("");
                      setSearch("");
                      setSearchText("");
                    }}
                  />
                ) : null}
              </View>
            )}
            {[
              {
                title: "Recommended for You",
                filter: (i: Item) =>
                  !(
                    i.discovery ||
                    (i.deadline &&
                      Date.parse(i.deadline) - Date.now() < 7 * 86_400_000)
                  ),
              },
              {
                title: "Closing Soon",
                filter: (i: Item) =>
                  !i.discovery &&
                  Boolean(
                    i.deadline &&
                      Date.parse(i.deadline) - Date.now() < 7 * 86_400_000
                  ),
              },
              {
                title: "Explore Something New",
                filter: (i: Item) => i.discovery,
              },
            ].map((section) => {
              const rows = items.filter(section.filter);
              return rows.length ? (
                <View className="gap-4" key={section.title}>
                  <Text className="font-bold text-xl">{section.title}</Text>
                  {rows.map(card)}
                </View>
              ) : null;
            })}
            {nextPageOffset !== null && nextPageOffset !== undefined ? (
              <Action
                disabled={busy}
                label="Load More"
                onPress={() => {
                  const requestedOffset = nextPageOffset;
                  setBusy(true);
                  queryClient
                    .fetchQuery({
                      queryKey: [
                        ...key,
                        "feed-page",
                        category,
                        search,
                        requestedOffset,
                      ],
                      queryFn: () =>
                        client.forYou.feed({
                          category: category || undefined,
                          query: search,
                          offset: requestedOffset,
                          limit: 20,
                        }),
                    })
                    .then((result) => {
                      setExtraItems((previous) => [
                        ...previous,
                        ...result.items.filter(
                          (i) => !items.some((old) => old.id === i.id)
                        ),
                      ]);
                      setNextOffset(result.nextOffset);
                    })
                    .catch(() =>
                      setNotice("Couldn't load more. Please try again.")
                    )
                    .finally(() => setBusy(false));
                }}
              />
            ) : null}
          </>
        ) : null}

        {page === "insights" ? (
          insights.isPending ? (
            <ActivityIndicator accessibilityLabel="Loading your insights" />
          ) : insights.isError ? (
            <View className="gap-3 rounded-2xl bg-surface p-4">
              <Text>We couldn't load your insights right now.</Text>
              <Action label="Retry" onPress={() => insights.refetch()} />
            </View>
          ) : insights.data ? (
            <>
              <View className="gap-2 rounded-2xl bg-surface p-4">
                <Text className="font-bold text-lg">Your interests</Text>
                <Text className="text-muted">
                  {insights.data.personalizationEnabled
                    ? `${insights.data.activityCount} activity signals are available to personalize your recommendations.`
                    : "Personalization is off. Your selected interests remain in your control."}
                </Text>
                {insights.data.strongest.length ? (
                  insights.data.strongest.map((interest) => (
                    <Text key={interest.key}>
                      {interest.label}
                      {interest.selected ? " · Selected by you" : ""}
                    </Text>
                  ))
                ) : (
                  <Text>
                    Choose interests to help shape your recommendations.
                  </Text>
                )}
              </View>
              <View className="gap-3 rounded-2xl bg-surface p-4">
                <Text className="font-bold text-lg">Emerging interests</Text>
                <Text className="text-muted">
                  These are observations, not preference changes. Review and
                  choose explicitly in your interest settings.
                </Text>
                {insights.data.emerging.length ? (
                  insights.data.emerging.map((interest) => (
                    <View className="gap-2" key={interest.key}>
                      <Text className="font-bold">{interest.label}</Text>
                      <Text className="text-muted">{interest.reason}</Text>
                      <Action
                        label={`Review ${interest.label} in interests`}
                        onPress={editInterests}
                      />
                    </View>
                  ))
                ) : (
                  <Text>No emerging interests to review yet.</Text>
                )}
              </View>
              <View className="gap-3">
                <Text className="font-bold text-lg">Trending now</Text>
                {insights.data.trending.length ? (
                  insights.data.trending.map((item) => (
                    <Pressable
                      accessibilityRole="button"
                      className="gap-1 rounded-xl border border-separator bg-surface p-4"
                      key={item.id}
                      onPress={() => openOpportunity(item.id)}
                    >
                      <Text className="font-bold">{item.title}</Text>
                      <Text className="text-muted">
                        {label(item.category)} · {item.provider}
                      </Text>
                    </Pressable>
                  ))
                ) : (
                  <Text>No current trending opportunities.</Text>
                )}
              </View>
            </>
          ) : null
        ) : null}

        {page === "guidance" ? (
          <>
            <View className="gap-2 rounded-2xl bg-surface p-4">
              <Text className="font-bold text-lg">
                What are you working toward?
              </Text>
              <Text className="text-muted">
                Describe a goal to find relevant published opportunities.
              </Text>
              <TextInput
                accessibilityLabel="Describe your opportunity goal"
                className="min-h-24 rounded-xl border border-separator bg-background px-3 py-3 text-foreground"
                multiline
                onChangeText={setGoals}
                placeholder="For example, finding a technology internship in Lagos"
                placeholderTextColor="#808890"
                textAlignVertical="top"
                value={goals}
              />
              <Text className="text-muted text-sm">
                Source-grounded discovery guidance, not generative AI, an
                eligibility assessment, or application advice.
              </Text>
              <Action
                disabled={guidanceMutation.isPending || !goals.trim()}
                label={
                  guidanceMutation.isPending
                    ? "Finding opportunities…"
                    : "Find Opportunities"
                }
                onPress={() => {
                  setGuidanceResult(null);
                  guidanceMutation.mutate(
                    { goals: goals.trim() },
                    {
                      onSuccess: setGuidanceResult,
                      onError: () =>
                        setNotice(
                          "We couldn't find guidance right now. Please try again."
                        ),
                    }
                  );
                }}
              />
            </View>
            {guidanceResult ? (
              <View className="gap-3">
                <View className="gap-2 rounded-2xl bg-surface p-4">
                  <Text className="font-bold text-lg">Guidance</Text>
                  <Text>{guidanceResult.answer}</Text>
                  <Text className="text-muted text-sm">
                    {guidanceResult.disclaimer}
                  </Text>
                </View>
                {guidanceResult.suggestions.map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    className="gap-2 rounded-xl border border-separator bg-surface p-4"
                    key={item.id}
                    onPress={() => openOpportunity(item.id)}
                  >
                    <Text className="font-bold">{item.title}</Text>
                    <Text className="text-muted">{item.provider}</Text>
                    <Text numberOfLines={2}>{item.summary}</Text>
                    <Text className="font-bold text-p-500">
                      View opportunity
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {page === "saved" || page === "tracking" ? (
          <>
            <Action
              label={
                page === "saved"
                  ? "Application Dashboard"
                  : "Saved Opportunities"
              }
              onPress={() => setPage(page === "saved" ? "tracking" : "saved")}
            />
            {saves.isPending ? <ActivityIndicator /> : null}
            {saves.isError ? (
              <Text>Couldn't load saved opportunities. Please retry.</Text>
            ) : null}
            {saves.isPending || saves.data?.length ? null : (
              <Text>
                No saved opportunities yet. Save something useful from For You.
              </Text>
            )}
            {(page === "tracking" ? STATUSES : [null]).map((status) => (
              <View className="gap-3" key={status ?? "saved"}>
                {status ? (
                  <Text className="font-bold text-lg">{status}</Text>
                ) : null}
                {saves.data
                  ?.filter((item) => !status || item.trackingStatus === status)
                  .map((item) => (
                    <View className="gap-2" key={item.id}>
                      {card({
                        ...item,
                        reason: "You saved this opportunity",
                        discovery: false,
                      })}
                      {item.reminderAt ? (
                        <Text>
                          Reminder: {new Date(item.reminderAt).toLocaleString()}
                        </Text>
                      ) : null}
                      <View className="flex-row flex-wrap gap-2">
                        <Action
                          label="Update Status"
                          onPress={() =>
                            setMenu({
                              item: {
                                ...item,
                                reason: "Saved",
                                discovery: false,
                              },
                              kind: "tracking",
                            })
                          }
                        />
                        {item.deadline &&
                        Date.parse(item.deadline) > Date.now() ? (
                          <Action
                            label="Remind Me"
                            onPress={() =>
                              setMenu({
                                item: {
                                  ...item,
                                  reason: "Saved",
                                  discovery: false,
                                },
                                kind: "reminder",
                              })
                            }
                          />
                        ) : null}
                      </View>
                    </View>
                  ))}
              </View>
            ))}
          </>
        ) : null}

        {page === "dna" ? (
          <>
            <Text>
              This helps NewsSpend understand what opportunities matter to you.
            </Text>
            <Text className="font-bold text-xl">Your Interests</Text>
            <Text>
              {profile.data?.interests.map(label).join(" · ") ||
                "Choose interests to get started."}
            </Text>
            <Text className="font-bold text-xl">
              What NewsSpend is Learning
            </Text>
            <Text>
              {Object.entries(profile.data?.learned ?? {})
                .filter(([, value]) => value > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([name]) => label(name))
                .join(" · ") ||
                "As you explore, your interests can evolve. Your selected interests stay under your control."}
            </Text>
            <Action label="Edit Interests" onPress={editInterests} />
            <Action
              label="Manage Personalization"
              onPress={() => setPage("preferences")}
            />
          </>
        ) : null}

        {page === "preferences" && !guest && profile.data ? (
          <>
            <Action label="Edit Interests" onPress={editInterests} />
            <Action
              label="Manage Opportunity DNA"
              onPress={() => setPage("dna")}
            />
            <Action
              label="Notification Preferences"
              onPress={() => setPage("notifications")}
            />
            <Action
              label="Saved Opportunities"
              onPress={() => setPage("saved")}
            />
            <Toggle
              label="Personalized Recommendations"
              onChange={(value) => updateToggle("personalized", value)}
              value={profile.data.personalized}
            />
            <Toggle
              label="Consent to learn from my activity"
              onChange={(value) => updateToggle("consent", value)}
              value={profile.data.consent}
            />
            <Text className="text-muted text-sm">
              Turning personalization off stops behavioural recommendations and
              clears the activity used to infer your interests. Your selected
              interests and saved content remain.
            </Text>
          </>
        ) : null}
        {page === "notifications" && profile.data ? (
          <>
            <Toggle
              label="New relevant opportunities"
              onChange={(value) => updateNotification("opportunities", value)}
              value={profile.data.notifications.opportunities}
            />
            <Toggle
              label="Deadline reminders"
              onChange={(value) => updateNotification("deadlines", value)}
              value={profile.data.notifications.deadlines}
            />
            <Toggle
              label="Discovery suggestions"
              onChange={(value) => updateNotification("discovery", value)}
              value={profile.data.notifications.discovery}
            />
            <Toggle
              label="Pause all For You notifications"
              onChange={(value) => updateNotification("paused", value)}
              value={profile.data.notifications.paused}
            />
          </>
        ) : null}

        {page === "detail" && content ? (
          <>
            <Text className="text-muted">
              {label(content.category)} · {content.kind}
            </Text>
            <Text className="font-bold text-2xl">{content.title}</Text>
            <Text>
              {content.provider}
              {content.location ? ` · ${content.location}` : ""}
            </Text>
            <Text className="text-sm">
              Published {new Date(content.publishedAt).toLocaleDateString()}
            </Text>
            {content.deadline ? (
              <Text>
                {Date.parse(content.deadline) <= Date.now()
                  ? "Closed · Deadline Passed"
                  : `Deadline: ${new Date(content.deadline).toLocaleString()}`}
              </Text>
            ) : null}
            <Text className="font-bold text-lg">Overview</Text>
            <Text>{content.summary}</Text>
            {Object.entries(content.details).map(([name, value]) => (
              <View key={name}>
                <Text className="font-bold">{name}</Text>
                <Text>{value}</Text>
              </View>
            ))}
            <Text>
              {content.trust === "official"
                ? "Official Source"
                : content.trust === "verified"
                  ? "Verified Source"
                  : "Source"}{" "}
              · {new URL(content.canonicalUrl).hostname}
            </Text>
            <Action
              label="Visit Official Source"
              onPress={() =>
                setMenu({
                  item: { ...content, reason: "", discovery: false },
                  kind: "source",
                })
              }
            />
            <Action
              disabled={busy}
              label={savedIds.has(content.id) ? "Saved · Remove" : "Save"}
              onPress={() => toggleSave(content)}
            />
            {savedIds.has(content.id) &&
            content.deadline &&
            Date.parse(content.deadline) > Date.now() ? (
              <Action
                label="Remind Me"
                onPress={() =>
                  setMenu({
                    item: { ...content, reason: "", discovery: false },
                    kind: "reminder",
                  })
                }
              />
            ) : null}
            <Action
              disabled={busy || guest}
              label="Mark as Read"
              onPress={() =>
                run(() => signal(content, "read"), "Reading preference updated")
              }
            />
            {guest ? null : (
              <View className="gap-3 rounded-2xl bg-surface p-4">
                <Text className="font-bold text-lg">
                  Ask about this opportunity
                </Text>
                <Text className="text-muted text-sm">
                  Source-based answers only. This helper does not assess
                  eligibility.
                </Text>
                <TextInput
                  accessibilityLabel="Your opportunity question"
                  className="min-h-12 rounded-xl border border-separator px-3 text-foreground"
                  onChangeText={setQuestion}
                  placeholder="What is the deadline?"
                  placeholderTextColor="#808890"
                  value={question}
                />
                <Action
                  disabled={busy || !question.trim()}
                  label="Ask"
                  onPress={() =>
                    run(async () => {
                      const response = await client.forYou.assistant({
                        id: content.id,
                        question,
                      });
                      setAnswer(`${response.answer}\n\n${response.disclaimer}`);
                    })
                  }
                />
                {answer ? (
                  <Text accessibilityLiveRegion="polite">{answer}</Text>
                ) : null}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      {/* The app's bottom sheet (as in CommentsMenuSheet): tapping the dimmed
      area, swiping down or pressing back all close it, which the hand-rolled
      Modal it replaces did not allow. Options are quiet rows, not a stack of
      filled buttons; only "Continue to Source" is a real confirmation, so it
      alone stays a button. `shownMenu` keeps the content on screen while the
      sheet animates closed. */}
      <BottomSheet
        isOpen={Boolean(menu)}
        onOpenChange={(open) => {
          if (!open) {
            setMenu(null);
          }
        }}
      >
        <BottomSheet.Portal disableFullWindowOverlay={__DEV__}>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            enableDynamicSizing
            style={{ paddingBottom: insets.bottom + 8 }}
          >
            {shownMenu ? (
              <View className="gap-1 px-3 pt-1">
                <View className="gap-0.5 px-3 pb-2">
                  <Text
                    accessibilityRole="header"
                    className="font-bold text-lg"
                  >
                    {shownMenu.kind === "report"
                      ? "Report Content"
                      : shownMenu.kind === "reminder"
                        ? "Deadline Reminder"
                        : shownMenu.kind === "source"
                          ? "You're leaving NewsSpend"
                          : shownMenu.kind === "tracking"
                            ? "Application Status"
                            : "Recommendation Options"}
                  </Text>
                  {shownMenu.kind === "source" ? null : (
                    <Text className="text-muted text-sm" numberOfLines={1}>
                      {shownMenu.item.title}
                    </Text>
                  )}
                </View>
                {shownMenu.kind === "feedback" ? (
                  <>
                    {(
                      [
                        {
                          label: "Show me more like this",
                          action: "more",
                          icon: ThumbsUpIcon,
                        },
                        {
                          label: "Show me less like this",
                          action: "less",
                          icon: ThumbsDownIcon,
                        },
                        {
                          label: "Not interested",
                          action: "dismiss",
                          icon: EyeSlashIcon,
                        },
                      ] as const
                    ).map(({ label: title, action, icon }) => (
                      <MenuRow
                        disabled={busy}
                        icon={icon}
                        key={action}
                        label={title}
                        onPress={() => {
                          if (requireAccount()) {
                            const item = shownMenu.item;
                            setMenu(null);
                            run(
                              () => signal(item, action),
                              profile.data?.personalized
                                ? "Your feedback will improve recommendations."
                                : "Enable personalization to use recommendation feedback."
                            );
                          }
                        }}
                      />
                    ))}
                    <View className="mx-3 my-1 h-px bg-separator" />
                    <MenuRow
                      destructive
                      icon={FlagIcon}
                      label="Report"
                      onPress={() => {
                        if (requireAccount()) {
                          setMenu({ ...shownMenu, kind: "report" });
                        }
                      }}
                    />
                  </>
                ) : null}
                {shownMenu.kind === "report"
                  ? REPORT_REASONS.map((reason) => (
                      <MenuRow
                        disabled={busy}
                        key={reason}
                        label={reason}
                        onPress={() => {
                          const item = shownMenu.item;
                          setMenu(null);
                          run(
                            () =>
                              client.forYou.report({
                                id: item.id,
                                reason,
                                details: "",
                              }),
                            "Thanks. We'll review this."
                          );
                        }}
                      />
                    ))
                  : null}
                {shownMenu.kind === "reminder" ? (
                  <>
                    <Text className="px-3 pb-2 text-muted text-sm">
                      Reminders use your notification preferences. Enable
                      deadline reminders to receive alerts.
                    </Text>
                    {([1, 3, 7, null] as const).map((days) => (
                      <MenuRow
                        destructive={days === null}
                        disabled={busy}
                        icon={days === null ? MinusCircleIcon : BellIcon}
                        key={days ?? "cancel"}
                        label={
                          days === null
                            ? "Remove Reminder"
                            : `${days} day${days === 1 ? "" : "s"} before`
                        }
                        onPress={() => {
                          const item = shownMenu.item;
                          setMenu(null);
                          run(
                            () =>
                              client.forYou.updateSaved({
                                id: item.id,
                                reminderDays: days,
                              }),
                            days === null
                              ? "Reminder removed"
                              : "Reminder saved"
                          );
                        }}
                      />
                    ))}
                  </>
                ) : null}
                {shownMenu.kind === "tracking"
                  ? STATUSES.map((status) => (
                      <MenuRow
                        disabled={busy}
                        key={status}
                        label={status}
                        onPress={() => {
                          const item = shownMenu.item;
                          setMenu(null);
                          run(
                            () =>
                              client.forYou.updateSaved({
                                id: item.id,
                                status,
                              }),
                            "Application status updated"
                          );
                        }}
                      />
                    ))
                  : null}
                {shownMenu.kind === "source" ? (
                  <View className="gap-3 px-3 pt-1">
                    <Text className="font-semibold">
                      {new URL(shownMenu.item.canonicalUrl).hostname}
                    </Text>
                    <Text className="text-muted">
                      Applications and official information are handled by the
                      provider, not NewsSpend.
                    </Text>
                    <Button
                      accessibilityLabel="Continue to Source"
                      onPress={() => {
                        const url = shownMenu.item.canonicalUrl;
                        setMenu(null);
                        run(() => Linking.openURL(url));
                      }}
                    >
                      <Button.Label>Continue to Source</Button.Label>
                    </Button>
                  </View>
                ) : null}
              </View>
            ) : null}
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </Screen>
  );
}
