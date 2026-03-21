import { useMemo } from "react";
import { Paragraph, Progress, Stack, XStack, YStack } from "tamagui";
import { CheckCircleFill, MusicNotesFill } from "tamagui-phosphor";

import { usePlayerState } from "#/state/audioPlayerState";

import { RadioStationsScreen } from "./RadioScreen";

export const MusicTab = () => {
  const { listeningTime, pointEarnedToday } = usePlayerState();

  const timeInPercentage = useMemo(
    () => Math.round((listeningTime / 1800) * 100),
    [listeningTime]
  );

  return (
    <Stack flex={1}>
      <XStack ai="center" bg="$p400" br="$2" gap="$3" m="$2" p="$3">
        {pointEarnedToday ? (
          <CheckCircleFill color="white" />
        ) : (
          <MusicNotesFill color="white" />
        )}
        <YStack flex={1} gap="2">
          <Paragraph color="white" fos={16}>
            Play 30 mins of music today and earn 40 points
          </Paragraph>
          <Progress max={100} size="$3" value={timeInPercentage}>
            <Progress.Indicator animation="slow" bg="$s300" />
          </Progress>
        </YStack>
      </XStack>
      <RadioStationsScreen />
    </Stack>
  );
};
