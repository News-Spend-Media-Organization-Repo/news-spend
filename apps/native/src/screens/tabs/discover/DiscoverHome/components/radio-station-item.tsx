import { useAudioPlaylistStatus } from "expo-audio";
import { cn } from "heroui-native";
import { PauseIcon, PlayIcon } from "phosphor-react-native";
import type { Station } from "radio-browser-api";
import { type ReactNode, useCallback, useRef } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { Image } from "#/components/ui";
import { isAdReady, shouldShowNewsClickAd } from "#/state/adManager";
import { appOpenAdSheetState } from "#/state/appOpenAdState";
import {
  getAudioPlaylist,
  loadTrack,
  togglePlayback,
  usePlayerState,
} from "#/state/audioPlayerState";

export const StationItem = ({
  item,
  stationList,
}: {
  item: Station;
  stationList?: Station[];
}) => {
  const audioPlayer = getAudioPlaylist();
  const { currentTrack } = usePlayerState();
  const isActive = currentTrack?.id === item?.id;

  const placeholderRef = useRef<string>("");
  if (!placeholderRef.current) {
    placeholderRef.current = `https://placehold.co/100/5D3FD3/fff?text=${encodeURIComponent(item.name ?? "Music")}`;
  }

  const handlePress = useCallback(() => {
    if (isActive && audioPlayer) {
      togglePlayback();
    } else {
      loadTrack(item, stationList);
      if (
        shouldShowNewsClickAd() &&
        (isAdReady("discover-tab") || appOpenAdSheetState.nativeAdReady)
      ) {
        appOpenAdSheetState.open("discover-tab");
      }
    }
  }, [isActive, audioPlayer, stationList, item]);

  const tagsString = item.tags.join(", ") || "Unknown";

  return (
    <Pressable
      className={cn(
        "w-35 gap-2 rounded-lg border-2 border-transparent p-2",
        isActive && "border-p-200"
      )}
      onPress={handlePress}
    >
      <Image
        className="size-17.5 self-center rounded-full bg-gray-100"
        contentFit="cover"
        source={{ uri: item.favicon || placeholderRef.current }}
      />
      <View className="gap-1">
        <Text
          className="text-center font-semibold text-gray-800 text-sm"
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text className="text-center text-gray-500 text-xs" numberOfLines={1}>
          {tagsString}
        </Text>
      </View>
      {isActive && audioPlayer ? (
        <ActiveStationIndicator audioPlayer={audioPlayer} />
      ) : null}
    </Pressable>
  );
};

const ActiveStationIndicator = ({
  audioPlayer,
}: {
  audioPlayer: NonNullable<ReturnType<typeof getAudioPlaylist>>;
}) => {
  const playbackState = useAudioPlaylistStatus(audioPlayer);

  let icon: ReactNode = <Icon color="#fff" name={PlayIcon} size={12} />;
  if (playbackState.isBuffering) {
    icon = <ActivityIndicator color="#fff" size="small" />;
  } else if (playbackState.playing) {
    icon = <Icon color="#fff" name={PauseIcon} size={12} />;
  }

  const bgColor = playbackState.playing ? "#4CAF50" : "#5D3FD3";

  return (
    <View
      className="absolute top-2 right-2 size-6 items-center justify-center rounded-xl"
      style={{ backgroundColor: bgColor }}
    >
      {icon}
    </View>
  );
};
