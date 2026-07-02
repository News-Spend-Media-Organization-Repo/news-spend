import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import type React from "react";
import { Pressable, Text } from "react-native";

type Props = BottomTabBarButtonProps & {
  label?: string;
  Icon?:
    | React.NamedExoticComponent<any>
    | ((props: {
        focused: boolean;
        color: string;
        size: number;
      }) => React.ReactNode)
    | undefined;
};

export default function TabBarButton(props: Props) {
  const { onPress, accessibilityState, label, Icon } = props;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {Icon && (
        <Icon
          color={accessibilityState?.selected ? "#fff" : "gray"}
          size={label === "Settings" ? 56 : 25}
          style={{
            alignSelf: "center",
          }}
        />
      )}
      {label === "Settings" ? null : (
        <Text
          style={{
            color: accessibilityState?.selected ? "#fff" : "gray",
            fontSize: 12,
            lineHeight: 15,
            textAlign: "center",
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
