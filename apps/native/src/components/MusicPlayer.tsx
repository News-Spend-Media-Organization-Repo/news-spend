import { useQuery } from "@tanstack/react-query";
import type { AudioPlaylist } from "expo-audio";
import { useAudioPlaylistStatus } from "expo-audio";
import { PlayIcon, SkipBackIcon, SkipForwardIcon, StopIcon } from "phosphor-react-native";
import { useCallback } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Button } from "#/components/heroui/button";
import { Image } from "#/components/heroui/image";
import { orpc } from "#/lib/orpc";
import {
  getAudioPlaylist,
  playNext,
  playPrevious,
  togglePlayback,
  usePlayerState,
} from "#/state/audioPlayerState";
import { Icon } from "./heroui/icon";

type MusicPlayerContentProps = {
  audioPlayer: AudioPlaylist;
};

const MusicPlayerContent = ({ audioPlayer }: MusicPlayerContentProps) => {
  const playerState = usePlayerState();
  const activeTrack = playerState.currentTrack;
  const playbackState = useAudioPlaylistStatus(audioPlayer);
  const hasNext = playerState.hasNext;
  const hasPrevious = playerState.hasPrevious;

  const queryOptions = orpc.radioStation.getStreamMetadata.queryOptions({
    input: {
      streamUrl: activeTrack?.url ?? "",
    },
    refetchInterval: 3 * 10_000,
    enabled: !!activeTrack?.url && playbackState.playing,
    select: useCallback(
      (data: { metadata: Record<string, unknown> | null; success: boolean }) => {
        const rawTitle = data?.metadata?.title as string | undefined;
        const parts = rawTitle?.split(" - ") ?? [];

        let title: string | undefined;
        let artist: string | undefined;

        if (parts.length >= 2) {
          title = parts[1];
          artist = parts[0];
        } else if (parts.length === 1) {
          title = parts[0];
        }

        return {
          title: title || activeTrack?.name || "Live Radio",
          artist: artist || activeTrack?.genre || "Streaming",
        };
      },
      [activeTrack?.name, activeTrack?.genre],
    ),
  });

  const { data: nowPlaying } = useQuery(queryOptions);

  if (!activeTrack) {
    return null;
  }

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut}>
      <View
        className="flex-row items-center gap-3 rounded-t-xl p-4"
        style={{ backgroundColor: "#002846" }}
      >
        <Image
          source={{
            uri:
              activeTrack.artwork.toString() ||
              `https://placehold.co/100/5D3FD3/fff?text=${activeTrack.name || "Live Radio"}`,
          }}
          style={{
            borderRadius: 8,
            height: 40,
            width: 40,
          }}
        />
        <View className="flex-1">
          <Text className="font-semibold text-base text-white" numberOfLines={1}>
            {nowPlaying?.title || activeTrack.name || "Live Music"}
          </Text>
          <Text className="text-sm" numberOfLines={1} style={{ color: "rgba(255, 255, 255, 0.8)" }}>
            {nowPlaying?.artist || activeTrack.genre || "Live Music"}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Button
            className="rounded-[20px]"
            isDisabled={!hasPrevious}
            onPress={playPrevious}
            size="sm"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
          >
            <Icon
              color={hasPrevious ? "#fff" : "rgba(255,255,255,0.3)"}
              name={SkipBackIcon}
              size={16}
              weight="fill"
            />
          </Button>
          <Button
            className="rounded-[20px]"
            onPress={togglePlayback}
            size="sm"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
          >
            {(() => {
              if (playbackState.isBuffering) {
                return <ActivityIndicator color="#fff" size="small" />;
              }
              if (playbackState.playing) {
                return <Icon color="white" name={StopIcon} size={16} weight="fill" />;
              }
              return <Icon color="#fff" name={PlayIcon} size={16} weight="fill" />;
            })()}
          </Button>
          <Button
            className="rounded-[20px]"
            isDisabled={!hasNext}
            onPress={playNext}
            size="sm"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
          >
            <Icon
              color={hasNext ? "#fff" : "rgba(255,255,255,0.3)"}
              name={SkipForwardIcon}
              size={16}
              weight="fill"
            />
          </Button>
        </View>
      </View>
    </Animated.View>
  );
};

const MusicPlayer = () => {
  const { isReady } = usePlayerState();
  const audioPlayer = getAudioPlaylist();

  if (!(isReady && audioPlayer)) {
    return null;
  }

  return <MusicPlayerContent audioPlayer={audioPlayer} />;
};

export default MusicPlayer;
