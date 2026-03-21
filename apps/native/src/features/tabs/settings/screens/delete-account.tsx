import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigation } from "@react-navigation/native";
import { AlertCircle } from "@tamagui/lucide-icons";
import { CheckIcon } from "phosphor-react-native";
import { useState } from "react";
import { FormProvider, type SubmitHandler, useForm } from "react-hook-form";
import { Alert, Keyboard } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { toast } from "sonner-native";
import {
  Checkbox,
  H3,
  Label,
  Paragraph,
  Spinner,
  Stack,
  XStack,
  YStack,
} from "tamagui";
import { z } from "zod";

import { FormInput } from "#/components";
import { Screen } from "#/components/Screen";
import { Button } from "#/components/ui/Button";
import { useDeleteAccount } from "#/hooks/auth";
import { logout } from "#/state/auth";

const deleteAccountSchema = z.object({
  password: z
    .string("Enter your password")
    .min(8, "Password must be at least 8 characters"),
});

type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

function DeleteAccount() {
  const navigation = useNavigation();
  const deleteAccountMutation = useDeleteAccount();
  const [hasReadConsequences, setHasReadConsequences] = useState(false);

  const formMethods = useForm<DeleteAccountInput>({
    resolver: zodResolver(deleteAccountSchema),
  });

  const showConfirmationAlert = (data: DeleteAccountInput) => {
    Alert.alert(
      "Delete Account?",
      "This action cannot be undone. Your account and all associated data will be permanently deleted.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleDeleteAccount(data),
        },
      ],
      { cancelable: true }
    );
  };

  const handleSuccess = async () => {
    toast.dismiss();
    toast.success("Account Deleted", {
      description:
        "Your account has been permanently deleted. We're sorry to see you go.",
    });

    await logout();

    // navigation.reset({
    //   index: 0,
    //   routes: [{ name: "Welcome" }],
    // });
  };

  const handleError = (error: Error) => {
    toast.dismiss();

    const customError = error as {
      code?: string;
      message?: string;
      data?: { fieldErrors?: Record<string, string[]> };
    };

    if (
      customError?.code === "UNAUTHORIZED" ||
      customError?.message?.includes("password")
    ) {
      formMethods.setError("password", {
        type: "server",
        message: "Incorrect password",
      });
      toast.error("Incorrect Password", {
        description: "Please enter your correct password to continue.",
      });
      return;
    }

    if (customError?.code === "INPUT_VALIDATION_FAILED") {
      const fieldErrors = customError?.data?.fieldErrors;
      if (fieldErrors) {
        for (const key of Object.keys(fieldErrors)) {
          formMethods.setError(key as keyof DeleteAccountInput, {
            type: "server",
            message: fieldErrors[key]?.[0] || "Unknown error",
          });
        }
      }
      return;
    }

    toast.error("Failed to Delete Account", {
      description:
        customError?.message || "An error occurred. Please try again later.",
    });
  };

  const handleDeleteAccount = (data: DeleteAccountInput) => {
    toast.loading("Deleting account...");

    deleteAccountMutation.mutate(
      {
        password: data.password,
      },
      {
        onSuccess: handleSuccess,
        onError: handleError,
      }
    );

    Keyboard.dismiss();
  };

  const onSubmit: SubmitHandler<DeleteAccountInput> = (data) => {
    if (!hasReadConsequences) {
      toast.error("Please confirm", {
        description: "You must acknowledge the consequences before proceeding.",
      });
      return;
    }

    showConfirmationAlert(data);
  };

  return (
    <Screen bg="$background" safeAreaEdges={["bottom"]}>
      <KeyboardAwareScrollView
        bottomOffset={40}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 50,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Stack gap="$6">
          <YStack
            bg="$red2"
            borderColor="$red8"
            borderRadius="$4"
            borderWidth={1}
            gap="$3"
            p="$4"
          >
            <XStack ai="center" gap="$2">
              <AlertCircle color="$red10" size={20} />
              <H3 color="$red11" m="$0">
                Warning
              </H3>
            </XStack>
            <Paragraph color="$red11" fontSize="$3">
              Deleting your account is permanent and cannot be undone. This
              action will:
            </Paragraph>
          </YStack>

          <YStack bg="$p50" borderRadius="$4" gap="$3" p="$4">
            <Paragraph fontSize="$4" fontWeight="600">
              What will be deleted:
            </Paragraph>
            <YStack gap="$2">
              <XStack ai="flex-start" gap="$2">
                <Paragraph>•</Paragraph>
                <Paragraph flex={1} fontSize="$3">
                  Your profile information (name, email, username, phone)
                </Paragraph>
              </XStack>
              <XStack ai="flex-start" gap="$2">
                <Paragraph>•</Paragraph>
                <Paragraph flex={1} fontSize="$3">
                  All your reward points and activities
                </Paragraph>
              </XStack>
              <XStack ai="flex-start" gap="$2">
                <Paragraph>•</Paragraph>
                <Paragraph flex={1} fontSize="$3">
                  Your comments and posts
                </Paragraph>
              </XStack>
              <XStack ai="flex-start" gap="$2">
                <Paragraph>•</Paragraph>
                <Paragraph flex={1} fontSize="$3">
                  All saved preferences and settings
                </Paragraph>
              </XStack>
              <XStack ai="flex-start" gap="$2">
                <Paragraph>•</Paragraph>
                <Paragraph flex={1} fontSize="$3">
                  Your account access (you will be logged out immediately)
                </Paragraph>
              </XStack>
            </YStack>
          </YStack>

          <FormProvider {...formMethods}>
            <YStack gap="$4">
              <YStack gap="$2">
                <Label fontSize="$4" fontWeight="600" htmlFor="password">
                  Enter Your Password
                </Label>
                <Paragraph color="$gray.50" fontSize="$3">
                  To confirm this action, please enter your password
                </Paragraph>
                <FormInput
                  name="password"
                  placeholder="Your password"
                  secureTextEntry
                />
              </YStack>

              <XStack gap="$3" jc="center">
                <Checkbox
                  ai="center"
                  bg={hasReadConsequences ? "$color.p500" : "transparent"}
                  boc={hasReadConsequences ? "$color.p500" : "gray"}
                  bw={hasReadConsequences ? 0 : 1}
                  checked={hasReadConsequences}
                  h="$1.5"
                  id="consequences"
                  jc="center"
                  mt="$2"
                  onCheckedChange={(c) => setHasReadConsequences(c === true)}
                  unstyled
                  w="$1.5"
                >
                  <Checkbox.Indicator>
                    <CheckIcon color="white" />
                  </Checkbox.Indicator>
                </Checkbox>

                <Label flex={1} fontSize="$4" htmlFor="consequences" lh={18}>
                  I understand that this action is permanent and cannot be
                  reversed
                </Label>
              </XStack>
            </YStack>
          </FormProvider>

          <YStack gap="$3" mt="$4">
            <Button
              bg="$red10"
              disabled={deleteAccountMutation.isPending || !hasReadConsequences}
              hoverStyle={{ bg: "$red11" }}
              onPress={formMethods.handleSubmit(onSubmit)}
              pressStyle={{ bg: "$red11" }}
            >
              {deleteAccountMutation.isPending ? (
                <Button.Icon>
                  <Spinner color="$s50" />
                </Button.Icon>
              ) : null}
              <Button.Text>Delete My Account</Button.Text>
            </Button>

            <Button
              disabled={deleteAccountMutation.isPending}
              onPress={() => navigation.goBack()}
              outlined
            >
              <Button.Text color="$color">Cancel</Button.Text>
            </Button>
          </YStack>
        </Stack>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

export default DeleteAccount;
