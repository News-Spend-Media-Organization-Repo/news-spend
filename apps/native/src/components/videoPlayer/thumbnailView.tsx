import { Play } from "@tamagui/lucide-icons";
import { Circle, Stack } from "tamagui";

import { Image } from "#/components/ui";

export const ThumbnailView = ({ thumbnail, onPress }) => (
  <Stack ai="center" h="100%" jc="center" pos="relative" w="100%">
    <Image
      contentFit="cover"
      source={{ uri: thumbnail }}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 10,
      }}
    />
    <Circle
      aria-label="Play video"
      bg="white"
      onPress={onPress}
      p="$2"
      pos="absolute"
      role="button"
    >
      <Play size={40} />
    </Circle>
  </Stack>
);
