import { useNavigation } from "@react-navigation/native";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { ShieldCheckIcon, UserMinusIcon } from "#/lib/icons";

export type CommentsMenuSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function Row({
  icon,
  label,
  description,
  onPress,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      className="flex-row items-center gap-3 rounded-xl px-3 py-3"
      onPress={onPress}
    >
      <View className="size-9 items-center justify-center rounded-full bg-background">
        <Icon color="#00223D" name={icon} size={17} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-semibold text-[15px] text-foreground">
          {label}
        </Text>
        <Text className="text-[#71717A] text-xs">{description}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The comments screen's header menu.
 *
 * Both destinations already exist as routes and are otherwise only reachable
 * from Settings — which is the wrong place for them, since they are what a
 * reader wants while actually looking at comments. Surfacing them here also
 * keeps the moderation affordances one tap from any screen showing
 * user-generated content, which is what the App Store UGC guideline asks for.
 */
export function CommentsMenuSheet({
  open,
  onOpenChange,
}: CommentsMenuSheetProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  /*
   * Both screens are registered in shared-screens and reachable at runtime,
   * but navigate() is typed from the navigator this component happens to sit
   * under, which does not list them — the same mismatch SettingsHome hits
   * reaching BlockedUsers. Narrowed to a plain string call rather than left
   * as a type error.
   */
  const go = navigation.navigate as (screen: string) => void;
  const openGuidelines = () => {
    onOpenChange(false);
    go("CommunityGuidelines");
  };

  const openBlockedUsers = () => {
    onOpenChange(false);
    go("BlockedUsers");
  };

  return (
    <BottomSheet isOpen={open} onOpenChange={onOpenChange}>
      <BottomSheet.Portal disableFullWindowOverlay={__DEV__}>
        <BottomSheet.Overlay />
        <BottomSheet.Content style={{ paddingBottom: insets.bottom }}>
          <View className="gap-1 px-3 pt-3">
            <Row
              description="What's allowed here"
              icon={ShieldCheckIcon}
              label="Community guidelines"
              onPress={openGuidelines}
            />
            <Row
              description="Manage who you've blocked"
              icon={UserMinusIcon}
              label="Blocked users"
              onPress={openBlockedUsers}
            />
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

export default CommentsMenuSheet;
