import { useNavigation, useRoute } from "@react-navigation/native";
import { useMutation } from "@tanstack/react-query";
import { CheckIcon } from "phosphor-react-native";
import { useId, useState } from "react";
import { toast } from "sonner-native";
import {
  Checkbox,
  type CheckedState,
  Label,
  SizableText,
  XStack,
} from "tamagui";

import { Screen } from "#/components/Screen";
import { Button } from "#/components/ui";
import { authClient } from "#/lib/authClient";
import { hydrateAuth } from "#/state/auth";

export default function TOS() {
  const navigation = useNavigation("TOS");
  const [checked, setChecked] = useState<CheckedState>(false);
  const id = useId();
  const route = useRoute("TOS");

  const anonymousSignInMutation = useMutation({
    mutationFn: async () => {
      const response = await authClient.signIn.anonymous();

      if (response.error) {
        throw new Error("Failed to sign in anonymously");
      }

      await hydrateAuth();
    },
    onSuccess: () => {
      console.log("Anonymous sign-in successful");
      toast.success("Signed in as a guest");
    },
    onError: (error) => {
      console.error("Failed to sign in anonymously:", error);
      toast.error("Failed to sign in as a guest");
    },
  });

  const onConfirm = () => {
    const { goto } = route.params;
    // if user is signing up, redirect to sign up page
    if (goto === "SignUp") {
      navigation.replace(goto);
    } else {
      anonymousSignInMutation.mutate();
    }
  };

  return (
    <Screen px="$2.5" safeAreaEdges={["bottom"]}>
      <XStack ai="center" flex={1} jc="center">
        <XStack gap="$3">
          <Checkbox
            ai="center"
            bg={checked ? "$color.p500" : "transparent"}
            boc={checked ? "$color.p500" : "gray"}
            bw={checked ? 0 : 1}
            checked={checked}
            h="$1.5"
            id={id}
            jc="center"
            mt="$2"
            onCheckedChange={(c) => setChecked(c)}
            unstyled
            w="$1.5"
          >
            <Checkbox.Indicator>
              <CheckIcon color="white" />
            </Checkbox.Indicator>
          </Checkbox>

          <Label htmlFor={id} maxWidth={250}>
            <SizableText fontSize="$4" lh={24}>
              I accept the{" "}
              <SizableText
                color="#00f"
                onPress={() => navigation.navigate("TermsOfUse")}
                textDecorationLine="underline"
              >
                terms of use
              </SizableText>{" "}
              and acknowledge the{" "}
              <SizableText
                color="#00f"
                onPress={() => navigation.navigate("PrivacyPolicy")}
                textDecorationLine="underline"
              >
                privacy policy
              </SizableText>
            </SizableText>
          </Label>
        </XStack>
      </XStack>

      <Button
        disabled={!checked || anonymousSignInMutation.isPending}
        mb="$6"
        onPress={onConfirm}
        w="100%"
      >
        <Button.Text>
          {anonymousSignInMutation.isPending ? "Loading..." : "Proceed"}
        </Button.Text>
      </Button>
    </Screen>
  );
}
