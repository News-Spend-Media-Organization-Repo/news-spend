import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { toast } from "sonner-native";
import { H4, Label, Spinner, Stack, Text, XStack } from "tamagui";
import { StarFill } from "tamagui-phosphor";
import { useSnapshot } from "valtio";
import { z } from "zod";

import { Screen } from "#/components/Screen";
import FormInput from "#/components/text-input";
import { Button } from "#/components/ui/Button";
import { orpc } from "#/lib/orpc";
import { authState } from "#/state/auth";

const formSchema = z
  .object({
    name: z.string().min(3, "Name must be at least 3 characters"),
    email: z.email(),
    message: z.string().min(30, "Message must be at least 30 characters"),
    rating: z
      .number({
        error: "Choose a rating",
      })
      .min(1, {
        message: "Choose a rating",
      })
      .max(5)
      .optional(),
  })
  .strict();

const Feedback = () => {
  const { user } = useSnapshot(authState);

  const formMethods = useForm<z.infer<typeof formSchema>>({
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
      message: "",
      rating: 0,
    },
    resolver: zodResolver(formSchema),
  });

  const { setValue, handleSubmit, watch, formState } = formMethods;

  const mutation = useMutation(
    orpc.feedback.create.mutationOptions({
      onSuccess: () => {
        toast.success("Thank you for your feedback!", {
          description: "We'll get back to you shortly.",
        });
        formMethods.reset({
          name: user?.name || "",
          email: user?.email || "",
          message: "",
          rating: 0,
        });
      },
      onError: (err) => {
        toast.error("Error submitting feedback", {
          description: "Something went wrong",
        });
        console.log(err);
      },
    })
  );

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    mutation.mutate({
      type: "general",
      ...data,
    });
  };

  return (
    <Screen>
      <KeyboardAwareScrollView
        bottomOffset={100}
        showsVerticalScrollIndicator={false}
      >
        <FormProvider {...formMethods}>
          <Stack gap="$4" p="$3">
            <H4>We'd love to hear from you!</H4>

            <Stack gap="$5">
              <Stack gap="$2">
                <Label>Name</Label>

                <FormInput name="name" placeholder="Your name" />
              </Stack>

              <Stack gap="$2">
                <Label>Email</Label>

                <FormInput name="email" placeholder="Your email" />
              </Stack>

              <Stack gap="$3">
                <Label>How would you rate your experience?</Label>

                {/* stars */}
                <XStack flex={1}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <StarFill
                      color={i >= (watch("rating") ?? 0) ? "#aaa" : "#ffb300"}
                      key={i}
                      onPress={() => setValue("rating", i + 1)}
                      size="$6"
                    />
                  ))}
                </XStack>
                {formState.errors.rating && (
                  <Text color="red" fos="$4" pl="$2">
                    {formState.errors.rating.message}
                  </Text>
                )}
              </Stack>

              <Stack gap="$2">
                <Label>What can we do better?</Label>
                <FormInput
                  multiline
                  name="message"
                  placeholder="Type here..."
                />
              </Stack>

              <Button
                disabled={mutation.isPending}
                onPress={handleSubmit(onSubmit)}
              >
                <Button.Text>Submit</Button.Text>
                {mutation.isPending ? (
                  <Button.Icon>
                    <Spinner color="$s50" />
                  </Button.Icon>
                ) : null}
              </Button>
            </Stack>
          </Stack>
        </FormProvider>
      </KeyboardAwareScrollView>
    </Screen>
  );
};
export default Feedback;
