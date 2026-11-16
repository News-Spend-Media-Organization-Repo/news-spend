import { StackActions, useNavigation } from "@react-navigation/native";
import { Pressable, View } from "react-native";

import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { CaretRightIcon, ShoppingCartIcon, UserIcon } from "#/lib/icons";

/**
 * The overflow destinations. The native tab bar holds five items at most
 * (Android's BottomNavigationView throws on a sixth), so Shop and Me live here.
 * Adding a destination means adding a row, never a tab.
 */
const DESTINATIONS = [
  { label: "Shop", screen: "Shop", icon: ShoppingCartIcon },
  { label: "Me", screen: "Me", icon: UserIcon },
] as const;

/**
 * Content of the More sheet, a root-stack route presented as a native
 * `formSheet` (UISheetPresentationController on iOS, a Material bottom sheet
 * on Android). The More tab itself is never selected: it has
 * `tabBarSelectionEnabled: false`, and its `tabPress` opens this route, so the
 * tab the reader came from stays highlighted underneath.
 */
export function MoreSheet() {
  const navigation = useNavigation();

  return (
    <View className="gap-1 px-2 pt-6 pb-safe-offset-4">
      <Text accessibilityRole="header" className="px-3 pb-2 font-bold text-lg">
        More
      </Text>
      {DESTINATIONS.map(({ label, screen, icon }) => (
        <Pressable
          accessibilityRole="button"
          className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-p-500/10"
          key={screen}
          onPress={() => {
            // One action: swap the sheet for the destination, so it lands on
            // the tabs and back returns there, not to a reopened sheet.
            // goBack() then navigate() does not work: once the sheet is
            // popped, its navigation object belongs to a removed route.
            navigation.dispatch(StackActions.replace(screen));
          }}
        >
          <Icon className="text-p-500" name={icon} size={22} weight="bold" />
          <Text className="flex-1 text-base">{label}</Text>
          <Icon color="#9CA3AF" name={CaretRightIcon} size={18} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Placeholder body for the More tab. `tabBarSelectionEnabled: false` keeps the
 * tab from ever being shown; the navigator still needs a component for it.
 */
export function MoreTabPlaceholder() {
  return null;
}
