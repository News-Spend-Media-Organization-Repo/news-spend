import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { FormProvider, type SubmitHandler, useForm } from "react-hook-form";
import { Keyboard } from "react-native";
import { H2, Paragraph, Spinner, Stack, Text, Unspaced, YStack } from "tamagui";
import * as z from "zod";

import { Screen } from "#/components/Screen";
import FormInput from "#/components/text-input";
import { Button } from "#/components/ui/Button";
import { authState } from "#/state/auth";

import useLogin from "../hooks/useLogin";

const schema = z.object({
  email: z
    .string("Email is required")
    .trim()
    .check(
      z.email({
        message: "Invalid email",
      })
    ),
  password: z.string("Password is required"),
});

const defaultValues = {
  email: "rickpd@hotmail.red",
  password: "123456qwerty",
};

export type LoginInput = z.input<typeof schema>; // TODO: move to schema file

export default function SignIn() {
  const navigation = useNavigation();
  const loginMutation = useLogin();
  const [serverError, setServerError] = useState<string | null>(null);
  const formMethods = useForm<LoginInput>({
    resolver: zodResolver(schema),
    defaultValues: __DEV__ ? defaultValues : undefined,
  });

  const { handleSubmit, setError } = formMethods;

  const onSubmit: SubmitHandler<LoginInput> = (data) => {
    setServerError(null);
    Keyboard.dismiss();

    loginMutation.mutate(data, {});
  };

  return (
    <Screen bg="$background" px="$2.5" safeAreaEdges={["bottom"]}>
      <H2 maxWidth={300} mb="$11" mt="$7">
        Welcome back! Glad to see you, Again!
      </H2>
      <Stack gap="$9">
        <FormProvider {...formMethods}>
          <YStack gap="$5">
            <FormInput
              keyboardType="email-address"
              name="email"
              placeholder="Email"
            />
            <FormInput name="password" placeholder="Password" secureTextEntry />
            <Unspaced>
              <Stack gap="$2" mt="$2">
                {serverError ? (
                  <Paragraph color="red" fos="$4">
                    {serverError}
                  </Paragraph>
                ) : null}
                {/* <Link href="/forgot-password" asChild> */}
                <Paragraph
                  als="flex-end"
                  color="$color.gray.50"
                  onPress={() => navigation.navigate("ForgotPassword")}
                  size="$3"
                >
                  Forgot password?
                </Paragraph>
                {/* </Link> */}
              </Stack>
            </Unspaced>
          </YStack>
        </FormProvider>
        <Button
          disabled={loginMutation.isPending}
          // onPress={() => (authState.isGuest = true)}
          onPress={handleSubmit(onSubmit)}
        >
          {loginMutation.isPending ? (
            <Button.Icon color="$50">
              <Spinner />
            </Button.Icon>
          ) : null}
          <Button.Text>Sign In</Button.Text>
        </Button>
      </Stack>
      <Paragraph fontSize="$3" mb="$6" mt="auto" ta="center">
        Don&apos;t have an account?
        <Text
          color="$s300"
          fontSize="$3"
          fontWeight="700"
          onPress={() => navigation.navigate("SignUp")}
        >
          Register here
        </Text>
      </Paragraph>
    </Screen>
  );
}
