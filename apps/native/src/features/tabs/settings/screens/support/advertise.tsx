import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { toast } from "sonner-native";
import { Label, Paragraph, Spinner, Stack, useTheme } from "tamagui";
import { useSnapshot } from "valtio";
import { z } from "zod";

import { Screen } from "#/components/Screen";
import FormInput from "#/components/text-input";
import { Button } from "#/components/ui/Button";
import { orpc } from "#/lib/orpc";
import { authState } from "#/state/auth";

const formSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  email: z.email(),
  message: z.string().min(30, "Message must be at least 30 characters"),
});

const Advertise = () => {
  const { user } = useSnapshot(authState);
  const theme = useTheme();
  const formMethods = useForm<z.infer<typeof formSchema>>({
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
      message: "",
    },
    resolver: zodResolver(formSchema),
  });

  const mutation = useMutation(
    orpc.feedback.create.mutationOptions({
      onSuccess: () => {
        toast.success("Thank you for your enquiry!", {
          description: "We'll get back to you shortly.",
        });
        formMethods.reset({
          name: user?.name || "",
          email: user?.email || "",
          message: "",
        });
      },
      onError: (err) => {
        toast.error("Failed to submit your advertisement enquiry", {
          description: "Please check your connection and try again.",
        });
        console.log(err);
      },
    })
  );

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    mutation.mutate({
      type: "advertisement",
      ...data,
    });
  };

  return (
    <Screen>
      <KeyboardAwareScrollView
        bottomOffset={100}
        contentContainerStyle={{ backgroundColor: theme.$background?.val }}
        showsVerticalScrollIndicator={false}
      >
        <FormProvider {...formMethods}>
          <Stack gap="$4" p="$3">
            <Paragraph>
              We're always looking for great partners to advertise with. Please
              provide us with the following information and we'll get back to
              you shortly.
            </Paragraph>

            <Stack gap="$5">
              <Stack gap="$2">
                <Label>Name</Label>

                <FormInput name="name" placeholder="Your name" />
              </Stack>

              <Stack gap="$2">
                <Label>Email</Label>

                <FormInput name="email" placeholder="Your email" />
              </Stack>

              <Stack gap="$2">
                <Label>Message</Label>
                <FormInput
                  multiline
                  name="message"
                  placeholder="Type here..."
                />
              </Stack>

              <Button
                disabled={mutation.isPending}
                onPress={formMethods.handleSubmit(onSubmit)}
              >
                <Button.Text>Send</Button.Text>
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
export default Advertise;
