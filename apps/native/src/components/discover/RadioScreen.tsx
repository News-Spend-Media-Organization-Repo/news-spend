import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { Music, X } from "@tamagui/lucide-icons";
import { useQuery } from "@tanstack/react-query";
import type { Station } from "radio-browser-api";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  RefreshControl,
  type ScrollViewProps,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Stack, Text, XStack, YStack } from "tamagui";

import { Button } from "#/components/ui";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";
import { loadTrack, usePlayerState } from "#/state/audioPlayerState";

import { StationItem } from "./RadioStationItem";

// Memoized station item with better comparison

// Ad Popup Component
const AdPopup = memo(
  ({
    visible,
    onClose,
    stationName,
  }: {
    visible: boolean;
    onClose: () => void;
    stationName: string;
  }) => {
    const [countdown, setCountdown] = useState(5);
    const [canClose, setCanClose] = useState(false);
    const { width, height } = Dimensions.get("window");

    useEffect(() => {
      if (!visible) {
        setCountdown(5);
        setCanClose(false);
        return;
      }

      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            setCanClose(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }, [visible]);

    const handleClose = useCallback(() => {
      if (canClose) {
        onClose();
      }
    }, [canClose, onClose]);

    if (!visible) return null;

    return (
      <Modal
        animationType="fade"
        onRequestClose={handleClose}
        transparent
        visible={visible}
      >
        <Stack ai="center" bg="rgba(0,0,0,0.8)" flex={1} jc="center" p={20}>
          <YStack
            bg="white"
            br={16}
            elevation={5}
            p={20}
            pos="relative"
            shadowColor="#000"
            shadowOffset={{ width: 0, height: 2 }}
            shadowOpacity={0.25}
            shadowRadius={8}
            w={Math.min(width - 40, 350)}
          >
            {/* Close button - only show when countdown is done */}
            {canClose && (
              <Button
                bg="rgba(0,0,0,0.1)"
                br={16}
                h={32}
                onPress={handleClose}
                pos="absolute"
                right={10}
                top={10}
                w={32}
                zIndex={1}
              >
                <X color="#666" size={18} />
              </Button>
            )}

            {/* Ad Content */}
            <YStack ai="center" gap={16}>
              <Text color="#333" fos={18} fow="600" ta="center">
                Loading {stationName}...
              </Text>

              {/* Mock Ad Content */}
              <Stack
                ai="center"
                bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                br={12}
                h={200}
                jc="center"
                p={20}
                w="100%"
              >
                <YStack ai="center" gap={12}>
                  <Text color="white" fos={24} fow="bold" ta="center">
                    🎵 Music Pro
                  </Text>
                  <Text color="white" fos={16} ta="center">
                    Discover unlimited music streaming
                  </Text>
                  <Text color="rgba(255,255,255,0.8)" fos={14} ta="center">
                    Ad-free experience • High quality audio
                  </Text>
                </YStack>
              </Stack>

              {/* Countdown and CTA */}
              <YStack ai="center" gap={12} w="100%">
                {canClose ? (
                  <Button
                    bg="#5D3FD3"
                    br={8}
                    h={44}
                    onPress={handleClose}
                    w="100%"
                  >
                    <Button.Text color="white" fow="600">
                      Continue to Station
                    </Button.Text>
                  </Button>
                ) : (
                  <Text color="#666" fos={14} ta="center">
                    Continue in {countdown} seconds...
                  </Text>
                )}

                <Button
                  bg="transparent"
                  boc="#5D3FD3"
                  br={8}
                  bw={1}
                  h={44}
                  onPress={() => {
                    // Handle ad click - could open app store, website, etc.
                    console.log("Ad clicked");
                  }}
                  w="100%"
                >
                  <Button.Text color="#5D3FD3" fow="600">
                    Learn More
                  </Button.Text>
                </Button>
              </YStack>
            </YStack>
          </YStack>
        </Stack>
      </Modal>
    );
  }
);

// Memoized section header to prevent unnecessary re-renders
const SectionHeader = memo(({ title }: { title: string }) => (
  <XStack ai="center" gap="$2" my={10} px={16}>
    <Music color="#5D3FD3" size={18} />
    <Text color="#333" fos={18} fow="600">
      {title}
    </Text>
  </XStack>
));

// Memoized station list to prevent unnecessary re-renders
const StationList = memo(({ stations }: { stations: Station[] }) => {
  const renderStationItem = useCallback(
    ({ item }: LegendListRenderItemProps<Station>) => (
      <StationItem item={item} stationList={stations} />
    ),
    [stations]
  );

  // Memoize the separator component
  const ItemSeparator = useMemo(() => () => <Stack w={16} />, []);

  // Memoize the key extractor
  const keyExtractor = useCallback((item: Station) => item.id, []);

  // Memoize the custom scroll view
  const CustomScrollView = useCallback(
    (props: ScrollViewProps) => <ScrollView {...props} />,
    []
  );

  return (
    <LegendList
      contentContainerStyle={{
        paddingLeft: 16,
        paddingRight: 8,
      }}
      data={stations}
      estimatedItemSize={200}
      horizontal
      ItemSeparatorComponent={ItemSeparator}
      keyExtractor={keyExtractor}
      recycleItems
      renderItem={renderStationItem}
      renderScrollComponent={CustomScrollView}
      showsHorizontalScrollIndicator={false}
      style={{ height: 200 }}
    />
  );
});

export const RadioStationsScreen = () => {
  const playerState = usePlayerState();
  const playingTrack = playerState.currentTrack;
  const playbackState = playerState.playbackState;
  const [showAdPopup, setShowAdPopup] = useState(false);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);

  // Memoize the transform function to prevent recreation
  const transformData = useCallback(
    (
      data: {
        stations: Station[];
        displayName: string;
      }[]
    ) =>
      data?.reduce<(string | Station[])[]>((acc, section) => {
        acc.push(section.displayName);
        acc.push(section.stations);
        return acc;
      }, []),
    []
  );

  const { data, isPending, isError, refetch } = useQuery(
    orpc.radioStation.byGenreGroup.queryOptions({
      select: transformData,
    })
  );

  // Memoize the retry function
  const retryQueries = useCallback(() => {
    if (isError) {
      refetch();
    }
  }, [isError, refetch]);

  // Handle ad popup close and load track
  const handleAdClose = useCallback(() => {
    setShowAdPopup(false);
    if (selectedStation) {
      loadTrack(selectedStation);
      setSelectedStation(null);
    }
  }, [selectedStation]);

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);

  // Memoize the section render function
  const sectionRender = useCallback(
    ({ item }: { item: string | Station[] }) => {
      if (typeof item === "string") {
        return <SectionHeader title={item} />;
      }
      return <StationList stations={item} />;
    },
    [playingTrack, playbackState]
  );

  // Memoize the key extractor for sections
  const sectionKeyExtractor = useCallback((item: string | Station[]) => {
    if (typeof item === "string") {
      return item;
    }
    return item.length > 0 ? `stations-${item[0].id}` : "empty-stations";
  }, []);

  // Memoize the refresh control
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        onRefresh={refetchByUser}
        refreshing={isRefetchingByUser}
      />
    ),
    [isRefetchingByUser, refetchByUser]
  );

  // Memoize the content container style
  const contentContainerStyle = useMemo(() => ({ paddingVertical: 16 }), []);

  if (isPending) {
    return (
      <Stack ai="center" flex={1} jc="center" p={20}>
        <ActivityIndicator color="#5D3FD3" size="large" />
      </Stack>
    );
  }

  if (isError && !data) {
    return (
      <Stack ai="center" flex={1} jc="center" p={20}>
        <Text color="#ff4757" fos={16} ta="center">
          Failed to load radio stations. Please check your connection.
        </Text>
        <Button onPress={retryQueries}>
          <Button.Text>Retry</Button.Text>
        </Button>
      </Stack>
    );
  }

  return (
    <Stack bg="#f8f9fa" flex={1}>
      <LegendList
        contentContainerStyle={contentContainerStyle}
        data={data}
        estimatedItemSize={200}
        keyExtractor={sectionKeyExtractor}
        refreshControl={refreshControl}
        renderItem={sectionRender}
      />

      {/* Ad Popup */}
      <AdPopup
        onClose={handleAdClose}
        stationName={selectedStation?.name || ""}
        visible={showAdPopup}
      />
    </Stack>
  );
};
