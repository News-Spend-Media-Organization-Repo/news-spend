import { useNavigation } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { H4, ListItem, Paragraph, Stack } from "tamagui";

import { Screen } from "#/components/Screen";
import type { SettingsStackParamList } from "#/types";

const options: {
  title: string;
  screen: keyof SettingsStackParamList;
}[] = [
  {
    title: "Frequently Asked Questions",
    screen: "FAQ",
  },
  {
    title: "Email Customer Support",
    screen: "Email",
  },
  {
    title: "Submit Feedback",
    screen: "Feedback",
  },
  {
    title: "Inquire about Advertising",
    screen: "Advertise",
  },
  {
    title: "Call Us",
    screen: "Call",
  },
];

const Support = () => {
  const navigation = useNavigation();

  return (
    <Screen>
      <FlashList
        data={options}
        ListHeaderComponent={() => (
          <Stack p="$4" ai="center">
            <H4>Tell us how we can help you</H4>
            <Paragraph textAlign="center">
              Our team is always on hand to help you with any questions or
              queries
            </Paragraph>
          </Stack>
        )}
        renderItem={({ item }) => (
          <ListItem
            onPress={() => navigation.navigate(item.screen, {})}
            pressTheme
            bg="$p50"
            p="$4"
            mb="$2"
          >
            <Paragraph fontWeight="700">{item.title}</Paragraph>
          </ListItem>
        )}
      />
    </Screen>
  );
};
export default Support;
