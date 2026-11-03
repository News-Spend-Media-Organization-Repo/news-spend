import type { StaticScreenProps } from "@react-navigation/native";
import { StackActions, useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSnapshot } from "valtio";
import { ScreenHeader } from "#/components";
import DateOfBirthDialog from "#/components/dialogs/DateOfBirthDialog";
import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { findGame, GAMES_MIN_AGE, gamePlayUrl } from "#/features/games/catalog";
import { type GameGate, gateFor } from "#/features/games/gate";
import { trackDiscover } from "#/lib/discoverAnalyticsClient";
import { orpc } from "#/lib/orpc";
import { authState } from "#/state/auth";

export type GameLauncherParams = {
  /** The game's slug: the last part of its universal link. */
  namespace: string;
  /** Where it was opened from; a link carries none. */
  source?: "all" | "games";
};

const MESSAGES: Partial<Record<GameGate, { title: string; body: string }>> = {
  "unknown-game": {
    title: "Game not available",
    body: "This game is no longer in the app. You can find the current games in Discover.",
  },
  "too-young": {
    title: "Games are for ages 16 and over",
    body: `Based on the date of birth on your account, games are not available to you yet. They open up on your ${GAMES_MIN_AGE}th birthday.`,
  },
};

/**
 * The one way into a game, from a list or a universal link.
 *
 * Checks, in order: the game is on the app's list; the person is signed in; a
 * date of birth is on record (asked for here if not); they are old enough for
 * the app's age rating (Guideline 4.7.5). Only then does the game open, in the
 * in-app browser, replacing this screen so Back returns to where they came from.
 */
export default function GameLauncher({
  route,
}: StaticScreenProps<GameLauncherParams>) {
  const navigation = useNavigation();
  const { namespace, source } = route.params;
  const game = findGame(namespace);
  const { user } = useSnapshot(authState);

  const isSignedIn = Boolean(user);
  const isGuest = user?.isAnonymous === true;

  const me = useQuery({
    ...orpc.account.me.queryOptions(),
    enabled: isSignedIn && !isGuest && Boolean(game),
  });

  const gate = gateFor({
    namespace,
    isSignedIn,
    isGuest,
    // Undefined while loading; null if the account could not be read.
    me: me.isPending ? undefined : (me.data ?? null),
  });

  const [askBirthDate, setAskBirthDate] = useState(false);
  const handled = useRef<GameGate | null>(null);

  useEffect(() => {
    if (handled.current === gate) {
      return;
    }

    if (gate === "ok" && game) {
      handled.current = gate;
      trackDiscover({
        event: "game_launch",
        itemType: "game",
        itemId: game.namespace,
        source: source ?? "link",
      });
      navigation.dispatch(
        StackActions.replace("InAppBrowser", {
          url: gamePlayUrl(game.namespace),
          type: "game",
          title: game.title,
          hideHeader: true,
          gameNamespace: game.namespace,
        })
      );
      return;
    }

    if (gate === "sign-in") {
      handled.current = gate;
      trackDiscover({
        event: "game_blocked",
        itemType: "game",
        itemId: namespace,
        source: "guest",
      });
      // Sign in on top of this screen, and leave this one where it is.
      navigation.navigate("SignIn", { redirect: true });
      return;
    }

    if (gate === "need-birth-date") {
      handled.current = gate;
      setAskBirthDate(true);
      return;
    }

    if (gate === "too-young" || gate === "unknown-game") {
      handled.current = gate;
      trackDiscover({
        event: "game_blocked",
        itemType: "game",
        itemId: namespace,
        source: gate === "too-young" ? "age" : "unknown",
      });
    }
  }, [gate, game, namespace, navigation, source]);

  const message = MESSAGES[gate];

  return (
    <Screen preset="fixed" statusBarStyle="light">
      <ScreenHeader title="Games" />
      <View className="flex-1 items-center justify-center gap-4 px-6">
        {message ? (
          <>
            <Text className="text-center font-bold text-xl">
              {message.title}
            </Text>
            <Text className="text-center text-gray-500">{message.body}</Text>
            <Button onPress={() => navigation.goBack()}>
              <Button.Label>Go back</Button.Label>
            </Button>
          </>
        ) : gate === "sign-in" ? (
          <>
            <Text className="text-center font-bold text-xl">
              Sign in to play
            </Text>
            <Text className="text-center text-gray-500">
              Games are for signed-in accounts.
            </Text>
            <Button
              onPress={() => navigation.navigate("SignIn", { redirect: true })}
            >
              <Button.Label>Sign in</Button.Label>
            </Button>
          </>
        ) : gate === "need-birth-date" ? (
          <>
            <Text className="text-center font-bold text-xl">
              Confirm your age
            </Text>
            <Text className="text-center text-gray-500">
              Games are for ages {GAMES_MIN_AGE} and over, so we need your date
              of birth first.
            </Text>
            <Button onPress={() => setAskBirthDate(true)}>
              <Button.Label>Enter date of birth</Button.Label>
            </Button>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>

      <DateOfBirthDialog
        description={`Games are for ages ${GAMES_MIN_AGE} and over, so we need your date of birth before you can play.`}
        onOpenChange={setAskBirthDate}
        onSaved={() => {
          // Re-read the account, then the gate decides: play or too young.
          handled.current = null;
          me.refetch();
        }}
        open={askBirthDate}
      />
    </Screen>
  );
}
