import { Dot } from "@tamagui/lucide-icons";
import { Platform } from "react-native";
import { Paragraph, SizableText, Stack, Text, XStack } from "tamagui";
import { useSnapshot } from "valtio";

import { Screen } from "#/components/Screen";
import { routeState } from "#/state/route-state";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

const privacyPolicyContent = [
  {
    title: "1. Information We Collect",
    description:
      "We collect the following information from you when you use the App:",
    bullets: [
      "Personal information: This includes your name, email address, and any other information you voluntarily provide to us, such as your profile picture and interests.",
      "Device information: This includes your device type, operating system, and IP address.",
      "Usage information: This includes information about how you use the App, such as the articles you read, the videos you watch, and the surveys you complete.",
    ],
  },
  {
    title: "2. How We Use Your Information",
    description: "We use your information to:",
    bullets: [
      "Provide you with the services and features of the App.",
      "Send you notifications about new content and rewards.",
      "Improve the App and our services.",
      "Conduct research.",
      "Comply with legal requirements.",
    ],
  },
  {
    title: "3. How We Share Your Information",
    description:
      "We may share your information with the following third parties:",
    bullets: [
      "Service providers who help us operate the App and provide our services.",
      "Advertisers who display ads in the App.",
      "Analytics providers who help us understand how users interact with the App.",
      "Law enforcement and other government agencies, as required by law.",
    ],
  },
  {
    title: "4. Your Choices",
    description:
      "You have the following choices about how we collect, use, and share your information:",
    bullets: [
      "You can opt out of receiving marketing communications from us by clicking the unsubscribe link in any email you receive from us.",
      "You can manage your device permissions to control what information the App can access.",
      "You can delete your account and all of your associated information at any time by contacting us at support@newsspendmedia.com",
    ],
  },
  {
    title: "5. Data Security",
    description:
      "We take steps to protect your information from unauthorized access, use, or disclosure. However, no method of electronic transmission or storage is 100% secure. Therefore, we cannot guarantee the absolute security of your information.",
    bullets: [],
  },
  {
    title: "6. Changes to This Privacy Policy",
    description:
      'We may update this Privacy Policy from time to time. If we make any changes, we will post the revised Privacy Policy on the App and update the "Last Updated" date at the top of this page. Your continued use of the App after any changes to this Privacy Policy constitutes your acceptance of the revised Privacy Policy.',
    bullets: [],
  },
  {
    title: "Contact Us",
    description:
      "If you have any questions about this Privacy Policy, please contact us at support@newsspendmedia.com",
    bullets: [],
  },
];

export default function PrivacyPolicy() {
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
      {/*<ScrollView
        p="$3"
        gap="$4"
        contentContainerStyle={{
          paddingBottom: 50,
        }}
      >*/}
      <Stack mb="$1">
        <Text fontSize={20} fontWeight="700">
          Privacy Policy for News Spend Media
        </Text>
        <SizableText size="$3">Last Updated: October 5, 2023</SizableText>
      </Stack>
      {privacyPolicyContent.map((section, index) => (
        <Stack key={index} py="$3">
          <Text fontSize={18} fontWeight="700" py="$2">
            {section.title}
          </Text>
          <Paragraph size="$4">{section.description}</Paragraph>
          {section.bullets.map((bullet, bulletIndex) => (
            <XStack key={bulletIndex}>
              <Dot />
              <Paragraph flex={1} size="$4">
                {bullet}
              </Paragraph>
            </XStack>
          ))}
        </Stack>
      ))}
      {/*</ScrollView>*/}
    </Screen>
  );
}
