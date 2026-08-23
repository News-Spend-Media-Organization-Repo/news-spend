import { useQuery } from "@tanstack/react-query";
import type { AudioPlayer } from "expo-audio";
import { useAudioPlayerStatus } from "expo-audio";
import {
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  XIcon,
} from "#/lib/icons";
import { useCallback } from "react";
import { ActivityIndicator, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { orpc } from "#/lib/orpc";
import {
  getAudioPlaylist,
  playNext,
  playPrevious,
  releaseAudioPlaylist,
  togglePlayback,
  usePlayerState,
} from "#/state/audioPlayerState";
import { Icon } from "./heroui/icon";
import { Button, Image, Text } from "./ui";

const DISMISS_THRESHOLD = 80;
const DISMISS_OFFSET = 220;

type MusicPlayerContentProps = {
  audioPlayer: AudioPlayer;
  onClose: () => void;
};

const MusicPlayerContent = ({
  audioPlayer,
  onClose,
}: MusicPlayerContentProps) => {
  const playerStateSnapshot = usePlayerState();
  const activeTrack = playerStateSnapshot.currentTrack;
  const playbackState = useAudioPlayerStatus(audioPlayer);
  const hasNext = playerStateSnapshot.hasNext;
  const hasPrevious = playerStateSnapshot.hasPrevious;

  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetY([-20, 20])
    .onUpdate((event) => {
      if (event.translationY < 0) {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        return;
      }
      translateY.value = event.translationY;
      opacity.value = Math.max(0, 1 - event.translationY / DISMISS_OFFSET);
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD) {
        translateY.value = withTiming(DISMISS_OFFSET, { duration: 220 });
        opacity.value = withTiming(0, { duration: 220 }, (finished) => {
          if (finished) {
            scheduleOnRN(onClose);
          }
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        opacity.value = withSpring(1, { damping: 20, stiffness: 200 });
      }
    });

  const queryOptions = orpc.radioStation.getStreamMetadata.queryOptions({
    input: {
      streamUrl: activeTrack?.url ?? "",
    },
    refetchInterval: 3 * 10_000,
    enabled: !!activeTrack?.url && playbackState.playing,
    select: useCallback(
      (data: {
        metadata: Record<string, unknown> | null;
        success: boolean;
      }) => {
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
      [activeTrack?.name, activeTrack?.genre]
    ),
  });

  const { data: nowPlaying } = useQuery(queryOptions);

  if (!activeTrack) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      // style={animatedStyle}
    >
      {/*<GestureDetector gesture={panGesture}>
        <View>*/}
      <View className="flex-row items-center gap-3 rounded-t-xl bg-p-500 p-4">
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
          <Text
            className="font-semibold text-base text-white"
            numberOfLines={1}
          >
            {nowPlaying?.title || activeTrack.name || "Live Music"}
          </Text>
          <Text
            className="text-sm"
            numberOfLines={1}
            style={{ color: "rgba(255, 255, 255, 0.8)" }}
          >
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
                return (
                  <Icon
                    color="white"
                    name={PauseIcon}
                    size={16}
                    weight="fill"
                  />
                );
              }
              return (
                <Icon color="#fff" name={PlayIcon} size={16} weight="fill" />
              );
            })()}
          </Button>
          <Button
            className="rounded-[20px]"
            isDisabled={!hasNext}
            isIconOnly
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
          <Button
            accessibilityLabel="Close player"
            className="rounded-[20px]"
            isIconOnly
            onPress={onClose}
            size="sm"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
          >
            <Icon color="#fff" name={XIcon} size={16} weight="bold" />
          </Button>
        </View>
      </View>
      {/*</View>
      </GestureDetector>*/}
    </Animated.View>
  );
};

const MusicPlayer = () => {
  const { isReady } = usePlayerState();
  const audioPlayer = getAudioPlaylist();

  if (!(isReady && audioPlayer)) {
    return null;
  }

  return (
    <MusicPlayerContent
      audioPlayer={audioPlayer}
      onClose={releaseAudioPlaylist}
    />
  );
};

export default MusicPlayer;
