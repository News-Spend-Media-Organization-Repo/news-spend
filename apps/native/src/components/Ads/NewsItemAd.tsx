import type { PartnerContent } from "@news-spend-media/payload/types";
import * as Linking from "expo-linking";
import { memo, useCallback, useMemo } from "react";
import { Platform, Pressable, View } from "react-native";

import { getImageData } from "#/utils/getImageData";
import { getCtaLabel } from "#/utils/index";
import { Image } from "../heroui/image";
import { Text } from "../heroui/text";

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
    <Pressable className="gap-2.5" onPress={onPress}>
      <View className="flex-row gap-4">
        <Image
          className="size-25 rounded-[10px]"
          contentFit="cover"
          placeholder={{
            blurhash,
          }}
          placeholderContentFit="cover"
          recyclingKey={item.id}
          source={url}
        />
        <View className="flex-1 justify-center gap-4">
          <View className="flex-row justify-between">
            <Text className="font-bold text-p-500">{partnerContent.title}</Text>
            <Text className="rounded-sm border border-gray-50 px-1 text-s-300">
              Ad
            </Text>
          </View>
          <Text ellipsizeMode="tail" numberOfLines={2}>
            {partnerContent.condition || ""}
          </Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-p-500">{partnerName}</Text>
            <Text className="rounded-full bg-s-300 px-2 py-1 text-white text-xs">
              {ctaLabel}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default memo(NewsItemAds);

const getLink = (item: PartnerContent | null) => {
  if (!item) {
    return null;
  }

  const { iosAppStore, androidPlayStore, website } = item.links ?? {};

  const platformUrl = Platform.select({
    ios: iosAppStore,
    android: androidPlayStore,
  });

  return platformUrl || website || null;
};
