import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigation } from "@react-navigation/native";
import { Check } from "@tamagui/lucide-icons";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { toast } from "sonner-native";
import { Checkbox, Label, Paragraph, Spinner, Stack, XStack } from "tamagui";
import { z } from "zod";

import { Screen } from "#/components/Screen";
import { ReportFileSheet } from "#/components/sheets";
import FormInput from "#/components/text-input";
import { Button } from "#/components/ui/Button";
import Select from "#/components/ui/select";
import { openapi } from "#/lib/orpc";

const schema = z.object({
  reportType: z.enum(["shortMessage", "video", "picture"], {
    error: "News type is required",
  }),
  title: z
    .string("Title is required")
    .trim()
    .min(12, "Title must be at least 10 characters"),
  description: z
    .string("Description is required")
    .min(20, "Description must be at least 20 characters"),
  name: z
    .string("Your name is required")
    .trim()
    .min(4, "Your name must be at least 6 characters"),
  files: z
    .array(
      z.object({
        uri: z.string(),
        name: z.string().optional(),
        type: z.string().optional(),
        size: z.number().optional(),
      })
    )
    .refine((files) => files.length > 0, "You must upload at least one file")
    // check total size of files, not more than 30mb
    .refine((files) => {
      const totalSize = files.reduce(
        (prev, curr) => prev + (curr.size ?? 0),
        0
      );
      return totalSize < 30_000_000;
    }, "Total size of files must be less than 30MB"),
  agree: z
    .boolean("You must agree to the terms of use")
    .refine((agree) => agree === true, "You must agree to the terms of use"),
});

export type ReportInput = z.infer<typeof schema>; // TODO: move to schema file

function Report() {
  const createReportMutation = useMutation(
    openapi.report.create.mutationOptions()
  );
  const [open, setOpen] = useState(false);
  const navigation = useNavigation();

  const formMethods = useForm<ReportInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      reportType: "shortMessage",
      files: [],
    },
  });
  const reportType = useWatch({
    control: formMethods.control,
    name: "reportType",
  });

  const onSubmit = (data: ReportInput) => {
    try {
      const fd = new FormData();
      fd.append("name", data.name);
      fd.append("title", data.title);
      fd.append("description", data.description);
      fd.append("reportType", data.reportType);
      data.files.forEach((file, index) => {
        fd.append("files[]", {
          uri: file.uri,
          type: file.type || "application/octet-stream",
          name: file.name || `file-${index}.${file.uri.split(".").pop()}`,
        } as any);
      });

      createReportMutation.mutate(fd, {
        onSuccess: () => {
          toast("Thank you for your report!", {
            description:
              "Your news report has been submitted and will be reviewed shortly.",
          });
          formMethods.reset();
        },
        onError: (err) => {
          // setServerError(err.message);
          console.log(err);
          toast.error("Could not submit your report", {
            description:
              "Please check your connection and try again. If the problem persists, contact support.",
          });
        },
      });
    } catch (error) {
      console.log(error);
      toast.error("Error submitting report", {
        description: "Something went wrong",
      });
    }
  };

  return (
    <Screen gap="$4" px="$2.5">
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingBottom: 50,
          paddingTop: 5,
        }}
        showsVerticalScrollIndicator={false}
        // bottomOffset={40}
        // extraKeyboardSpace={40}
      >
        <FormProvider {...formMethods}>
          <Stack gap="$4">
            <Stack gap="$1">
              <Label>Your name</Label>
              <FormInput name="name" placeholder="Enter your name" />
            </Stack>

            <Stack gap="$1">
              <Label>News Title</Label>
              <FormInput name="title" placeholder="Enter title" />
            </Stack>
            <Stack gap="$1">
              <Label gap="$1">News Description</Label>
              <FormInput
                multiline
                name="description"
                placeholder="Report description here"
              />
            </Stack>

            <Stack gap="$1">
              <Label>News Type</Label>
              <Controller
                control={formMethods.control}
                name="reportType"
                render={({ field: { onChange, value, name } }) => (
                  <Select
                    onChange={(value) => {
                      onChange(value);
                      formMethods.setValue("files", []);
                    }}
                    options={newsTypes}
                    placeholder="Select news type"
                    value={value}
                  />
                )}
              />

              {formMethods.formState.errors.reportType ? (
                <Paragraph color="red" fos="$4" pl="$2">
                  {formMethods.formState.errors["reportType"]?.message}
                </Paragraph>
              ) : null}
            </Stack>

            <Stack gap="$1">
              <Label gap="$1"> Files</Label>
              <Controller
                control={formMethods.control}
                name="files"
                render={({ field: { onChange, value, name } }) => (
                  <ReportFileSheet
                    files={value}
                    open={open}
                    reportType={reportType}
                    setFiles={onChange}
                    setOpen={setOpen}
                  />
                )}
              />
              {formMethods.formState.errors.files ? (
                <Paragraph color="red" fos="$4" pl="$2">
                  {formMethods.formState.errors["files"]?.message}
                </Paragraph>
              ) : null}
            </Stack>

            {/* agree to terms of use */}
            <Stack gap="$1">
              <Controller
                control={formMethods.control}
                name="agree"
                render={({ field: { onChange, value, name } }) => {
                  return (
                    <XStack alignItems="center" gap="$2">
                      <Checkbox
                        ai="center"
                        // unstyled
                        bg={value ? "$color.p500" : "transparent"}
                        boc={value ? "$color.p500" : "gray"}
                        bw={value ? 0 : 1}
                        checked={value}
                        id={name}
                        jc="center"
                        onCheckedChange={onChange}
                        size="$4"
                      >
                        <Checkbox.Indicator>
                          <Check color="white" />
                        </Checkbox.Indicator>
                      </Checkbox>
                      <Label
                        htmlFor={name}
                        pressStyle={{
                          color: "$color",
                        }}
                      >
                        I agree to the{" "}
                        <Paragraph
                          color="#00f"
                          onPress={() => navigation.navigate("TermsOfUse")}
                          textDecorationLine="underline"
                        >
                          terms of use
                        </Paragraph>
                      </Label>
                    </XStack>
                  );
                }}
              />
              {formMethods.formState.errors.agree ? (
                <Paragraph color="red" fos="$4" pl="$2">
                  {formMethods.formState.errors["agree"]?.message}
                </Paragraph>
              ) : null}
            </Stack>

            <Button
              disabled={createReportMutation.isPending}
              onPress={formMethods.handleSubmit(onSubmit)}
            >
              {createReportMutation.isPending && (
                <Button.Icon>
                  <Spinner color="$s50" />
                </Button.Icon>
              )}
              <Button.Text>Submit</Button.Text>
            </Button>
          </Stack>
        </FormProvider>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

export default Report;

const newsTypes = [
  { title: "Short Message", value: "shortMessage" },
  { title: "Video", value: "video" },
  { title: "Picture", value: "picture" },
];
