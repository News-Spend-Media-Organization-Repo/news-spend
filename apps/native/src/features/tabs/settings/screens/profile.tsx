import { zodResolver } from "@hookform/resolvers/zod";
import { Spinner } from "heroui-native";
import { FormProvider, type SubmitHandler, useForm } from "react-hook-form";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { toast } from "sonner-native";
import { z } from "zod";
import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import FormTextInput from "#/components/heroui/text-input";
import { useForgotPassword, useUpdateProfile, useUser } from "#/hooks/auth";
import { userQueryOptions } from "#/hooks/auth/useUser";
import { queryClient } from "#/lib/tanstackQuery";

const capitalize = (str: string) =>
  str.replace(/\b\w/g, (char) => char.toUpperCase());

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
  email: z.email("Invalid email").trim(),
  wish: z.string("Wish is required").trim(),
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
    defaultValues: {
      name: "",
      username: "",
      phone: "",
      email: "",
      wish: "",
    },
    values: {
      name: user?.name ?? "",
      username: user?.username ?? "",
      phone: user?.phone ?? "",
      email: user?.email ?? "",
      wish: user?.wish ?? "",
    },
  });

  const isDirty = profileFormMethods.formState.isDirty;

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

    const formattedData = {
      name: capitalize(data.name),
      username: data.username,
      phone: data.phone,
    };

    updateProfileMutation.mutate(formattedData, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: userQueryOptions.queryKey });
        toast.dismiss();
        toast.success("Profile updated", {
          description: "Your profile information has been saved.",
        });
        profileFormMethods.reset(formattedData);
      },
      onError: (error) => {
        toast.dismiss();
        if (error?.code === "INPUT_VALIDATION_FAILED") {
          const fieldErrors = error?.data?.fieldErrors;

          if (fieldErrors) {
            for (const key of Object.keys(fieldErrors)) {
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
            }
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
    <Screen safeAreaEdges={["bottom"]} systemBarStyle="light">
      <KeyboardAwareScrollView
        bottomOffset={40}
        contentContainerClassName="px-6 pt-5"
      >
        <View className="gap-10">
          <FormProvider {...profileFormMethods}>
            <View className="gap-5">
              <FormTextInput
                autoCapitalize="words"
                label="Name"
                name="name"
                placeholder={user?.name ?? ""}
              />
              <FormTextInput
                label="Username"
                name="username"
                placeholder={user?.username ?? ""}
              />
              <FormTextInput
                label="Phone"
                name="phone"
                placeholder={user?.phone ?? ""}
              />
              <FormTextInput
                isDisabled
                label="Email Address"
                name="email"
                placeholder={user?.email ?? ""}
              />
              <FormTextInput
                isDisabled
                label="Wish"
                multiline
                name="wish"
                placeholder={user?.wish ?? ""}
              />
              <View className="gap-2">
                <Button
                  isDisabled={updateProfileMutation.isPending || !isDirty}
                  onPress={profileFormMethods.handleSubmit(onUpdateProfile)}
                >
                  {updateProfileMutation.isPending ? (
                    <Spinner />
                  ) : (
                    <Button.Label>Save</Button.Label>
                  )}
                </Button>
              </View>
            </View>
          </FormProvider>

          <Button
            isDisabled={resetPasswordMutation.isPending}
            onPress={onUpdateReset}
          >
            {resetPasswordMutation.isPending ? (
              <Spinner />
            ) : (
              <Button.Label>Request Password Reset</Button.Label>
            )}
          </Button>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

export default Profile;
