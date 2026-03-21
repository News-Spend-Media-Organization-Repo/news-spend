import type { PartnerContent } from "@news-spend-media/payload/types";
import * as Linking from "expo-linking";
import { memo, useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { Stack, Text, XStack, YStack } from "tamagui";

import { Image } from "#/components/ui";
import { getImageData } from "#/utils/getImageData";
import { getCtaLabel } from "#/utils/index";

function NewsItemAds({
  item,
  index,
  fromFallback,
}: {
  item: {
    _type: string;
    id: string;
    payload: PartnerContent;
  };
  index?: number;
  fromFallback?: boolean;
}) {
  const imageData = useMemo(
    () => getImageData(item?.payload?.media),
    [item?.payload?.media]
  );
  const { url, blurhash } = imageData;

  const partnerContent = item.payload;

  // Memoize the link calculation
  const adLink = useMemo(() => getLink(partnerContent), [partnerContent]);

  // Stable onPress callback
  const onPress = useCallback(async () => {
    if (adLink) {
      await Linking.openURL(adLink);
    }
  }, [adLink]);

  // Memoize partner name to prevent recalculation
  const partnerName = useMemo(
    () =>
      typeof partnerContent?.partner === "string"
        ? partnerContent.partner
        : partnerContent?.partner?.companyName,
    [partnerContent?.partner]
  );

  // Memoize CTA label
  const ctaLabel = useMemo(
    () => getCtaLabel(partnerContent?.cta),
    [partnerContent?.cta]
  );

  return (
    <Stack gap="$2.5" onPress={onPress}>
      <XStack gap="$4">
        <Image
          borderRadius={10}
          contentFit="cover"
          h={100}
          placeholder={{
            blurhash,
          }}
          placeholderContentFit="cover"
          recyclingKey={item.id}
          source={url}
          w={100}
        />
        <YStack flex={1} gap="$4" jc="center">
          <XStack jc="space-between">
            <Text color="$p500" fontWeight="700">
              {partnerContent.title}
            </Text>
            <Text
              boc="$gray.50"
              br="$1"
              bw={1}
              color="$s300"
              fos={13}
              h="auto"
              px="$1"
            >
              Ad
            </Text>
          </XStack>
          <Text ellipsizeMode="tail" numberOfLines={2}>
            {partnerContent.condition || ""}
          </Text>
          <XStack alignItems="center" jc="space-between">
            <Text color="$p500">{partnerName}</Text>
            <Text bg="$s300" br="$10" color="white" px="$2" py="$1">
              {ctaLabel}
            </Text>
          </XStack>
        </YStack>
      </XStack>
    </Stack>
  );
}

export default memo(NewsItemAds);

const getLink = (item: PartnerContent | null) => {
  if (!item) {
    return null;
  }
  const url =
    Platform.select({
      ios: item.links?.iosAppStore,
      android: item.links?.androidPlayStore,
    }) ?? item.links?.website;
  return url ?? null;
};
