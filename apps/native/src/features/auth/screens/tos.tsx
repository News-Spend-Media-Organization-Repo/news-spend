import { useNavigation, useRoute } from "@react-navigation/native";
import { useMutation } from "@tanstack/react-query";
import { Checkbox, ControlField, checkboxClassNames, LinkButton } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { toast } from "sonner-native";
import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { authClient } from "#/lib/authClient";
import { hydrateAuth } from "#/state/auth";

export default function TOS() {
  const navigation = useNavigation("TOS");
  const [checked, setChecked] = useState(false);
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
      toast.success("Signed in as a guest");
    },
    onError: () => {
      toast.error("Failed to sign in as a guest");
    },
  });

  const onConfirm = () => {
    const { goto } = (route.params as { goto?: string }) || {};
    if (goto === "SignUp") {
      navigation.replace(goto);
    } else {
      anonymousSignInMutation.mutate();
    }
  };

  console.log(checkboxClassNames.root({ variant: "primary" }));

  return (
    <Screen className="px-6" safeAreaEdges={["bottom"]}>
      <View className="flex-1 items-center justify-center gap-3">
        <View className="w-full max-w-xs gap-6">
          <ControlField className="items-start" isSelected={checked} onSelectedChange={setChecked}>
            <ControlField.Indicator className="">
              <Checkbox className="mt-0.5 rounded-sm border border-accent" />
            </ControlField.Indicator>
            <View className="flex-1 flex-row flex-wrap">
              <Text className="text-[1rem] text-muted">I agree to the </Text>
              <LinkButton onPress={() => navigation.navigate("TermsOfUse")} size="sm">
                <LinkButton.Label className="text-accent underline">
                  Terms of Service
                </LinkButton.Label>
              </LinkButton>
              <Text className="text-[16px] text-muted"> and </Text>
              <LinkButton onPress={() => navigation.navigate("PrivacyPolicy")} size="sm">
                <LinkButton.Label className="text-accent underline">
                  Privacy Policy
                </LinkButton.Label>
              </LinkButton>
            </View>
          </ControlField>
        </View>
      </View>

      <Button
        className="mb-6 w-full"
        isDisabled={!checked || anonymousSignInMutation.isPending}
        onPress={onConfirm}
      >
        <Button.Label>{anonymousSignInMutation.isPending ? "Loading..." : "Proceed"}</Button.Label>
      </Button>
    </Screen>
  );
}
