import type { Partner } from "@news-spend-media/payload/types";
import { useNavigation } from "@react-navigation/native";
import { HeartIcon } from "phosphor-react-native";
import { Card, Paragraph, Separator, Stack, XStack } from "tamagui";

import { Image } from "#/components/ui";
import { Button } from "#/components/ui/Button";
import { useFavoriteStores } from "#/state/favoriteStoreState";
import { getImageData } from "#/utils/getImageData";

export default function ShopItem({ item }: { item: Partial<Partner> }) {
  const { isFavorite, toggleFavoriteStore } = useFavoriteStores();
  const navigation = useNavigation("ShopHome");

  const isStoreFavorite = isFavorite(item.id ?? "");
  const { url, blurhash } = getImageData(item.logo);

  return (
    <Card bordered gap="$2" py="$2">
      <XStack ai="center" jc="space-between" px="$2">
        <Stack h={50} w={75}>
          <Image
            br="$2"
            contentFit="scale-down"
            height="100%"
            placeholder={{ blurhash }}
            placeholderContentFit="contain"
            source={url}
            width="100%"
          />
        </Stack>

        <XStack ai="center">
          <Button ghost onPress={() => toggleFavoriteStore(item)}>
            <Button.Icon color="red">
              <HeartIcon
                color="red"
                size={24}
                weight={isStoreFavorite ? "fill" : "regular"}
              />
            </Button.Icon>
          </Button>
          <Button
            height="100%"
            onPress={() =>
              navigation.navigate("ShopDetails", {
                slug: item.slug!,
                id: item.id,
              })
            }
            outlined
            px="$4"
            py="$1.5"
          >
            <Button.Text color="$p500">Shop</Button.Text>
          </Button>
        </XStack>
      </XStack>
      <Separator />
      <XStack jc="space-between" px="$2">
        <Paragraph>{item.cashBack}% Cash Back</Paragraph>
        <Paragraph>{item.cashBack} pt/₦</Paragraph>
      </XStack>
    </Card>
  );
}
