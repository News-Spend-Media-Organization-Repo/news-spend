import { Skeleton } from "@alloc/moti/skeleton";
import { Stack, useWindowDimensions } from "tamagui";

const VideoNewsItemPlaceholder = () => {
  const { height } = useWindowDimensions();

  return (
    <Stack bg="transparent" h={height * 0.3} mr={25} overflow="hidden" w="100%">
      <Skeleton colorMode="light" height="100%" width="100%" />
    </Stack>
  );
};
export default VideoNewsItemPlaceholder;
