import * as Clipboard from "expo-clipboard";
import { ListGroup } from "heroui-native/list-group";
import { PressableFeedback } from "heroui-native/pressable-feedback";
import { Separator } from "heroui-native/separator";
import { useMemo } from "react";
import { Linking, Platform, ScrollView, View } from "react-native";
import Share, { type Social } from "react-native-share";
import { Icon } from "#/components/heroui/icon";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { toast } from "#/components/heroui/toast";
import useAddActivity from "#/hooks/point/useAddActivity";
import type { IconProps } from "#/lib/icons";
import {
  ChatDotsIcon,
  CopyIcon,
  EnvelopeSimpleIcon,
  MessengerLogoIcon,
  ShareNetworkIcon,
  WhatsappLogoIcon,
} from "#/lib/icons";
import { authState } from "#/state/auth";

// TODO: make the share message configurable from the CMS
const msg =
  "News spend is giving out Scholarships, Free Data/Airtime, Electronic Gadgets, Gift Cards and Information to help users achieve their dreams. I thought you or someone you know may be interested. You can get it here:";
// newsspend.com/download does not exist; link.newsspend.com is the Detour
// domain, which sends installed users to the app and everyone else to the store.
const url = "https://link.newsspend.com";
// The link sits mid-sentence, so the whole text is sent as the message and the
// separate `url` field is left out: share targets append that after the
// message, which would strand the store-search hint ahead of the link.
const fullMsg = `${msg} ${url} OR search NewsSpend on your device store.`;

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
        onSuccess: (_response) => {
          toast.success("Points earned", {
            description:
              "You earned 20 points for sharing News Spend Media App!",
          });
        },
      }
    );
  };

  const onShare = async (social: Social, pkg: string): Promise<void> => {
    try {
      // On iOS, skip the package installed check (not implemented)

      const res = await Share.shareSingle({
        message: fullMsg,
        social,
        title: "Refer a friend and earn 20 credits",
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
      toast.error("Could not share");
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
        Icon: ChatDotsIcon,
        onPress: async () => {
          try {
            const res = await Linking.openURL(`sms:?body=${fullMsg}`);

            if (res) {
              awardPoint();
            } else {
              toast.error("Could not open SMS. Please try again");
            }
          } catch (error) {
            console.error(error);
            toast.error("Could not open SMS. Please try again");
          }
        },
      },
      {
        text: "Invite via Email",
        Icon: EnvelopeSimpleIcon,
        onPress: async () => {
          try {
            const res = await Linking.openURL(`mailto:?body=${fullMsg}`);
            if (res) {
              awardPoint();
            } else {
              toast.error("Could not open Email. Please try again");
            }
          } catch (error) {
            console.error(error);
            toast.error("Could not open Email. Please try again");
          }
        },
      },
      {
        text: "Invite Messenger Friends",
        Icon: MessengerLogoIcon,
        onPress: async () =>
          onShare(Share.Social.MESSENGER as Social, "com.facebook.orca"),
      },
      {
        text: "Invite Whatsapp Friends",
        Icon: WhatsappLogoIcon,
        onPress: async () =>
          onShare(Share.Social.WHATSAPP as Social, "com.whatsapp"),
      },
      {
        text: "Copy link",
        Icon: CopyIcon,
        onPress: async () => {
          try {
            await Clipboard.setStringAsync(fullMsg);
            toast.success("Link copied to clipboard");
          } catch (error) {
            console.error(error);
            toast.error("Could not copy link");
          }
        },
      },
      {
        text: "Share via...",
        Icon: ShareNetworkIcon,
        onPress: async () => {
          try {
            const res = await Share.open({
              message: fullMsg,
              title: "Refer a friend and earn 20 credits",
            });

            if (res.success) {
              awardPoint();
            } else {
              toast.error("Could not share. Please try again");
            }
          } catch {
            // console.log(error);
            // toast.error("Could not share");
          }
        },
      },
    ],
    [onShare, awardPoint]
  );

  return (
    <Screen statusBarStyle="light">
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text className="px-4 py-2">
          Earn <Text className="font-semibold text-accent">20</Text> credits for
          every friend you invite
        </Text>

        <ListGroup variant="transparent">
          {options.map(({ text, Icon: OptionIcon, onPress }, index) => (
            <View key={text}>
              <PressableFeedback animation={false} onPress={onPress}>
                <PressableFeedback.Scale>
                  <ListGroup.Item disabled>
                    <ListGroup.ItemPrefix>
                      <Icon name={OptionIcon} size={22} />
                    </ListGroup.ItemPrefix>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle>{text}</ListGroup.ItemTitle>
                    </ListGroup.ItemContent>
                    <ListGroup.ItemSuffix />
                  </ListGroup.Item>
                </PressableFeedback.Scale>
                <PressableFeedback.Ripple />
              </PressableFeedback>
              {index < options.length - 1 && <Separator className="mx-4" />}
            </View>
          ))}
        </ListGroup>
      </ScrollView>
    </Screen>
  );
};

export default ShareApp;
