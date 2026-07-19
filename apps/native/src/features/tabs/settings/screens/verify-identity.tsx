import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { cn } from "heroui-native";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { FieldError } from "heroui-native/field-error";
import { ListGroup } from "heroui-native/list-group";
import { Separator } from "heroui-native/separator";
import { Spinner } from "heroui-native/spinner";
import { CameraIcon, CameraRotateIcon } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { Alert, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { z } from "zod";

import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import FormTextInput from "#/components/heroui/text-input";
import useUser from "#/hooks/useUser";
import { openapi, orpc } from "#/lib/orpc";

const schema = z.object({
  firstName: z
    .string("First name is required")
    .trim()
    .min(3, "First name must be at least 3 characters"),
  lastName: z
    .string("Last name is required")
    .trim()
    .min(3, "Last name must be at least 3 characters"),
  email: z.email("Enter a valid email"),
  phoneNumber: z
    .string("Phone number is required")
    .trim()
    .regex(/^\d+$/, "Invalid phone number"),
  shippingAddress: z
    .string("Shipping address is required")
    .trim()
    .min(3, "Address must be at least 3 characters"),
  governmentId: z.object({
    front: z.object({
      uri: z.string(),
      type: z.string(),
      name: z.string(),
    }),
    back: z.object({
      uri: z.string(),
      type: z.string(),
      name: z.string(),
    }),
  }),
});

export type VerifyIdentityInput = z.infer<typeof schema>;

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const VerifyIdentity = () => {
  const { data: session } = useUser();
  const user = session?.user;
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const positionRef = useRef<"front" | "back">("back");

  const mutation = useMutation(
    openapi.lottery.verifyIdentity.mutationOptions()
  );

  const navigation = useNavigation();
  const identityStatus = useQuery(
    orpc.lottery.identityStatus.queryOptions({
      meta: { persist: false },
      staleTime: 0,
    })
  );

  const formMethods = useForm<VerifyIdentityInput>({
    resolver: zodResolver(schema),
  });

  const { getValues, setValue, handleSubmit } = formMethods;

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 2],
      quality: 1,
    });

    if (
      !result.canceled &&
      result.assets[0]?.fileSize &&
      result.assets[0].fileSize > MAX_FILE_SIZE
    ) {
      Alert.alert("File too large", "Please select a file smaller than 5MB.");
      return;
    }

    if (!result.canceled && result.assets[0]) {
      if (positionRef.current === "back") {
        setValue("governmentId.back", {
          uri: result.assets[0].uri,
          type: result.assets[0].mimeType ?? "",
          name: result.assets[0].fileName ?? "",
        });
      } else {
        setValue("governmentId.front", {
          uri: result.assets[0].uri,
          type: result.assets[0].mimeType ?? "",
          name: result.assets[0].fileName ?? "",
        });
      }
      setOpen(false);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Permission Denied",
        "Sorry, we need camera permissions to take a photo."
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [3, 2],
        quality: 1,
      });

      if (
        !result.canceled &&
        result.assets[0]?.fileSize &&
        result.assets[0].fileSize > MAX_FILE_SIZE
      ) {
        Alert.alert("File too large", "Please select a file smaller than 5MB.");
        return;
      }

      if (!result.canceled && result.assets[0]) {
        positionRef.current === "back"
          ? setValue("governmentId.back", {
              uri: result.assets[0].uri,
              type: result.assets[0].mimeType ?? "",
              name: result.assets[0].fileName ?? "",
            })
          : setValue("governmentId.front", {
              uri: result.assets[0].uri,
              type: result.assets[0].mimeType ?? "",
              name: result.assets[0].fileName ?? "",
            });
        setOpen(false);
      }
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Failed to take photo");
    }
  };

  const onSubmit = (data: VerifyIdentityInput) => {
    const formData = new FormData();
    formData.append("firstName", data.firstName);
    formData.append("lastName", data.lastName);
    formData.append("email", data.email);
    formData.append("phoneNumber", data.phoneNumber);
    formData.append("shippingAddress", data.shippingAddress);
    formData.append("governmentId.front", data.governmentId.front as any);
    formData.append("governmentId.back", data.governmentId.back as any);

    mutation.mutate(formData, {
      onSuccess: () => {
        toast("Success", {
          description: "Identity verification submitted successfully",
        });
        formMethods.reset();
      },
      onError: (err) => {
        console.log(err);
        toast.error("Error verifying identity", {
          description: "Something went wrong",
        });
      },
    });
  };

  useEffect(() => {
    if (user) {
      formMethods.reset({
        phoneNumber: user?.phone,
        email: user.email,
      });
    }
  }, [user, formMethods.reset]);

  useEffect(() => {
    if (identityStatus.data && !identityStatus.isFetching) {
      formMethods.reset({
        firstName: identityStatus.data.firstName,
        lastName: identityStatus.data.lastName,
        phoneNumber: identityStatus.data.phoneNumber,
        email: identityStatus.data.email,
        shippingAddress: identityStatus.data.shippingAddress,
      });

      Alert.alert(
        "Identity verification submitted",
        "You have already submitted your identity.",
        [
          {
            text: "OK",
            onPress: () => {
              navigation.goBack();
            },
          },
        ]
      );
    }
  }, [
    identityStatus.data,
    identityStatus.isFetching,
    navigation.goBack,
    formMethods.reset,
  ]);

  if (identityStatus.isPending || identityStatus.isFetching) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Spinner size="lg" />
      </View>
    );
  }

  return (
    <Screen safeAreaEdges={["bottom"]} systemBarStyle="light">
      <KeyboardAwareScrollView
        bottomOffset={40}
        contentContainerClassName="gap-6 px-5 pt-5 pb-12"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-base text-muted-foreground">
          To ensure a safe and compliant prize delivery from the Giveaway, we
          need to verify your identity.
        </Text>

        <FormProvider {...formMethods}>
          <View className="gap-5">
            <FormTextInput
              autoCapitalize="words"
              label="First Name"
              name="firstName"
              placeholder=""
            />
            <FormTextInput
              autoCapitalize="words"
              label="Last Name"
              name="lastName"
              placeholder=""
            />
            <FormTextInput
              keyboardType="phone-pad"
              label="Phone Number"
              name="phoneNumber"
              placeholder=""
            />
            <FormTextInput
              keyboardType="email-address"
              label="Email Address"
              name="email"
              placeholder=""
            />
            <FormTextInput
              label="Shipping Address"
              multiline
              name="shippingAddress"
              placeholder=""
            />

            <View className="gap-2">
              <Text className="font-semibold">
                Government-issued ID (Front and Back)
              </Text>
              <View className="flex-row gap-2">
                <Controller
                  name="governmentId.front"
                  render={({ field: { value }, fieldState: { error } }) => (
                    <View className="flex-1">
                      <View
                        className={cn(
                          "h-40 flex-1 items-center justify-center overflow-hidden rounded-xl border-2",
                          error ? "border-red-500" : "border-gray-200"
                        )}
                        onTouchEnd={() => {
                          positionRef.current = "front";
                          setOpen(true);
                        }}
                      >
                        <Icon name={CameraIcon} size={24} />
                        <Text className="mt-1 text-sm">Front</Text>
                        {value?.uri ? (
                          <Image
                            contentFit="cover"
                            source={{ uri: value.uri }}
                            style={{
                              position: "absolute",
                              width: "100%",
                              height: "100%",
                            }}
                          />
                        ) : null}
                      </View>
                      {error ? <FieldError>{error.message}</FieldError> : null}
                    </View>
                  )}
                />
                <Controller
                  name="governmentId.back"
                  render={({ field: { value }, fieldState: { error } }) => (
                    <View className="flex-1">
                      <View
                        className={cn(
                          "h-40 flex-1 items-center justify-center overflow-hidden rounded-xl border-2",
                          error ? "border-red-500" : "border-gray-200"
                        )}
                        onTouchEnd={() => {
                          positionRef.current = "back";
                          setOpen(true);
                        }}
                      >
                        <Icon name={CameraRotateIcon} size={24} />
                        <Text className="mt-1 text-sm">Back</Text>
                        {value?.uri ? (
                          <Image
                            contentFit="cover"
                            source={{ uri: value.uri }}
                            style={{
                              position: "absolute",
                              width: "100%",
                              height: "100%",
                            }}
                          />
                        ) : null}
                      </View>
                      {error ? <FieldError>{error.message}</FieldError> : null}
                    </View>
                  )}
                />
              </View>
            </View>

            <Button
              isDisabled={mutation.isPending}
              onPress={handleSubmit(onSubmit)}
            >
              {mutation.isPending ? <Spinner /> : null}
              <Button.Label>Submit</Button.Label>
            </Button>
          </View>
        </FormProvider>
      </KeyboardAwareScrollView>

      <BottomSheet isOpen={open} onOpenChange={setOpen}>
        {/* FullWindowOverlay (default) renders in a separate native iOS
        window so the sheet appears above modals/keyboard, but that also
        blocks the RN element inspector, which attaches to the main window
        only. Disabled in dev so the inspector keeps working. */}
        <BottomSheet.Portal disableFullWindowOverlay={__DEV__}>
          <BottomSheet.Overlay />
          <BottomSheet.Content style={{ paddingBottom: insets.bottom }}>
            <ListGroup variant="transparent">
              <Text className="px-4 pb-3 font-semibold">Upload a file</Text>
              <Separator />
              <ListGroup.Item onPress={takePhoto}>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>Take a photo</ListGroup.ItemTitle>
                </ListGroup.ItemContent>
              </ListGroup.Item>
              <Separator className="mx-4" />
              <ListGroup.Item onPress={pickImage}>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>Choose a photo</ListGroup.ItemTitle>
                </ListGroup.ItemContent>
              </ListGroup.Item>
              <Separator className="mx-4" />
              <ListGroup.Item
                onPress={() => {
                  const current = getValues("governmentId");
                  if (positionRef.current === "front") {
                    setValue("governmentId", {
                      ...current,
                      front: { uri: "", type: "", name: "" },
                    });
                  } else {
                    setValue("governmentId", {
                      ...current,
                      back: { uri: "", type: "", name: "" },
                    });
                  }
                  setOpen(false);
                }}
              >
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>Remove</ListGroup.ItemTitle>
                </ListGroup.ItemContent>
              </ListGroup.Item>
            </ListGroup>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </Screen>
  );
};

export default VerifyIdentity;
