import { useNavigation, useRoute } from "@react-navigation/native";
import { ArrowLeft } from "@tamagui/lucide-icons";
import { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import {
  CodeField,
  Cursor,
  useBlurOnFulfill,
  useClearByFocusCell,
} from "react-native-confirmation-code-field";
import { useKeyboardState } from "react-native-keyboard-controller";
import { toast } from "sonner-native";
import {
  H2,
  SizableText,
  Spinner,
  Stack,
  Text,
  useTheme,
  XStack,
  YStack,
} from "tamagui";

import { Screen } from "#/components/Screen";
import { Button } from "#/components/ui";

import { useSendOtp, useVerifyOTP } from "../hooks/useOTP";

export default function Verification() {
  const route = useRoute("Verification");
  const [value, setValue] = useState("");
  const isOpen = useKeyboardState((v) => v.isVisible);
  const theme = useTheme();
  const ref = useBlurOnFulfill({ value, cellCount: CELL_COUNT });
  const navigation = useNavigation("Verification");
  const [props, getCellOnLayoutHandler] = useClearByFocusCell({
    value,
    setValue,
  });
  const sendOTPMutation = useSendOtp();
  const verifyOTPMutation = useVerifyOTP();
  const { email, otpSent = false } = route.params;
  const otpSentRef = useRef(false);

  useEffect(() => {
    if (email && !otpSent && !otpSentRef.current) {
      otpSentRef.current = true;
      sendOTPMutation.mutate({ email });
    }
  }, [email, otpSent]);

  const verifyOTP = () => {
    verifyOTPMutation.mutate(
      {
        otp: value,
        email,
      },
      {
        onSuccess({ data, error }) {
          if (error) {
            if (error.code === "INVALID_OTP") {
              return toast.error("Invalid verification code", {
                description:
                  "The code you entered is incorrect. Please check the code and try again.",
              });
            }
            let errorMsg = "Something went wrong. Please try again.";
            if (error.code === "TOO_MANY_ATTEMPTS") {
              errorMsg =
                "Too many incorrect attempts. Please wait a few minutes before trying again.";
            } else if (error.message) {
              errorMsg = error.message;
            }
            return toast.error("Verification Error", {
              description: errorMsg,
            });
          }

          toast("Success", {
            description: "Account verified successfully",
          });
          navigation.navigate("RegSuccess");
        },
        onError(err) {
          toast.error("Verification failed", {
            description:
              "We couldn't verify your code. Please check the code and try again.",
          });
        },
      }
    );
  };

  const sendOTP = () => {
    sendOTPMutation.mutate(
      { email },
      {
        onSuccess({ data, error }) {
          if (error) {
            return toast.error("Failed to resend code", {
              description:
                "We couldn't send a new verification code. Please check your internet connection and try again.",
            });
          }
          toast("Success", {
            description: "Code sent successfully",
          });
        },
        onError(err) {
          toast.error("Failed to resend code", {
            description:
              "We couldn't send a new verification code. Please check your internet connection and try again.",
          });
        },
      }
    );
  };

  return (
    <Screen
      bg="$background"
      contentContainerStyle={{ paddingBottom: 24 }}
      KeyboardAvoidingViewProps={{
        behavior: "padding",
      }}
      preset="fixed"
      pt="$5"
      px="$2.5"
      safeAreaEdges={["bottom"]}
    >
      <XStack>
        <ArrowLeft onPress={() => navigation.goBack()} />
      </XStack>
      <Stack flex={1} gap="$11" mt="$8">
        <Stack gap="$5">
          <H2 ta="center">Verification Code</H2>
          <SizableText color="#737373" fontSize="$5" ta="center">
            Please enter the verification code sent to{" "}
            <SizableText color="black">{email ?? ""}</SizableText>
          </SizableText>
          <YStack>
            <CodeField
              ref={ref}
              {...props}
              // Use `caretHidden={false}` when users can't paste a text value, because context menu doesn't appear
              cellCount={CELL_COUNT}
              keyboardType="number-pad"
              onChangeText={setValue}
              renderCell={({ index, symbol, isFocused }) => (
                <Text
                  key={index}
                  onLayout={getCellOnLayoutHandler(index)}
                  style={[
                    styles.cell,
                    isFocused && { borderColor: theme.p300.val },
                  ]}
                >
                  {symbol || (isFocused ? <Cursor /> : null)}
                </Text>
              )}
              rootStyle={styles.codeFieldRoot}
              textContentType="oneTimeCode"
              value={value}
            />
          </YStack>
        </Stack>
        <Stack ai="center" gap="$1">
          <SizableText>Didn't receive the code? </SizableText>
          <Button
            disabled={verifyOTPMutation.isPending || sendOTPMutation.isPending}
            ghost
            onPress={sendOTP}
          >
            {sendOTPMutation.isPending ? (
              <Button.Icon color="$p300">
                <Spinner color="$s300" />
              </Button.Icon>
            ) : null}
            <Button.Text color="$s300" fontWeight="700">
              Resend OTP?
            </Button.Text>
          </Button>
        </Stack>
      </Stack>
      <Button
        disabled={
          sendOTPMutation.isPending ||
          value.length !== 4 ||
          verifyOTPMutation.isPending
        }
        mb={isOpen ? undefined : "$6"}
        my="auto"
        onPress={verifyOTP}
      >
        {verifyOTPMutation.isPending ? (
          <Button.Icon>
            <Spinner color="#fff" />
          </Button.Icon>
        ) : null}
        <Button.Text>Submit</Button.Text>
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeFieldRoot: { marginTop: 20 },
  cell: {
    width: 56,
    height: 56,
    lineHeight: 60,
    fontSize: 24,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "#E4E3E3",
    borderRadius: 8,
    textAlign: "center",
  },
  // focusCell: {
  //   borderColor: "#",
  // },
});

const CELL_COUNT = 4;
