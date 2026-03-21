import { Skeleton } from "@alloc/moti/skeleton";
import { Stack, useWindowDimensions } from "tamagui";

export default function TrendingNewsPlaceholder() {
  const { width, height } = useWindowDimensions();

  return (
    <Stack height={height * 0.33} mr={25} width={width * 0.78}>
      <Skeleton colorMode="light" height="100%" width="100%" />
    </Stack>
  );
}
