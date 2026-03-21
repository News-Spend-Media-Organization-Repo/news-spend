import { useNavigation } from "@react-navigation/native";
import type { ReactNode } from "react";
import { Paragraph, Stack, XStack } from "tamagui";
import { ArrowLeft } from "tamagui-phosphor";

import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

type ScreenHeaderProps = {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
};

const ScreenHeader = ({ title, left, right }: ScreenHeaderProps) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsetsStyle(["top"]);

  return (
    <XStack
      ai="center"
      bg="$p500"
      jc="center"
      pos="relative"
      px="$3"
      py="$2"
      style={insets}
      width="100%"
    >
      {/* Left Item */}
      <Stack ai="center" jc="center" px="$2" style={{ minWidth: 40 }}>
        {left !== undefined ? (
          left
        ) : (
          <ArrowLeft
            color="$background"
            onPress={() => navigation.goBack()}
            size={24}
          />
        )}
      </Stack>
      {/* Title */}
      <Stack ai="center" flex={1} jc="center">
        <Paragraph color="$background" textTransform="capitalize">
          {title}
        </Paragraph>
      </Stack>
      {/* Right Item */}
      <Stack ai="center" jc="center" px="$2" style={{ minWidth: 40 }}>
        {right}
      </Stack>
    </XStack>
  );
};

export default ScreenHeader;
