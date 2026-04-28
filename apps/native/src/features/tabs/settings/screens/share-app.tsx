import { LegendList } from "@legendapp/list/react-native";
import * as Clipboard from "expo-clipboard";
import type { IconProps } from "phosphor-react-native";
import {
  ChatDots,
  Copy,
  EnvelopeSimple,
  MessengerLogo,
  ShareNetwork,
  WhatsappLogo,
} from "phosphor-react-native";
import { useMemo } from "react";
import { Linking, Platform, ToastAndroid } from "react-native";
import Share, { type Social } from "react-native-share";
import { toast } from "sonner-native";
import { ListItem, Paragraph, Separator, YGroup } from "tamagui";

import { Screen } from "#/components/Screen";
import useAddActivity from "#/hooks/point/useAddActivity";
import { authState } from "#/state/auth";

const msg =
  "News-spend media gives me all the latest news and helps me to achieve my dreams. I have been enjoying it and would like to share it with you. Get it from this link";
const url = "https://newsspend.com/";

const ShareApp = () => {
  const addActivityMutation = useAddActivity();

  const awardPoint = () => {
    if (!authState.user) {
      return;
    }
    addActivityMutation.mutate(
      {
        action: "share",
        type: "point",
        point: 20, // TODO: make this dynamic
        description: "Shared app",
      },
      {
        onSuccess: (response) => {
          toast.success("Points earned", {
            description: "You earned 20 points for sharing News Spend Media App!",
          });
        },
      },
    );
  };

  const onShare = async (social: Social, pkg: string): Promise<void> => {
    try {
      // On iOS, skip the package installed check (not implemented)

      const res = await Share.shareSingle({
        message: msg,
        social,
        title: "Refer a friend and earn 20 credits",
        url,
        forceDialog: true,
        appId: "",
      });

      if (res.success && Platform.OS !== "ios") {
        const { isInstalled } = await Share.isPackageInstalled(pkg);
        if (isInstalled) {
          awardPoint();
        }
      }
    } catch (error: any) {
      console.log("Share error:", error.message);
      ToastAndroid.show("Could not share", ToastAndroid.SHORT);
    }
  };

  const options: {
    text: string;
    Icon: React.FC<IconProps>;
    onPress: () => void;
  }[] = useMemo(
    () => [
      {
        text: "Invite via SMS",
        Icon: ChatDots,
        onPress: async () => {
          try {
            const res = await Linking.openURL(`sms:?body=${msg} ${url}`);

            if (res) {
              awardPoint();
            } else {
              ToastAndroid.show("Could not open SMS. Please try again", ToastAndroid.SHORT);
            }
          } catch (error) {
            console.error(error);
            ToastAndroid.show("Could not open SMS. Please try again", ToastAndroid.SHORT);
          }
        },
      },
      {
        text: "Invite via Email",
        Icon: EnvelopeSimple,
        onPress: async () => {
          try {
            const res = await Linking.openURL(`mailto:?body=${msg} ${url}`);
            if (res) {
              awardPoint();
            } else {
              ToastAndroid.show("Could not open SMS. Please try again", ToastAndroid.SHORT);
            }
          } catch (error) {
            console.error(error);
            ToastAndroid.show("Could not open Email. Please try again", ToastAndroid.SHORT);
          }
        },
      },
      {
        text: "Invite Messenger Friends",
        Icon: MessengerLogo,
        onPress: async () => onShare(Share.Social.MESSENGER as Social, "com.facebook.orca"),
      },
      {
        text: "Invite Whatsapp Friends",
        Icon: WhatsappLogo,
        onPress: async () => onShare(Share.Social.WHATSAPP as Social, "com.whatsapp"),
      },
      {
        text: "Copy link",
        Icon: Copy,
        onPress: async () => {
          try {
            await Clipboard.setStringAsync(`${msg} \n ${url}`);
            ToastAndroid.show("Link copied to clipboard", ToastAndroid.SHORT);
          } catch (error) {
            console.error(error);
            ToastAndroid.show("Could not copy link", ToastAndroid.SHORT);
          }
        },
      },
      {
        text: "Share via...",
        Icon: ShareNetwork,
        onPress: async () => {
          try {
            const res = await Share.open({
              message: `${msg}`,
              title: "Refer a friend and earn 20 credits",
              url,
            });

            if (res.success) {
              awardPoint();
            } else {
              ToastAndroid.show("Could not share. Please try again", ToastAndroid.SHORT);
            }
          } catch (error) {
            console.log(error);
            ToastAndroid.show("Could not share", ToastAndroid.SHORT);
          }
        },
      },
    ],
    [],
  );
  return (
    <Screen>
      <Paragraph px="$4" py="$2">
        Earn
        <Paragraph color="$p500" fontWeight="600">
          {" "}
          20{" "}
        </Paragraph>
        credits for every friend you invite
      </Paragraph>

      <YGroup flex={1} size="$2">
        <LegendList
          data={options}
          ItemSeparatorComponent={Separator}
          keyExtractor={(item) => item.text}
          renderItem={({ item: { text, Icon, onPress } }) => (
            <YGroup.Item key={text}>
              <ListItem
                icon={<Icon />}
                onPress={onPress}
                pressTheme
                // iconAfter={<CaretRight color="grey" />}
                title={text}
              />
            </YGroup.Item>
          )}
        />
      </YGroup>
    </Screen>
  );
};
export default ShareApp;
