import { useNavigation } from "@react-navigation/native";
import { Image, Stack } from "tamagui";

import { Screen } from "#/components/Screen";
import { Button } from "#/components/ui";

import { ConfirmAsGuest } from "../components/ConfirmAsGuest";

const Welcome = () => {
  const navigation = useNavigation("Welcome");

  return (
    <Screen preset="fixed" systemBarStyle="light">
      <Stack bg="$p500" flex={1} px="$5">
        <Stack alignItems="center" flex={2} justifyContent="center">
          <Image
            height={330}
            objectFit="contain"
            source={require("#/images/welcome-logo.png")}
            width={330}
          />
        </Stack>

        <Stack flex={1} gap="$4">
          <Button
            backgroundColor="$p50"
            onPress={() => navigation.navigate("SignIn", {})}
            pressStyle={{
              opacity: 0.8,
              backgroundColor: "$p50",
            }}
          >
            <Button.Text color="$p500" fontSize="$4">
              Sign In
            </Button.Text>
          </Button>

          <Button
            borderColor="$p50"
            bw={0.5}
            onPress={() =>
              navigation.navigate("TOS", {
                goto: "SignUp",
              })
            }
            outlined
            pressStyle={{
              backgroundColor: "transparent",
            }}
          >
            <Button.Text color="#fff">Create Account</Button.Text>
          </Button>

          <ConfirmAsGuest
            trigger={
              <Button ghost>
                <Button.Text color="$s300" fontSize="$3" fontWeight="700">
                  Continue as a guest
                </Button.Text>
              </Button>
            }
          />
        </Stack>
      </Stack>
    </Screen>
  );
};

export default Welcome;
