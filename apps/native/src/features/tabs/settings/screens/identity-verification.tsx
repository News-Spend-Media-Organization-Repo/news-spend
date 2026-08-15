import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { cn } from "heroui-native";
import { CheckCircleIcon, ShieldCheckIcon } from "phosphor-react-native";
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { toast } from "sonner-native";

import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";

/**
 * Identity verification, run through the provider's own hosted flow.
 *
 * Deliberately a browser session rather than an in-app form. The old screen
 * asked people to photograph a passport and uploaded it into our own storage;
 * this way the documents never touch us at all — the provider holds them and
 * we keep a decision.
 *
 * The decision arrives by webhook, not from the browser closing, so returning
 * to the app does not mean a result exists yet. That is what the polling below
 * is for.
 */

/** How long to keep asking after the browser closes, before giving up. */
const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 2500;

export default function IdentityVerification() {
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);
  const cancelled = useRef(false);

  const status = useQuery(orpc.verification.status.queryOptions());
  const start = useMutation(orpc.verification.start.mutationOptions());

  const verified = status.data?.verified === true;
  const available = status.data?.available === true;

  /**
   * Ask for a decision a few times after the browser closes.
   *
   * A webhook usually lands within a second or two, but "usually" would leave
   * somebody staring at an unchanged screen wondering whether it worked.
   */
  const pollForDecision = useCallback(async () => {
    setChecking(true);
    cancelled.current = false;

    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      if (cancelled.current) {
        break;
      }

      const result = await queryClient.fetchQuery(
        orpc.verification.status.queryOptions()
      );

      if (result?.verified) {
        setChecking(false);
        toast.success("You're verified. Your prize is on its way.");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    setChecking(false);
    // Not a failure — a provider can take longer, or want a human to look.
    toast.info(
      "We haven't heard back yet. You can close this — we'll let you know."
    );
  }, [queryClient]);

  const onStart = useCallback(async () => {
    try {
      const session = await start.mutateAsync();

      if (session.alreadyVerified) {
        await queryClient.invalidateQueries();
        return;
      }

      if (!session.url) {
        toast.error("Verification is unavailable right now.");
        return;
      }

      // The redirect brings the user back into the app when the provider is
      // finished, rather than leaving them in a browser tab to close by hand.
      await WebBrowser.openAuthSessionAsync(
        session.url,
        // Not "verify-identity" — that path still belongs to the old upload
        // form, and redirecting there would land the user back on the screen
        // this one replaces.
        Linking.createURL("identity-verification")
      );

      await pollForDecision();
    } catch {
      toast.error("Could not start verification. Please try again.");
    }
  }, [start, queryClient, pollForDecision]);

  return (
    <Screen>
      <View className="flex-1 gap-6 px-4 pt-6">
        <View className="items-center gap-3 pt-6">
          <Icon
            className={cn(verified ? "text-success" : "text-foreground")}
            name={verified ? CheckCircleIcon : ShieldCheckIcon}
            size={56}
          />
          <Text className="text-center font-semibold text-2xl">
            {verified ? "You're verified" : "Verify your identity"}
          </Text>
          <Text className="text-center text-muted-foreground">
            {verified
              ? "Nothing else to do. This carries over to every prize you win."
              : "Some prizes need us to check you're you before we send them. It takes a couple of minutes and you'll only ever do it once."}
          </Text>
        </View>

        {!verified && (
          <View className="gap-2 rounded-2xl bg-muted/40 p-4">
            <Text className="font-medium">What happens</Text>
            <Text className="text-muted-foreground text-sm">
              You'll photograph an ID and take a selfie in our verification
              partner's secure flow. Your documents go to them, not to us — we
              only receive the yes or no.
            </Text>
          </View>
        )}

        <View className="mt-auto pb-8">
          {verified ? null : available ? (
            <Button
              isDisabled={start.isPending || checking || status.isLoading}
              onPress={onStart}
            >
              {checking
                ? "Checking…"
                : start.isPending
                  ? "Opening…"
                  : "Start verification"}
            </Button>
          ) : (
            <Text className="text-center text-muted-foreground text-sm">
              Verification isn't available right now. Please check back shortly.
            </Text>
          )}
        </View>
      </View>
    </Screen>
  );
}
