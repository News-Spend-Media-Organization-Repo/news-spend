import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigation } from "@react-navigation/native";
import {
  Controller,
  FormProvider,
  type SubmitHandler,
  useForm,
} from "react-hook-form";
import {
  KeyboardAwareScrollView,
  KeyboardController,
} from "react-native-keyboard-controller";
import { toast } from "sonner-native";
import { H2, Spinner, Stack, Text, YStack } from "tamagui";
import * as z from "zod";

import { Screen } from "#/components/Screen";
import FormInput from "#/components/text-input";
import { Button } from "#/components/ui";
import Select from "#/components/ui/select";

import useSignUp from "../hooks/useSignUp";

const schema = z.object({
  name: z
    .string("Please enter your name")
    .trim()
    .min(3, "Name must be at least 3 characters")
    .max(30, "Name must not exceed 30 characters"),
  email: z.email("Please enter a valid email address").trim(),
  password: z
    .string("Please enter a password")
    .min(8, "Password must be at least 8 characters"),
  username: z
    .string("Please enter a username")
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must not exceed 30 characters")
    .trim()
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers and underscores"
    ),
  phone: z
    .string("Please enter your phone number")
    .trim()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number must not exceed 15 digits")
    .regex(/^\+?[0-9]+$/, "Please enter a valid phone number"),
  wish: z.string("Please select your wish"),
});

const defaultValues = {
  name: "rick",
  email: "rickpd@hotmai.red",
  password: "123456qwerty",
  username: "ricky",
  phone: "1234567890",
  // wish: "I want to relocate abroad",
};

export type SignUpInput = z.input<typeof schema>;

export default function SignUp() {
  const navigation = useNavigation("SignUp");
  const signUpMutation = useSignUp();

  const formMethods = useForm<SignUpInput>({
    resolver: zodResolver(schema),
    defaultValues: __DEV__ ? defaultValues : undefined,
  });

  const onSubmit: SubmitHandler<SignUpInput> = (input) => {
    KeyboardController.dismiss();

    signUpMutation.mutate(input, {
      onSuccess({ data, error }) {
        if (!error) {
          navigation.navigate("Verification", {
            email: input.email,
            otpSent: true,
          });
        }

        if (error) {
          if (error.message?.endsWith("email already exists")) {
            return formMethods.setError("email", {
              type: "server",
              message: error.message,
            });
          }

          if (
            error.code === "VALIDATION_FAILED" &&
            // @ts-expect-error
            error.cause?.name === "ZodError"
          ) {
            // @ts-expect-error
            for (const issue of error.issues) {
              const fieldName = issue.path[0] as keyof SignUpInput;

              formMethods.setError(fieldName, {
                type: "server",
                message: issue.message,
              });
            }

            return;
          }

          toast.error("Sign Up Failed", {
            description: "Please check your information and try again",
          });
        }
        // setToken(res.token);
        // setUser(data.user);
      },
      onError(error) {
        console.log("🚀 ~ file: sign-up.tsx:89 ~ onError ~ error:", error);
        toast.error("Sign Up Failed", {
          description:
            "Something went wrong. Please check your connection and try again.",
        });
      },
    });
  };

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]}>
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingHorizontal: 12,
        }}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        <H2 mb="$8" mt="$5" ta="center">
          Create Account
        </H2>
        <Stack gap="$9">
          <FormProvider {...formMethods}>
            <YStack gap="$4.5">
              <FormInput name="name" placeholder="First Name" />
              <FormInput name="username" placeholder="Username" />
              <FormInput
                keyboardType="phone-pad"
                name="phone"
                placeholder="Phone"
              />
              <FormInput
                keyboardType="email-address"
                name="email"
                placeholder="Email"
              />
              <FormInput
                name="password"
                placeholder="Password"
                secureTextEntry
              />
              <YStack gap="$1.5">
                <Controller
                  control={formMethods.control}
                  name="wish"
                  render={({ field: { onChange, value } }) => (
                    <Select
                      onChange={onChange}
                      options={options}
                      placeholder="Make a wish"
                      snapPoints={[90]}
                      snapPointsMode="percent"
                      value={value}
                    />
                  )}
                />
                {formMethods.formState.errors.wish ? (
                  <Text color="red" pl="$2">
                    {formMethods.formState.errors.wish?.message}
                  </Text>
                ) : null}
              </YStack>
            </YStack>
          </FormProvider>
          <Button
            disabled={signUpMutation.isPending}
            onPress={formMethods.handleSubmit(onSubmit)}
          >
            {signUpMutation.isPending ? (
              <Button.Icon>
                <Spinner color="$s50" />
              </Button.Icon>
            ) : null}
            <Button.Text>Submit</Button.Text>
          </Button>
        </Stack>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const options = [
  { title: "I want business capital", value: "I want business capital" },
  { title: "I want to relocate abroad", value: "I want to relocate abroad" },
  { title: "Vacation expenses paid", value: "Vacation expenses paid" },
  { title: "I want business partner", value: "I want business partner" },
  { title: "Oversea study scholarship", value: "Oversea study scholarship" },
  {
    title: "An all expense-paid vacation to your dream destination",
    value: "An all expense-paid vacation to your dream destination",
  },
  {
    title: "A brand-new laptop for work or study",
    value: "A brand-new laptop for work or study",
  },
  {
    title: "Visa application assistance",
    value: "Visa application assistance",
  },
  {
    title: "Business capital to kickstart or expand business",
    value: "Business capital to kickstart or expand business",
  },
  { title: "Study abroad scholarship", value: "Study abroad scholarship" },
  {
    title: "A fully-funded online tech skills program",
    value: "A fully-funded online tech skills program",
  },
  {
    title: "Free groceries for an entire month",
    value: "Free groceries for an entire month",
  },
  {
    title: "Rent support for a whole year",
    value: "Rent support for a whole year",
  },
  {
    title: "An exciting shopping spree experience",
    value: "An exciting shopping spree experience",
  },
  {
    title: "Seed funding to launch your startup",
    value: "Seed funding to launch your startup",
  },
  {
    title: "Comprehensive health insurance coverage",
    value: "Comprehensive health insurance coverage",
  },
  {
    title: "Assistance with paying off outstanding debts",
    value: "Assistance with paying off outstanding debts",
  },
  {
    title: "6 month paid gym membership",
    value: "6 month paid gym membership",
  },
  {
    title: "A complete home makeover/ furnishing package",
    value: "A complete home makeover/ furnishing package",
  },
];
