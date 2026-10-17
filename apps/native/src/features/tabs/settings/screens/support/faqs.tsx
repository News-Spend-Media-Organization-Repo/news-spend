import { useQuery } from "@tanstack/react-query";
import { Accordion } from "heroui-native/accordion";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { TextField } from "heroui-native/text-field";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";
import { contactSupport } from "./faq/contactSupport";
import { FAQ_FALLBACK, type FaqSection } from "./faq/faqFallback";
import { faqIcon } from "./faq/faqIcons";
import { filterFaq, hasSearchTerms } from "./faq/filterFaq";

const PARAGRAPH_BREAK = /\n\s*\n/;
const SKELETON_KEYS = ["a", "b", "c", "d"] as const;

const questionCount = (count: number) =>
  `${count} ${count === 1 ? "question" : "questions"}`;

/**
 * Blank lines split paragraphs; a single line break stays inside one. Paragraphs
 * have no id, so a repeat of the same text gets a numbered key.
 */
const paragraphsOf = (answer: string): Array<{ key: string; text: string }> => {
  const seen = new Map<string, number>();
  const result: Array<{ key: string; text: string }> = [];
  for (const raw of answer.split(PARAGRAPH_BREAK)) {
    const text = raw.trim();
    if (text.length === 0) {
      continue;
    }
    const count = seen.get(text) ?? 0;
    seen.set(text, count + 1);
    result.push({ key: `${text}#${count}`, text });
  }
  return result;
};

const FaqSkeleton = () => (
  <View className="gap-3">
    {SKELETON_KEYS.map((key) => (
      <Skeleton className="h-16 w-full rounded-xl" key={key} />
    ))}
  </View>
);

const Answer = ({ answer }: { answer: string }) => (
  <View className="gap-3">
    {paragraphsOf(answer).map(({ key, text }) => (
      <Text
        className="text-muted-foreground text-sm leading-relaxed"
        key={key}
        selectable
      >
        {text}
      </Text>
    ))}
  </View>
);

const FAQs = () => {
  const { data, isPending, fetchStatus } = useQuery({
    ...orpc.faq.get.queryOptions(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [query, setQuery] = useState("");
  const [openCategories, setOpenCategories] = useState<string[]>([]);
  // Categories the reader shut while a search had them open.
  const [closedWhileSearching, setClosedWhileSearching] = useState<string[]>(
    []
  );

  const cmsCategories = data?.categories ?? [];
  const hasCmsData = cmsCategories.length > 0;
  // Only a request that is actually in flight earns the skeleton. A paused
  // one (offline) never will resolve, so the built-in copy takes over.
  const isLoading = isPending && fetchStatus === "fetching" && !hasCmsData;
  const source: FaqSection[] = hasCmsData ? cmsCategories : FAQ_FALLBACK;

  const isSearching = hasSearchTerms(query);
  const categories = useMemo(() => filterFaq(source, query), [source, query]);
  const matchedIds = categories.map((category) => category.id);
  const expanded = isSearching
    ? matchedIds.filter((id) => !closedWhileSearching.includes(id))
    : openCategories;

  const onSearch = (text: string) => {
    setQuery(text);
    setClosedWhileSearching([]);
  };

  const onCategoriesChange = (next: string[]) => {
    if (isSearching) {
      setClosedWhileSearching(matchedIds.filter((id) => !next.includes(id)));
      return;
    }
    setOpenCategories(next);
  };

  const renderBody = () => {
    if (isLoading) {
      return <FaqSkeleton />;
    }
    if (categories.length === 0) {
      return (
        <Text className="py-6 text-center text-muted-foreground text-sm">
          {`No questions match '${query.trim()}'`}
        </Text>
      );
    }
    return (
      <Accordion
        onValueChange={onCategoriesChange}
        selectionMode="multiple"
        value={expanded}
        variant="surface"
      >
        {categories.map((category) => (
          <Accordion.Item key={category.id} value={category.id}>
            <Accordion.Trigger>
              <Icon name={faqIcon(category.icon)} size={22} />
              <View className="flex-1 px-3">
                <Text className="font-semibold text-base">{category.name}</Text>
                <Text className="text-muted-foreground text-xs">
                  {isSearching
                    ? `${category.questions.length} of ${category.total}`
                    : questionCount(category.total)}
                </Text>
              </View>
              <Accordion.Indicator />
            </Accordion.Trigger>
            <Accordion.Content>
              <Accordion hideSeparator={false} selectionMode="multiple">
                {category.questions.map((item) => (
                  <Accordion.Item key={item.id} value={item.id}>
                    <Accordion.Trigger>
                      <Text className="flex-1 pr-2 font-medium text-sm">
                        {item.question}
                      </Text>
                      <Accordion.Indicator />
                    </Accordion.Trigger>
                    <Accordion.Content>
                      <Answer answer={item.answer} />
                    </Accordion.Content>
                  </Accordion.Item>
                ))}
              </Accordion>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion>
    );
  };

  return (
    <Screen statusBarStyle="light">
      <ScrollView
        contentContainerClassName="gap-4 p-4"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-1">
          <Text className="font-semibold text-2xl">Help & FAQs</Text>
          <Text className="text-muted-foreground text-sm">
            Find answers to common questions about NewsSpend
          </Text>
        </View>

        <TextField>
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={onSearch}
            placeholder="Search frequently asked questions..."
            returnKeyType="search"
            value={query}
          />
        </TextField>

        {renderBody()}

        <View className="items-center gap-2 py-6">
          <Text className="font-semibold text-lg">Still need help?</Text>
          <Text className="text-center text-muted-foreground text-sm">
            Can't find the answer you're looking for?
          </Text>
          <Button onPress={contactSupport}>
            <Button.Label>Contact Support</Button.Label>
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
};

export default FAQs;
