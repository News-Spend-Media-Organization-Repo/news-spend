import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { ChevronDown } from "@tamagui/lucide-icons";
import { useCallback } from "react";
import {
  Accordion,
  Paragraph,
  ScrollView,
  Square,
  Stack,
  XStack,
} from "tamagui";

import { Screen } from "#/components/Screen";

const questions = [
  {
    question: "How does the point system work?",
    answer:
      "The point system rewards users for reading articles on the app. You can earn points by reading news articles, watching videos, and completing other tasks in the app. The number of points you earn will vary depending on the task.",
  },
  {
    question: "What can I do with the points I earn?",
    answer:
      "You can bank your points to achieve your dream or use it to play lottery to win amazing prizes.",
  },
  {
    question: "Can I advertise on the app?",
    answer:
      "Yes, you can advertise your services on the app. We offer advertising options for businesses and individuals.",
  },
  {
    question: "How do I advertise on the app?",
    answer:
      "You can contact our advertising team to learn more about advertising options and pricing.",
  },
  {
    question: "How much does it cost to advertise?",
    answer:
      "The cost of advertising in the app varies depending on the length and placement of your post.",
  },
  {
    question: "Is the app free to use?",
    answer:
      "Yes, the app is free to use. However, some premium content may require points or a subscription.",
  },
  {
    question: "How do I contact customer support?",
    answer:
      "You can contact customer support through the app or by visiting our website. We offer email and chat support.",
  },
];

const FAQs = () => {
  const renderItem: ListRenderItem<Record<string, string>> = useCallback(
    ({ item: { question, answer }, index }) => (
      <Accordion.Item
        value={index.toString()}
        bg="#f2f2f2"
        p="$2"
        borderRadius="$3"
      >
        <Accordion.Trigger unstyled>
          {({ open }: { open: boolean }) => (
            <XStack jc="space-between">
              <Paragraph fow="600">{`${index + 1}. ${question}`}</Paragraph>
              <Square animation="quick" rotate={open ? "180deg" : "0deg"}>
                <ChevronDown size="$1.5" />
              </Square>
            </XStack>
          )}
        </Accordion.Trigger>

        <Accordion.Content bg="#f2f2f2">
          <Paragraph fos="$4">{answer}</Paragraph>
        </Accordion.Content>
      </Accordion.Item>
    ),
    []
  );
  return (
    <Screen
      preset="scroll"
      px="$4"
      contentContainerStyle={{ paddingVertical: 12 }}
    >
      <Accordion
        overflow="hidden"
        type="multiple"
        gap="$4"
        defaultValue={["0"]}
      >
        <FlashList
          data={questions}
          ItemSeparatorComponent={() => <Square h={15} />}
          renderItem={renderItem}
        />
      </Accordion>
    </Screen>
  );
};
export default FAQs;
