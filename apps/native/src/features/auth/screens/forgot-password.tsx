import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft } from "@tamagui/lucide-icons";
import { FormProvider, type SubmitHandler, useForm } from "react-hook-form";
import { Keyboard } from "react-native";
import { toast } from "sonner-native";
import { H2, Spinner, Stack, Text } from "tamagui";
import { z } from "zod";

import { Screen } from "#/components/Screen";
import FormInput from "#/components/text-input";
import { Button } from "#/components/ui";

import useForgotPassword from "../hooks/useForgotPassword";

const schema = z.object({
  email: z.string().trim().check(z.email()).toLowerCase(),
});

export type ForgotPasswordInput = z.infer<typeof schema>;

const ForgotPassword = () => {
  const navigation = useNavigation("ForgotPassword");
  const formMethods = useForm<ForgotPasswordInput>({
    resolver: zodResolver(schema),
  });
  const resetMutation = useForgotPassword();

  const onSubmit: SubmitHandler<ForgotPasswordInput> = (data) => {
    resetMutation.mutate(data, {
      onError(error) {
        toast.error("Reset Failed", {
          description:
            "Unable to send reset link. Please check your email address and try again.",
        });
      },
      onSuccess({ data, error }) {
        if (error) {
          return toast.error("Reset Link Not Sent", {
            description:
              error.message ||
              "We couldn't send a reset link to that email. Please double-check your address and try again.",
          });
        }
        navigation.replace("SignIn");
        toast.success("Check Your Email", {
          description:
            "We've sent a password reset link to your email address.",
        });
      },
    });

    Keyboard.dismiss();
  };

  return (
    <Screen bg="$background" pt="$4" px="$2.5" safeAreaEdges={["bottom"]}>
      <ArrowLeft onPress={() => navigation.goBack()} />

      <Stack flex={1} gap="$11" mt="$8">
        <Stack gap="$5">
          <H2 ta="center">Forgot Password</H2>
          <Text color="#737373">
            Don't worry! It occurs. Please enter the email address linked with
            your account.
          </Text>

          <FormProvider {...formMethods}>
            <Stack mt="$5">
              <FormInput name="email" placeholder="example@email.com" />
            </Stack>
          </FormProvider>
        </Stack>
        <Button
          disabled={resetMutation.isPending}
          mt="$3"
          onPress={formMethods.handleSubmit(onSubmit)}
        >
          {resetMutation.isPending ? (
            <Button.Icon>
              <Spinner color="$s50" />
            </Button.Icon>
          ) : null}
          <Button.Text>Send Code</Button.Text>
        </Button>
      </Stack>
    </Screen>
  );
};

export default ForgotPassword;
