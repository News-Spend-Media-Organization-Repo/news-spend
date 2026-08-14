import { useQuery } from "@tanstack/react-query";
import { Dialog } from "heroui-native";
import { TrophyIcon } from "phosphor-react-native";
import { memo, useEffect, useState } from "react";
import { View } from "react-native";
import { useSnapshot } from "valtio";

import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { orpc } from "#/lib/orpc";
import { navigate } from "#/navigation/navigationUtils";
import { authState } from "#/state/auth";
import { Text } from "../ui";

/** Long enough not to fight the app's own startup, short enough to be seen. */
const ANNOUNCE_DELAY_MS = 5000;

/**
 * Tell a winner they have won, then get out of the way.
 *
 * Deliberately a notification rather than a flow. The claim itself lives on
 * `MyPrizes` / `ClaimPrize`, which persist — a prize that can only be claimed
 * from a dialog is a prize the user loses by dismissing it, and the claim
 * window now closes after fourteen days or when the next giveaway starts.
 *
 * There is also no advertisement in front of the reveal. An ad between someone
 * and a prize they have already won makes the claim path depend on ad
 * availability, which is a poor trade for a moment that should feel like a
 * reward.
 */
export default memo(function GiveawayReward() {
  const [open, setOpen] = useState(false);
  const [announced, setAnnounced] = useState<string | null>(null);
  const { session } = useSnapshot(authState);
  const user = session?.user;

  const { data } = useQuery(
    orpc.giveaway.actionable.queryOptions({ enabled: Boolean(user) })
  );

  const unclaimed = (data ?? []).filter((prize) => prize.claimable);
  const headline = unclaimed[0];

  useEffect(() => {
    if (!headline || announced === headline.id) {
      return;
    }

    const timer = setTimeout(() => {
      setOpen(true);
      // Announce a given prize once per session, so dismissing it does not
      // mean being nagged on every screen change.
      setAnnounced(headline.id);
    }, ANNOUNCE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [headline, announced]);

  if (!headline) {
    return null;
  }

  const more = unclaimed.length - 1;

  return (
    <Dialog isOpen={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content className="w-[95%]">
          <Dialog.Close className="absolute top-1 right-2" variant="ghost" />

          <View className="items-center gap-2">
            <Icon color="#00223d" name={TrophyIcon} size={48} weight="fill" />
            <Text className="text-center font-semibold text-lg">
              Congratulations!
            </Text>
            <Text className="text-center text-subtle-text">
              You won {headline.prizeName} in the Giveaway.
              {more > 0
                ? ` And ${more} other prize${more === 1 ? "" : "s"}.`
                : ""}
            </Text>
          </View>

          <Button
            className="mt-4"
            onPress={() => {
              setOpen(false);
              navigate("MyPrizes");
            }}
          >
            <Button.Label>
              {more > 0 ? "View my prizes" : "Claim your prize"}
            </Button.Label>
          </Button>

          <Text className="mt-2 text-center text-subtle-text text-xs">
            Your prizes are always waiting under My Prizes.
          </Text>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
});
