import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import {
  type InfiniteData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeftIcon, HeartIcon } from "phosphor-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Platform, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import {
  Paragraph,
  Separator,
  SizableText,
  Spinner,
  Square,
  Stack,
  Text,
  XStack,
} from "tamagui";

import { ScreenHeader } from "#/components";
import { Screen } from "#/components/Screen";
import { Button } from "#/components/ui/Button";
import { orpc, type RouterOutputs } from "#/lib/orpc";
import { useFavoriteStores } from "#/state/favoriteStoreState";

const ShopDetails = () => {
  const route = useRoute();
  const { slug, id: storeId } = route.params as { slug: string; id: string };
  const navigation = useNavigation();
  const [openShop, setOpenShop] = useState(false);
  const queryClient = useQueryClient();
  const { toggleFavoriteStore, isFavorite } = useFavoriteStores();

  const { data: store } = useQuery(
    orpc.store.one.queryOptions({
      input: { slug },
      initialData: () => {
        const qKey = orpc.store.all.infiniteKey({
          input: (pageParam: number | undefined) => ({
            page: pageParam,
            limit: 12,
            sortBy: "newest",
          }),
          initialPageParam: undefined,
        });
        const cacheData =
          queryClient.getQueryData<InfiniteData<RouterOutputs["store"]["all"]>>(
            qKey
          );
        return cacheData?.pages
          .flatMap((page) => page.docs)
          ?.find((s) => s.slug === slug);
      },
      initialDataUpdatedAt: () => {
        const qKey = orpc.store.all.infiniteKey({
          input: (pageParam: number | undefined) => ({
            page: pageParam,
            limit: 12,
            sortBy: "newest",
          }),
          initialPageParam: undefined,
        });
        return queryClient.getQueryState(qKey)?.dataUpdatedAt;
      },
    })
  );

  const trackViewMutation = useMutation(orpc.store.trackView.mutationOptions());

  const trackClickMutation = useMutation(
    orpc.store.trackClick.mutationOptions()
  );

  useEffect(() => {
    if (storeId || store?.id) {
      trackViewMutation.mutate({
        storeId: storeId || store?.id || "",
        platform: Platform.OS === "ios" ? "ios" : "android",
        device: "mobile",
      });
    }
  }, [storeId, store?.id]);

  const isStoreFavorite = isFavorite(store?.id ?? "");

  const webViewRef = useRef<
    WebView & {
      canGoBack: boolean;
    }
  >(null);

  const onAndroidBackPress = useCallback(() => {
    if (webViewRef.current?.canGoBack) {
      webViewRef.current.goBack();
      return true;
    }
    return false;
  }, []);

  useFocusEffect(
    useCallback(() => {
      let subscription: ReturnType<typeof BackHandler.addEventListener>;

      if (Platform.OS === "android") {
        subscription = BackHandler.addEventListener(
          "hardwareBackPress",
          onAndroidBackPress
        );
      }

      return () => {
        if (Platform.OS === "android" && subscription) {
          subscription.remove();
        }
      };
    }, [onAndroidBackPress])
  );

  const handleShopNow = useCallback(() => {
    trackClickMutation.mutate({
      storeId: storeId || store?.id || "",
      platform: Platform.OS === "ios" ? "ios" : "android",
      device: "mobile",
    });
    setOpenShop(true);
  }, []);

  if (openShop) {
    return (
      <Screen safeAreaEdges={["bottom"]}>
        <ScreenHeader
          left={
            <Stack
              borderColor="$background"
              jc="center"
              onPress={() => navigation.goBack()}
              px="$2"
            >
              <ArrowLeftIcon color="#fff" size={24} />
            </Stack>
          }
          right={
            <Button ghost onPress={() => toggleFavoriteStore(store!)}>
              <Button.Icon color="red">
                <HeartIcon
                  color="$p500"
                  size={24}
                  weight={isStoreFavorite ? "fill" : "regular"}
                />
              </Button.Icon>
            </Button>
          }
          title={store?.companyName || ""}
        />

        <WebView
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          onNavigationStateChange={(navState) => {
            if (webViewRef.current) {
              webViewRef.current.canGoBack = navState.canGoBack;
            }
          }}
          onShouldStartLoadWithRequest={() => true}
          pullToRefreshEnabled
          ref={webViewRef}
          renderLoading={() => (
            <Stack
              ai="center"
              bg="rgba(0, 0, 0, 0.5)"
              flex={1}
              jc="center"
              position="absolute"
              style={StyleSheet.absoluteFill}
            >
              <Spinner color="$background" size="large" />
            </Stack>
          )}
          source={{ uri: store?.websiteUrl ?? "" }}
          startInLoadingState
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        left={
          <Stack
            borderColor="$background"
            jc="center"
            onPress={() => navigation.goBack()}
            px="$2"
          >
            <ArrowLeftIcon color="#fff" size={24} />
          </Stack>
        }
        right={
          <Button ghost onPress={() => toggleFavoriteStore(store!)}>
            <Button.Icon color="red">
              <HeartIcon
                color="$p500"
                size={24}
                weight={isFavorite ? "fill" : "regular"}
              />
            </Button.Icon>
          </Button>
        }
        title={store?.companyName || ""}
      />

      <Stack p="$2">
        <Square alignSelf="flex-start" bg="green" borderRadius="$2" px="$4">
          <SizableText color="$background" fos="$3">
            Online
          </SizableText>
        </Square>
        <XStack ai="center" jc="space-between">
          <Text fos="$7" fow="700">
            <Text color="green" fos="$11" fow="700">
              {store?.cashBack}%
            </Text>
            Cash Back
          </Text>

          <Button borderRadius={100_000} onPress={handleShopNow} px="$5">
            <Button.Text>Shop Now</Button.Text>
          </Button>
        </XStack>
      </Stack>

      <Separator />

      <Stack px="$2">
        <Paragraph fos="$5" fow="700">
          Get {store?.cashBack} pt/₦ on every purchase
        </Paragraph>
        <Paragraph>{store?.description}</Paragraph>
      </Stack>
    </Screen>
  );
};

export default ShopDetails;
