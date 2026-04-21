import { Play } from "@tamagui/lucide-icons";
import { useAudioPlaylistStatus } from "expo-audio";
import type { Station } from "radio-browser-api";
import { memo, useCallback, useMemo, useRef } from "react";
import { Spinner, Stack, Text } from "tamagui";
import { Stop } from "tamagui-phosphor";

import { Button, Image } from "#/components/ui";
import { isAdReady } from "#/state/adManager";
import { appOpenAdSheetState } from "#/state/appOpenAdState";
import { getAudioPlaylist, loadTrack, usePlayerState } from "#/state/audioPlayerState";

export const StationItem = memo(
  ({ item, stationList }: { item: Station; stationList?: Station[] }) => {
    const audioPlayer = getAudioPlaylist();
    const playerState = usePlayerState();
    const activeTrack = playerState.currentTrack;
    const playbackState = useAudioPlaylistStatus(audioPlayer!);
    const isActive = activeTrack?.id === item?.id;

    const placeholderRef = useRef<string>("");
    if (!placeholderRef.current) {
      placeholderRef.current = `https://placehold.co/100/5D3FD3/fff?text=${encodeURIComponent(item.name ?? "Music")}`;
    }

    const handlePress = useCallback(() => {
      if (activeTrack?.id === item.id && playbackState.playing) {
        audioPlayer?.pause();
      } else {
        loadTrack(item, stationList);
        if (
          activeTrack?.id !== item.id &&
          (isAdReady("discover-tab") || appOpenAdSheetState.nativeAdReady)
        ) {
          appOpenAdSheetState.open("discover-tab");
        }
      }
    }, [activeTrack, playbackState, audioPlayer, stationList, item]);

    const tagsString = useMemo(() => item.tags.join(", ") || "Unknown", [item.tags]);

    const statusIcon = useMemo(() => {
      if (!isActive) {
        return null;
      }

      if (playbackState.isBuffering) {
        return <Spinner color="#fff" size="small" />;
      }

      if (playbackState.playing) {
        return <Stop color="#fff" size={16} />;
      }

      return <Play color="#fff" size={16} />;
    }, [isActive, playbackState]);

    const statusBgColor = useMemo(() => {
      if (!isActive) {
        return;
      }
      return playbackState.playing ? "#4CAF50" : "#5D3FD3";
    }, [isActive, playbackState]);

    return (
      <Button
        bg="white"
        br={12}
        fd="column"
        h={200}
        p={10}
        w={140}
        {...(isActive && { boc: "#5D3FD3", bw: 2 })}
        onPress={handlePress}
      >
        <Image
          als="center"
          bg="#f0f0f0"
          br={999}
          contentFit="cover"
          h={70}
          placeholder={placeholderRef.current}
          source={{ uri: item.favicon || placeholderRef.current }}
          w={70}
        />
        <Text color="#333" fontWeight="600" numberOfLines={1}>
          {item.name}
        </Text>
        <Text color="#777" fos={12} numberOfLines={1}>
          {tagsString}
        </Text>
        {isActive ? (
          <Stack
            alignItems="center"
            bg={statusBgColor}
            br={12}
            height={24}
            justifyContent="center"
            pos="absolute"
            right={8}
            top={8}
            width={24}
          >
            {statusIcon}
          </Stack>
        ) : null}
      </Button>
    );
  },
);
