import { Platform } from "react-native";
import { Paragraph, SizableText, Stack, Text, YStack } from "tamagui";
import { useSnapshot } from "valtio";

import { Screen } from "#/components/Screen";
import { routeState } from "#/state/route-state";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

const terms = [
  {
    title: "1. Eligibility",
    description:
      "You must be at least 13 years old to use the News Spend Media app. You must have a valid email address and phone number.",
  },
  {
    title: "2. Account",
    description:
      "You are responsible for keeping your account information confidential. You agree not to share your account information with anyone else. You agree to notify News Spend Media immediately if you believe your account has been compromised.",
  },
  {
    title: "3. Use of the App",
    description:
      "You agree to use the News Spend Media app in a responsible and lawful manner. You agree not to use the app to post or share any content that is illegal, harmful, threatening, abusive, harassing, tortious, defamatory, vulgar, obscene, pornographic, libellous, invasive of another's privacy, hateful, or racially, ethnically or otherwise objectionable. You agree not to use the app to impersonate any person or entity. You agree not to use the app to collect or store personal data about other users without their consent. You agree not to use the app to post or share any advertising, promotional materials, or other forms of solicitation without the express written permission of News Spend Media.",
  },
  {
    title: "4. Intellectual Property",
    description:
      "The News Spend Media app and all of its content, including but not limited to text, images, videos, and software, is protected by copyright and other intellectual property laws. You agree not to copy, modify, distribute, transmit, publicly display, perform, reproduce, publish, license, transfer, or sell any of the content of the News Spend Media app without the express written permission of News Spend Media.",
  },
  {
    title: "5. Points",
    description:
      "You can earn points by reading news articles on the News Spend Media app. Points can be redeemed for rewards, such as gift cards, merchandise, and cash. News Spend Media reserves the right to change the redemption value of points at any time.",
  },
  {
    title: "6. Termination",
    description:
      "News Spend Media reserves the right to terminate your account and/or suspend your access to the app at any time, for any reason, without notice.",
  },
  {
    title: "8. Changes to the Terms of Use",
    description:
      "News Spend Media reserves the right to change these terms of use at any time. If we make any changes, we will post the revised terms of use on the News Spend Media website and app. Your continued use of the app after the revised terms of use have been posted constitutes your acceptance of the changes.",
  },
  {
    title: "Contact Us",
    description:
      "If you have any questions about these terms of use, please contact us at support@newsspendmedia.com",
  },
];

export default function TermOfUse() {
  const { reactNavTabName } = useSnapshot(routeState);
  const insets = useSafeAreaInsetsStyle(
    reactNavTabName === "SettingsHome" ? ["bottom"] : ["bottom", "top"],
    "padding"
  );

  return (
    <Screen
      contentContainerStyle={{
        ...insets,
        paddingTop: Platform.OS === "ios" ? 10 : (insets?.paddingTop ?? 0) + 10,
      }}
      preset="scroll"
      px="$2.5"
    >
      <SizableText fos={16} lh="$1" mb="$3" size="$4">
        By using the News Spend Media mobile app, you agree to the following
        terms of use:
      </SizableText>
      <YStack gap="$4">
        {terms.map((term) => (
          <Stack gap="$2" key={term.title}>
            <Text fontSize={18} fontWeight="700">
              {term.title}
            </Text>
            <Paragraph size="$4">{term.description}</Paragraph>
          </Stack>
        ))}
      </YStack>
    </Screen>
  );
}
