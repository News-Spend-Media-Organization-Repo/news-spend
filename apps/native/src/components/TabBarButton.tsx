import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import type React from "react";
import { Pressable } from "react-native";
import { SizableText } from "tamagui";

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
  // console.log(accessibilityState);
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
      {label !== "Settings" ? (
        <SizableText
          color={accessibilityState?.selected ? "$s50" : "gray"}
          fontSize={12}
          lh={15}
          ta="center"
        >
          {label}
        </SizableText>
      ) : null}
    </Pressable>
  );
}
