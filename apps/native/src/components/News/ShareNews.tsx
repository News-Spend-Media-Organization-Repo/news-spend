import { useRoute } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { FlatList, ToastAndroid } from "react-native";
import Share, { type Social } from "react-native-share";
import { Sheet, Stack, Text, XStack } from "tamagui";
import {
  Copy,
  DotsThreeOutlineVertical,
  FacebookLogo,
  MessengerLogo,
  ShareNetwork,
  TwitterLogo,
  WhatsappLogo,
} from "tamagui-phosphor";

import BannerAds from "#/components/Ads/BannerAds";
import { Button } from "#/components/ui/Button";
import { useGlobalBackHandler } from "#/hooks/useBackHandler";

export const ShareNews = ({ news, onShare }) => {
  const route = useRoute();
  const currentTabPath = route.name === "News" ? "news" : "live";
  const [open, setOpen] = useState(false);
  const numColumns = 3;
  const gap = 10;
  const currentScreen = route.name === "SingleLive" ? "video" : "article";
  const url = `https://csb-9i1lhi-lac.vercel.app/${currentTabPath}/${currentScreen}/${news.slug}`;

  useGlobalBackHandler(() => {
    if (open) {
      setOpen(false);
      return true;
    }

    return false;
  });

  const options = [
    {
      text: "Facebook",
      Icon: FacebookLogo,
      onPress: async () => {
        try {
          const result = await Share.shareSingle({
            message: `${news.title}`,
            title: "Share via",
            url,
            social: Share.Social.FACEBOOK as Social,
            appId: "",
          });

          result.success && onShare?.();
        } catch (error) {
          console.log(error.message);
        }
      },
    },
    {
      text: "Messenger",
      Icon: MessengerLogo,
      onPress: async () => {
        try {
          const result = await Share.shareSingle({
            message: `${news.title}`,
            title: "Share via",
            url,
            social: Share.Social.MESSENGER as Social,
            appId: "",
          });

          result.success && onShare?.();
        } catch (error) {
          console.log(error.message);
        }
      },
    },
    {
      text: "Whatsapp",
      Icon: WhatsappLogo,
      onPress: async () => {
        try {
          const result = await Share.shareSingle({
            message: `${news.title}`,
            title: "Share via",
            url,
            social: Share.Social.WHATSAPP as Social,
            appId: "",
          });

          result.success && onShare?.();
        } catch (error) {
          console.log(error.message);
        }
      },
    },
    {
      text: "Twitter",
      Icon: TwitterLogo,
      onPress: async () => {
        try {
          const result = await Share.shareSingle({
            message: `${news.title}`,
            title: "Share via",
            url,
            social: Share.Social.TWITTER as Social,
            appId: "",
          });

          result.success && onShare?.();
        } catch (error) {
          console.log(error.message);
        }
      },
    },
    {
      text: "Copy link",
      Icon: Copy,
      onPress: async () => {
        try {
          await Clipboard.setStringAsync(`${news.title} \n ${url}`);
          ToastAndroid.show("Link copied to clipboard", ToastAndroid.SHORT);
        } catch (error) {
          console.error(error);
        }
      },
    },
    {
      text: "Others",
      Icon: DotsThreeOutlineVertical,
      onPress: async () => {
        try {
          const result = await Share.open({
            message: `${news.title}`,
            title: "Share via",
            url,
          });
          result.success && onShare?.();
        } catch (error) {
          console.log(error.message);
        }
      },
    },
  ];

  return (
    <>
      <Button
        bg="$p500"
        borderRadius="$10"
        h={50}
        onPress={() => setOpen(true)}
        shadowColor="rgba(0, 0, 0, 0.25)"
        style={{
          elevation: 2,
        }}
        w={50}
      >
        <Button.Icon color="white">
          <ShareNetwork size={28} />
        </Button.Icon>
      </Button>

      <Sheet
        animation="easeIn"
        dismissOnSnapToBottom
        forceRemoveScrollEnabled={open}
        modal
        onOpenChange={setOpen}
        open={open}
        snapPointsMode="fit"
        zIndex={100_000}
      >
        <Sheet.Overlay bg="rgba(0, 0, 0, 0.5)" />
        <Sheet.Frame
          // flex={1}
          gap="$5"
          // justifyContent="center"
          // alignItems="center"
          padding="$4"
        >
          <Stack justifyContent="center" px="$2" w="100%">
            <Text ff="$body" fontSize="$8" ta="center">
              Share
            </Text>
          </Stack>
          <Stack>
            <FlatList
              // estimatedItemSize={8}
              columnWrapperStyle={{
                gap,
                alignItems: "center",
                justifyContent: "space-around",
              }}
              contentContainerStyle={{
                gap: 20,
              }}
              data={options}
              key={numColumns}
              numColumns={numColumns}
              renderItem={({ item: { Icon, ...item } }) => (
                <Stack ai="center" gap="$2" key={item.text}>
                  <Button h="$5" onPress={item.onPress} primary py={2} w="$5">
                    <Button.Icon color="white">
                      <Icon size={30} />
                    </Button.Icon>
                  </Button>
                  <Text ff="$body" ta="center">
                    {item.text}
                  </Text>
                </Stack>
              )}
            />
          </Stack>
          <XStack jc="center" mt="$2" w="100%">
            <BannerAds size="LARGE_BANNER" />
          </XStack>
        </Sheet.Frame>
      </Sheet>
    </>
  );
};
