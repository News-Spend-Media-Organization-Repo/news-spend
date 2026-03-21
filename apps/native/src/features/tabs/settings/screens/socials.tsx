import { Linking } from "react-native";
import { H5, Image, Stack, XStack } from "tamagui";

import { Screen } from "#/components/Screen";

const socials = [
  {
    title: "Facebook",
    image: require("#/images/logo-facebook.png"),
    url: "https://www.facebook.com/profile.php?id=61562321939377",
  },
  {
    title: "Instagram",
    image: require("#/images/logo-ig.png"),
    url: "https://www.instagram.com/news_spend_media/?utm_source=news_spend_media&utm_medium=referral",
  },
  {
    title: "YouTube",
    image: require("#/images/youtube-logo.png"),
    url: "https://youtube.com/@news-spendmedia?si=Qadr5jX3kL0Zxs-z",
  },
];

export default function Socials() {
  return (
    <Screen>
      <Stack gap="$3" pt="$2" px="$3">
        <H5 ta="center">Follow us on social media</H5>

        <XStack jc="space-around">
          {socials.map((social) => (
            <Stack
              key={social.title}
              onPress={() => Linking.openURL(social.url)}
            >
              <Image height={50} source={social.image} width={50} />
            </Stack>
          ))}
        </XStack>
      </Stack>
    </Screen>
  );
}
