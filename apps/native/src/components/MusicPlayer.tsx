import { useQuery } from "@tanstack/react-query";
import type { AudioPlaylist } from "expo-audio";
import { useAudioPlaylistStatus } from "expo-audio";
import { useCallback } from "react";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Spinner, Stack, Text, XStack } from "tamagui";
import { PlayFill, SkipBackFill, SkipForwardFill, StopFill } from "tamagui-phosphor";

import { orpc } from "#/lib/orpc";
import {
  getAudioPlaylist,
  playNext,
  playPrevious,
  togglePlayback,
  usePlayerState,
} from "#/state/audioPlayerState";

import { Button, Image } from "./ui";

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
      <XStack ai="center" bg="$p400" btlr="$4" btrr="$4" gap="$3" p="$4">
        <Image
          borderRadius={8}
          h={40}
          source={{
            uri:
              activeTrack.artwork.toString() ||
              `https://placehold.co/100/5D3FD3/fff?text=${activeTrack.name || "Live Radio"}`,
          }}
          w={40}
        />
        <Stack flex={1}>
          <Text color="white" fos="$5" fow="600" numberOfLines={1}>
            {nowPlaying?.title || activeTrack.name || "Live Music"}
          </Text>
          <Text color="rgba(255, 255, 255, 0.8)" fos="$3" numberOfLines={1}>
            {nowPlaying?.artist || activeTrack.genre || "Live Music"}
          </Text>
        </Stack>
        <XStack gap="$2">
          <Button
            bg="rgba(255, 255, 255, 0.2)"
            br={20}
            disabled={!hasPrevious}
            onPress={playPrevious}
            size="$4"
          >
            <Button.Icon color={hasPrevious ? "#fff" : "rgba(255,255,255,0.3)"}>
              <SkipBackFill size={16} />
            </Button.Icon>
          </Button>
          <Button bg="rgba(255, 255, 255, 0.2)" br={20} onPress={togglePlayback} size="$4">
            <Button.Icon color="#fff">
              {(() => {
                if (playbackState.isBuffering) {
                  return <Spinner color="#fff" size="small" />;
                }
                if (playbackState.playing) {
                  return <StopFill color="white" size={16} />;
                }
                return <PlayFill color="#fff" size={16} />;
              })()}
            </Button.Icon>
          </Button>
          <Button
            bg="rgba(255, 255, 255, 0.2)"
            br={20}
            disabled={!hasNext}
            onPress={playNext}
            size="$4"
          >
            <Button.Icon color={hasNext ? "#fff" : "rgba(255,255,255,0.3)"}>
              <SkipForwardFill size={16} />
            </Button.Icon>
          </Button>
        </XStack>
      </XStack>
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
