import { CheckCircleIcon, MusicNoteIcon } from "phosphor-react-native";
import { useMemo } from "react";
import { ActivityIndicator, RefreshControl, View } from "react-native";
import { Tabs } from "react-native-collapsible-tab";
import { Button } from "#/components/heroui/button";
import { ProgressBar } from "#/components/heroui/progress";
import { Text } from "#/components/heroui/text";
import { usePlayerState } from "#/state/audioPlayerState";
import { useRadioStations } from "./radio-screen";

export const MusicTab = () => {
  const { listeningTime, pointEarnedToday } = usePlayerState();

  const timeInPercentage = useMemo(() => Math.round((listeningTime / 1800) * 100), [listeningTime]);

  const { data, isPending, isError, refetch, isRefetchingByUser, refetchByUser, sections } =
    useRadioStations();

  const refreshControl = useMemo(
    () => <RefreshControl onRefresh={refetchByUser} refreshing={isRefetchingByUser} />,
    [isRefetchingByUser, refetchByUser],
  );

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-5">
        <ActivityIndicator color="#5D3FD3" size="large" />
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-5">
        <Text className="text-center text-base text-red-500">
          Failed to load radio stations. Please check your connection.
        </Text>
        <Button onPress={() => refetch()} size="sm" variant="primary">
          <Button.Label>Retry</Button.Label>
        </Button>
      </View>
    );
  }

  return (
    <Tabs.ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ paddingBottom: 16 }}
      refreshControl={refreshControl}
    >
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
      {sections}
    </Tabs.ScrollView>
  );
};
