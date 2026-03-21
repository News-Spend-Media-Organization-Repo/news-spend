import { Skeleton } from "@alloc/moti/skeleton";
import { Stack, XStack, YStack } from "tamagui";

export default function NewsItemPlaceholder({
  show,
  latest,
}: {
  show: boolean;
  latest?: boolean;
}) {
  return (
    <Skeleton.Group show>
      <Stack gap="$2.5">
        <XStack gap="$4">
          <Skeleton colorMode="light" height={100} radius={10} width={100} />

          {/* <Skeleton> */}
          <YStack
            flex={1}
            gap={latest ? 0 : "$4"}
            jc={latest ? "space-between" : "center"}
          >
            {latest && (
              <Skeleton
                colorMode="light"
                height={20}
                radius="square"
                width={100}
              />
            )}

            <Skeleton
              colorMode="light"
              height={40}
              radius="square"
              width="100%"
            />

            <Skeleton
              colorMode="light"
              height={20}
              radius="square"
              width="100%"
            />
          </YStack>
        </XStack>
      </Stack>
    </Skeleton.Group>
  );
}
