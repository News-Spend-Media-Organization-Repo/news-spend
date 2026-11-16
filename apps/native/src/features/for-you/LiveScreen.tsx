import { useQuery } from "@tanstack/react-query";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { orpc, type RouterOutputs } from "#/lib/orpc";

function secureStreamUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

type LiveStateProps = {
  data: RouterOutputs["forYou"]["live"] | undefined;
  pending: boolean;
  failed: boolean;
  streamUrl: string | null;
  status: string;
  error: unknown;
  player: ReturnType<typeof useVideoPlayer>;
  retry: () => void;
};

function LiveState({
  data,
  pending,
  failed,
  streamUrl,
  status,
  error,
  player,
  retry,
}: LiveStateProps) {
  if (pending) {
    return (
      <View className="gap-3 rounded-2xl bg-surface p-5">
        <ActivityIndicator accessibilityLabel="Checking live broadcast" />
        <Text>Checking for a live broadcast…</Text>
      </View>
    );
  }
  if (failed) {
    return (
      <View className="gap-3 rounded-2xl bg-surface p-5">
        <Text className="font-bold text-lg">Live is unavailable</Text>
        <Text>
          We couldn't reach the broadcast settings. Check your connection and
          try again.
        </Text>
        <Pressable
          accessibilityRole="button"
          className="self-start rounded-xl bg-p-500 px-4 py-3"
          onPress={retry}
        >
          <Text className="font-bold text-white">Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (!data?.enabled) {
    return (
      <View className="gap-3 rounded-2xl bg-surface p-5">
        <Text className="font-bold text-lg">No broadcast right now</Text>
        <Text>
          {data?.description ||
            "There isn't a live broadcast available at the moment. Check back later."}
        </Text>
      </View>
    );
  }
  if (!streamUrl) {
    return (
      <View className="gap-3 rounded-2xl bg-surface p-5">
        <Text className="font-bold text-lg">Stream unavailable</Text>
        <Text>
          The broadcast is enabled, but no secure stream is available. Please
          check back later.
        </Text>
      </View>
    );
  }
  if (status === "error" || error) {
    return (
      <View className="gap-3 rounded-2xl bg-surface p-5">
        <Text className="font-bold text-lg">The stream didn't load</Text>
        <Text>
          The configured broadcast couldn't be played. Try again in a moment.
        </Text>
        <Pressable
          accessibilityRole="button"
          className="self-start rounded-xl bg-p-500 px-4 py-3"
          onPress={retry}
        >
          <Text className="font-bold text-white">Retry stream</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View className="gap-3">
      <Text className="font-bold text-xl">
        {data.title || "NewsSpend Live"}
      </Text>
      {data.description ? (
        <Text className="text-muted">{data.description}</Text>
      ) : null}
      <VideoView
        accessibilityLabel="NewsSpend live video"
        contentFit="contain"
        nativeControls
        player={player}
        style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 16 }}
      />
      <Text className="text-muted text-sm">
        Live video is provided by the configured broadcast source.
      </Text>
    </View>
  );
}

export default function LiveScreen() {
  const live = useQuery(orpc.forYou.live.queryOptions());
  const streamUrl = secureStreamUrl(live.data?.streamUrl ?? null);
  const player = useVideoPlayer(null);
  const { status, error } = useEvent(player, "statusChange", {
    status: player.status,
    error: undefined,
  });

  useEffect(() => {
    if (!(live.data?.enabled && streamUrl)) {
      return;
    }
    let active = true;
    player
      .replaceAsync({ uri: streamUrl })
      .then(() => {
        if (active) {
          player.play();
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
      player.pause();
    };
  }, [live.data?.enabled, player, streamUrl]);

  return (
    <Screen safeAreaEdges={["top"]}>
      <View className="flex-1 gap-5 px-4 py-5">
        <View className="gap-2">
          <Text className="font-bold text-2xl">Live</Text>
          <Text className="text-muted">
            NewsSpend's live stream, when a broadcast is configured.
          </Text>
        </View>
        <LiveState
          data={live.data}
          error={error}
          failed={live.isError}
          pending={live.isPending}
          player={player}
          retry={() => {
            if (live.isError || !streamUrl) {
              live.refetch();
              return;
            }
            player
              .replaceAsync({ uri: streamUrl })
              .then(() => player.play())
              .catch(() => undefined);
          }}
          status={status}
          streamUrl={streamUrl}
        />
      </View>
    </Screen>
  );
}
