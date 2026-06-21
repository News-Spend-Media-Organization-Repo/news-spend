import { Image } from "expo-image";
import { Linking, Pressable, View } from "react-native";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";

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
    <Screen systemBarStyle="light">
      <View className="gap-3 px-3 pt-2">
        <Text className="text-center" variant="subtitle">
          Follow us on social media
        </Text>

        <View className="flex-row justify-around">
          {socials.map((social) => (
            <Pressable key={social.title} onPress={() => Linking.openURL(social.url)}>
              <Image source={social.image} style={{ height: 50, width: 50 }} />
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}
