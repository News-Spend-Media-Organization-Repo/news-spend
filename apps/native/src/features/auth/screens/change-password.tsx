import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigation, useRoute } from "@react-navigation/native";
import { FormProvider, type SubmitHandler, useForm } from "react-hook-form";
import { Keyboard } from "react-native";
import { toast } from "sonner-native";
import { H2, Spinner, Stack, YStack } from "tamagui";
import * as z from "zod";

import { Screen } from "#/components/Screen";
import FormInput from "#/components/text-input";
import { Button } from "#/components/ui";
import { useChangePassword } from "#/hooks/auth";
import { authClient } from "#/lib/authClient";
import { logout } from "#/state/auth";

const schema = z
  .object({
    password: z
      .string("Password is required")
      .min(8, "Password must be at least 8 characters"),
    confirmPassword: z
      .string("Confirm password is required")
      .min(8, "Password must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof schema>; // TODO: move to schema file

const ResetPassword = () => {
  const navigation = useNavigation("ResetPassword");
  const route = useRoute("ResetPassword");
  const { token } = route.params;

  const changePasswordMutation = useChangePassword();

  const formMethods = useForm<ChangePasswordInput>({
    resolver: zodResolver(schema),
  });

  const onSubmit: SubmitHandler<ChangePasswordInput> = (data) => {
    changePasswordMutation.mutate(
      {
        password: data.password,
        token,
      },
      {
        onSuccess: async ({ data, error }) => {
          if (error) {
            return toast.error("Unable to reset password", {
              description:
                "The reset link may have expired or is invalid. Please request a new password reset link and try again.",
            });
          }
          toast.success("Password Updated", {
            description:
              "Your password has been changed. Please sign in with your new password.",
          });

          const session = await authClient.getSession();
          if (session.data) {
            await logout();
          }
          navigation.replace("SignIn");
        },
        onError: (error) => {
          toast.error("Failed to reset password", {
            description: "Something went wrong while resetting your password.",
          });
        },
      }
    );

    Keyboard.dismiss();
  };

  return (
    <Screen bg="$background" px="$2.5" safeAreaEdges={["bottom"]}>
      <H2 mb="$11" mt="$7" ta="center">
        Change Password
      </H2>
      <Stack gap="$6">
        <FormProvider {...formMethods}>
          <YStack gap="$5">
            <FormInput name="password" placeholder="Password" secureTextEntry />
            <FormInput
              name="confirmPassword"
              placeholder="Confirm Password"
              secureTextEntry
            />
          </YStack>
        </FormProvider>
        <Button
          disabled={changePasswordMutation.isPending}
          mb="$3"
          onPress={formMethods.handleSubmit(onSubmit)}
          {...(changePasswordMutation.isPending && {
            iconAfter: <Spinner color="$s50" />,
            disabled: true,
          })}
        >
          <Button.Text>Save</Button.Text>
        </Button>
      </Stack>
    </Screen>
  );
};

export default ResetPassword;
