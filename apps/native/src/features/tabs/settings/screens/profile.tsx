import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { FormProvider, type SubmitHandler, useForm } from "react-hook-form";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { toast } from "sonner-native";
import { Input, Paragraph, Spinner, Stack, YStack } from "tamagui";
import { z } from "zod";

import { FormInput } from "#/components";
import { Screen } from "#/components/Screen";
import { Button } from "#/components/ui/Button";
import { useForgotPassword, useUpdateProfile, useUser } from "#/hooks/auth";
import { userQueryOptions } from "#/hooks/auth/useUser";
import { queryClient } from "#/lib/tanstackQuery";

const passwordSchema = z
  .object({
    oldPassword: z
      .string("Password is required")
      .min(8, "Password must be at least 8 characters"),
    newPassword: z
      .string("New password is required")
      .min(8, "Password must be at least 8 characters"),
  })
  .refine((data) => data.oldPassword === data.newPassword, {
    message: "Passwords do not match",
    path: ["newPassword"],
  });

const profileSchema = z.object({
  name: z
    .string("Name is required")
    .min(3, "Name must be at least 3 characters")
    .trim()
    .toLowerCase(),
  username: z
    .string("Username is required")
    .trim()
    .min(3, "Username must be at least 3 characters")
    .toLowerCase(),
  phone: z
    .string("Phone number is required")
    .regex(/^\d+$/, "Invalid phone number")
    .trim(),
});

export type ChangePasswordInput = z.infer<typeof passwordSchema>;

export type ProfileInput = z.infer<typeof profileSchema>;

function Profile() {
  const { data } = useUser();
  const updateProfileMutation = useUpdateProfile();
  const resetPasswordMutation = useForgotPassword();

  const user = data?.user;

  const profileFormMethods = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
  });

  const isDirty = profileFormMethods.formState.isDirty;

  useEffect(() => {
    if (user) {
      profileFormMethods.reset({
        name: user?.name,
        username: user?.username,
        phone: user?.phone,
      });
    }
  }, [user]);

  const onUpdateReset = () => {
    if (user?.email) {
      resetPasswordMutation.mutate(
        {
          email: user.email,
        },
        {
          onSuccess: () => {
            toast.success("Success", {
              description: "Reset link has been sent to your email",
            });
          },
          onError: () => {
            toast.error("Error", {
              description: "An error occurred. Please try again later",
            });
          },
        }
      );
    }
  };

  const onUpdateProfile: SubmitHandler<ProfileInput> = (data) => {
    toast.loading("Updating profile...");
    updateProfileMutation.mutate(data, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: userQueryOptions.queryKey });
        toast.dismiss();
        toast.success("Profile updated", {
          description: "Your profile information has been saved.",
        });
      },
      onError: (error) => {
        toast.dismiss();
        if (error?.code === "INPUT_VALIDATION_FAILED") {
          const fieldErrors = error?.data?.fieldErrors;

          if (fieldErrors) {
            Object.keys(fieldErrors).forEach((key) => {
              profileFormMethods.setError(
                key as keyof ProfileInput,
                {
                  type: "server",
                  message: fieldErrors[key]?.[0] || "Unknown error",
                },
                {
                  shouldFocus: true,
                }
              );
            });
          }
          return;
        }
        toast.error("Profile update failed", {
          description: "An error occurred. Please try again later",
        });
      },
    });
  };

  return (
    <Screen safeAreaEdges={["bottom"]}>
      <KeyboardAwareScrollView
        bottomOffset={40}
        contentContainerStyle={{
          paddingHorizontal: 25,
          paddingTop: 20,
          paddingBottom: 50,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Stack gap="$10">
          <FormProvider {...profileFormMethods}>
            <YStack gap="$5">
              {/* <XStack alignItems="center" gap="$6">
              <Avatar circular size="$8">
                <Avatar.Image
                  accessibilityLabel="Cam"
                  src="https://images.unsplash.com/photo-1548142813-c348350df52b?&w=150&h=150&dpr=2&q=80"
                />
                <Avatar.Fallback backgroundColor="$blue10" />
              </Avatar>

              <Button outlined size="$3" borderRadius="$10">
                <Button.Text color="$color">Change Profile Picture</Button.Text>
              </Button>
            </XStack> */}
              <YStack gap="$2">
                <Paragraph fontSize="$5">Name</Paragraph>
                <FormInput name="name" placeholder={user?.name ?? ""} />
              </YStack>
              <YStack gap="$2">
                <Paragraph fontSize="$5">Username</Paragraph>
                <FormInput name="username" placeholder={user?.username ?? ""} />
              </YStack>
              <YStack gap="$2">
                <Paragraph fontSize="$5">Phone</Paragraph>
                <FormInput
                  keyboardType="phone-pad"
                  name="phone"
                  placeholder={user?.phone ?? ""}
                />
              </YStack>
              <YStack gap="$2">
                <Paragraph fontSize="$5">Email Address</Paragraph>
                <Input bg="#dedede" disabled value={user?.email} />
              </YStack>
              <YStack gap="$2">
                <Paragraph fontSize="$5">Wish</Paragraph>
                <Input bg="#dedede" disabled value={user?.wish} />
              </YStack>
              <YStack gap="$2">
                <Button
                  disabled={updateProfileMutation.isPending || !isDirty}
                  onPress={profileFormMethods.handleSubmit(onUpdateProfile)}
                >
                  {updateProfileMutation.isPending ? (
                    <Button.Icon>
                      <Spinner color="$s50" />
                    </Button.Icon>
                  ) : (
                    <Button.Text>Save</Button.Text>
                  )}
                </Button>
              </YStack>
            </YStack>
          </FormProvider>

          <Button
            disabled={resetPasswordMutation.isPending}
            onPress={onUpdateReset}
          >
            {resetPasswordMutation.isPending ? (
              <Button.Icon>
                <Spinner color="$s50" />
              </Button.Icon>
            ) : null}
            <Button.Text>Request Password Reset</Button.Text>
          </Button>
        </Stack>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

export default Profile;
