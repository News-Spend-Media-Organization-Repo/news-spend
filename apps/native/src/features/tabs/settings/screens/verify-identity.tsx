import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { Alert } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { toast } from "sonner-native";
import {
  ListItem,
  Paragraph,
  Separator,
  Sheet,
  Spinner,
  Square,
  Stack,
  Text,
  XStack,
  YGroup,
  YStack,
} from "tamagui";
import { Camera, CameraRotate } from "tamagui-phosphor";
import { z } from "zod";

import { Screen } from "#/components/Screen";
import FormInput from "#/components/text-input";
import { Button, Image } from "#/components/ui";
import useUser from "#/hooks/useUser";
import { openapi, orpc } from "#/lib/orpc";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

const schema = z.object({
  firstName: z
    .string()
    .trim()
    .min(3, "First name must be at least 3 characters"),
  lastName: z.string().trim().min(3, "Last name must be at least 3 characters"),
  email: z.email(),
  phoneNumber: z.string().trim().regex(/^\d+$/, "Invalid phone number"),
  shippingAddress: z
    .string()
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
  const insets = useSafeAreaInsetsStyle(["bottom"]);
  const positionRef = useRef<string>("back");
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

  const { getValues, setValue, handleSubmit, watch } = formMethods;

  const pickImage = async () => {
    // No permissions request is necessary for launching the image library
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 2],
      quality: 1,
    });

    // check file size
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
    // Request camera permissions
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
    } finally {
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
      onSuccess: (_data, _variables, _onMutateResult, ctx) => {
        toast("Success", {
          description: "Identity verification submitted successfully",
        });
        formMethods.reset();
        return ctx?.client.invalidateQueries({
          queryKey: orpc.lottery.identityStatus.key(),
        });
      },
      onError: (err) => {
        console.log(err);
        toast.error("Error verifying identity", {
          description: "Something went wrong",
        });
      },
      onSettled: (_data, _err, _variables, _onMutateResult, ctx) => {},
    });
  };

  useEffect(() => {
    if (user) {
      formMethods.reset({
        phoneNumber: user?.phone,
        email: user.email,
      });
    }
  }, [user]);

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
      return;
    }
  }, [identityStatus.data, identityStatus.isFetching]);

  if (identityStatus.isPending || identityStatus.isFetching) {
    return (
      <Stack ai="center" bg="$background" flex={1} jc="center">
        <Spinner size="large" />
      </Stack>
    );
  }
  return (
    <Screen>
      <KeyboardAwareScrollView
        bottomOffset={40}
        contentContainerStyle={{
          paddingHorizontal: 25,
          paddingTop: 20,
          paddingBottom: 50,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Paragraph color="gray" fos="$4" mb="$2">
          To ensure a safe and compliant prize delivery from the lottery, we
          need to verify your identity.
        </Paragraph>
        <Stack gap="$10">
          <FormProvider {...formMethods}>
            <YStack gap="$5">
              <YStack gap="$2">
                <Paragraph fontSize="$5">First Name</Paragraph>
                <FormInput
                  autoCapitalize="words"
                  name="firstName"
                  placeholder=""
                />
              </YStack>
              <YStack gap="$2">
                <Paragraph fontSize="$5">Last Name</Paragraph>
                <FormInput
                  autoCapitalize="words"
                  name="lastName"
                  placeholder=""
                />
              </YStack>
              <YStack gap="$2">
                <Paragraph fontSize="$5">Phone Number</Paragraph>
                <FormInput
                  keyboardType="phone-pad"
                  name="phoneNumber"
                  placeholder=""
                />
              </YStack>
              <YStack gap="$2">
                <Paragraph fontSize="$5">Email Address</Paragraph>
                <FormInput
                  keyboardType="email-address"
                  name="email"
                  placeholder=""
                />
              </YStack>
              <YStack gap="$2">
                <Paragraph fontSize="$5">Shipping Address</Paragraph>
                <FormInput multiline name="shippingAddress" placeholder="" />
              </YStack>

              <Stack gap="$2">
                <Paragraph>Government-issued ID (Front and Back)</Paragraph>
                <XStack gap="$2">
                  <Controller
                    name="governmentId.front"
                    render={({
                      field: { onChange, value },
                      fieldState: { error },
                    }) => (
                      <YStack flex={1}>
                        <Square
                          boc={error ? "red" : "#E4E3E3"}
                          br="$5"
                          bw="$0.5"
                          flex={1}
                          h="$10"
                          onPress={() => {
                            positionRef.current = "front";
                            setOpen(true);
                          }}
                          overflow="hidden"
                        >
                          <Camera size="$3" />
                          <Text>Front</Text>
                          {value ? (
                            <Image
                              h="100%"
                              pos="absolute"
                              source={{ uri: value?.uri }}
                              w="100%"
                            />
                          ) : null}
                        </Square>
                        {error && (
                          <Text color="red" fontSize="$2" mt="$1">
                            {error.message}
                          </Text>
                        )}
                      </YStack>
                    )}
                  />
                  <Controller
                    name="governmentId.back"
                    render={({ field: { value }, fieldState: { error } }) => (
                      <YStack flex={1}>
                        {console.log(value)}
                        <Square
                          boc={error ? "red" : "#E4E3E3"}
                          br="$5"
                          bw="$0.5"
                          flex={1}
                          h="$10"
                          onPress={() => {
                            positionRef.current = "back";
                            setOpen(true);
                          }}
                          overflow="hidden"
                        >
                          <CameraRotate size="$3" />
                          <Text>Back</Text>
                          {value ? (
                            <Image
                              h="100%"
                              pos="absolute"
                              source={{ uri: value?.uri }}
                              w="100%"
                            />
                          ) : null}
                        </Square>
                        {error && (
                          <Text color="red" fontSize="$2" mt="$1">
                            {error.message}
                          </Text>
                        )}
                      </YStack>
                    )}
                  />
                </XStack>
              </Stack>
              <YStack gap="$2">
                <Button
                  disabled={mutation.isPending}
                  onPress={handleSubmit(onSubmit)}
                >
                  {mutation.isPending ? (
                    <Button.Icon>
                      <Spinner color="$s50" />
                    </Button.Icon>
                  ) : (
                    <Button.Text>Submit</Button.Text>
                  )}
                </Button>
              </YStack>
            </YStack>
          </FormProvider>
        </Stack>
      </KeyboardAwareScrollView>
      <Sheet
        animation="easeIn"
        dismissOnSnapToBottom
        forceRemoveScrollEnabled={open}
        modal
        onOpenChange={setOpen}
        open={open}
        snapPointsMode="fit"
        zIndex={100_000}
      >
        <Sheet.Overlay bg="rgba(0, 0, 0, 0.5)" />
        <Sheet.Frame style={insets}>
          <YGroup alignSelf="center" size="$4">
            <ListItem fontWeight="800">Upload a file</ListItem>
            <Separator />
            <YGroup.Item>
              <ListItem
                onPress={takePhoto}
                pressStyle={{
                  bg: "#f9f9f9",
                }}
              >
                Take a photo
              </ListItem>
              <ListItem
                onPress={pickImage}
                pressStyle={{
                  bg: "#f9f9f9",
                }}
              >
                Choose a photo
              </ListItem>
              <ListItem
                onPress={() => {
                  setValue("governmentId", {
                    ...getValues("governmentId"),
                    [positionRef.current]: null,
                  });
                  setOpen(false);
                }}
                pressStyle={{
                  bg: "#f9f9f9",
                }}
              >
                Remove
              </ListItem>
            </YGroup.Item>
          </YGroup>
        </Sheet.Frame>
      </Sheet>
    </Screen>
  );
};

export default VerifyIdentity;
