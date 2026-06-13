import { CheckCircleIcon, MusicNoteIcon } from "phosphor-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { ProgressBar } from "#/components/heroui/progress";
import { Text } from "#/components/heroui/text";
import { usePlayerState } from "#/state/audioPlayerState";
import { RadioStationsScreen } from "./radio-screen";

export const MusicTab = () => {
  const { listeningTime, pointEarnedToday } = usePlayerState();

  const timeInPercentage = useMemo(() => Math.round((listeningTime / 1800) * 100), [listeningTime]);

  return (
    <View className="flex-1">
      <View className="m-2 flex-row items-center gap-3 rounded-lg bg-p-400 p-3">
        {pointEarnedToday ? (
          <CheckCircleIcon color="white" size={24} weight="fill" />
        ) : (
          <MusicNoteIcon color="white" size={24} weight="fill" />
        )}
        <View className="flex-1 gap-2">
          <Text className="text-white">Play 30 mins of music today and earn 40 points</Text>
          <ProgressBar value={timeInPercentage}>
            <ProgressBar.Track className="h-2 rounded-full bg-default">
              <ProgressBar.Fill className="rounded-full bg-s-200" />
            </ProgressBar.Track>
          </ProgressBar>
        </View>
      </View>
      <RadioStationsScreen />
    </View>
  );
};
