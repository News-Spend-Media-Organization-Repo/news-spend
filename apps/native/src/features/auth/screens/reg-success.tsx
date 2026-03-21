import { useQueryClient } from "@tanstack/react-query";
import { H2, Image, Stack, Text } from "tamagui";

import { Screen } from "#/components/Screen";
import { Button } from "#/components/ui";
import { authClient } from "#/lib/authClient";
import { setAuthSession } from "#/state/auth";

import { userQueryOptions } from "../hooks/useUser";

export default function RegSuccess() {
  const { data, isPending, error } = authClient.useSession();
  const queryClient = useQueryClient();

  const onContinue = () => {
    if (!data?.user) {
      return;
    }
    queryClient.setQueryData(userQueryOptions.queryKey, data);
    setAuthSession(data, "signIn");
  };
  return (
    <Screen bg="$background" px="$2.5" safeAreaEdges={["bottom"]}>
      <Stack ai="center" flex={1} jc="flex-end" mb="$6">
        <Image source={require("#/images/Group-5.jpg")} />
      </Stack>
      <Stack ai="center" gap="$15">
        <H2 color="$s200">Registration Successful</H2>
        <Text>You have been awarded with 500 points</Text>
        <Button
          disabled={Boolean(error) || isPending}
          mb="$10"
          onPress={onContinue}
          w="100%"
        >
          <Button.Text>Continue</Button.Text>
        </Button>
      </Stack>
    </Screen>
  );
}
