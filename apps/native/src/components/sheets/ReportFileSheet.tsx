import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import {
  ListItem,
  Paragraph,
  Separator,
  Sheet,
  Stack,
  Text,
  XStack,
  YGroup,
} from "tamagui";
import { FileArrowUp, X } from "tamagui-phosphor";

import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

type ReportFileSheetProps = {
  reportType: "shortMessage" | "picture" | "video";
  open: boolean;
  setOpen: (open: boolean) => void;
  files: (
    | ImagePicker.ImagePickerAsset
    | {
        uri: string;
        name?: string;
        type?: string;
        mimeType?: string;
        size?: number;
        fileName?: string;
      }
  )[];
  setFiles: (files: ReportFileSheetProps["files"]) => void;
};

const getFileName = (uri: string) => uri.split("/").pop();

export default function ReportFileSheet({
  reportType,
  open,
  setOpen,
  files,
  setFiles,
}: ReportFileSheetProps) {
  const [hasPermission, requestPermission] = ImagePicker.useCameraPermissions();
  const insets = useSafeAreaInsetsStyle(["bottom"]);
  const type =
    reportType === "shortMessage"
      ? ["application/msword", "application/pdf", "image/*"]
      : reportType === "picture"
        ? ["image/*"]
        : ["video/*"];

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // System should accept word, pdf, and any image
        type,
        copyToCacheDirectory: true,
        multiple: true,
      });

      // add 30mb limit
      const totalSize = result?.assets?.reduce(
        (prev, curr) => prev + (curr.size ?? 0),
        0
      );
      if (totalSize && totalSize > 30_000_000) {
        Alert.alert(
          "File size limit exceeded",
          "Please select files with a total size of less than 30MB.",
          [{ text: "OK" }]
        );

        return;
      }

      if (result.canceled) {
        alert("You did not select any file.");
      } else {
        // console.log("🚀 ~ pickDocument ~ result:", result);
        setFiles([
          ...files,
          {
            uri: result.assets[0].uri,
            name: result.assets[0].name ?? "",
            type: result.assets[0].mimeType ?? "",
            size: result.assets[0].size ?? 0,
          },
        ]);
      }

      // console.log(result);

      setOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const pickImageOrVideoAsync = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: reportType === "picture" ? ["images"] : ["videos"],
      quality: 1,
      allowsMultipleSelection: true,
    });

    if (result.canceled) {
      Alert.alert(
        `You did not select any ${reportType === "picture" ? "image" : "video"}.`
      );
    } else {
      console.log("🚀 ~ pickImageOrVideoAsync ~ result:", result);
      setFiles([
        ...files,
        {
          uri: result.assets[0].uri,
          name: result.assets[0].fileName ?? "",
          type: result.assets[0].mimeType ?? "",
          size: result.assets[0].fileSize ?? 0,
        },
      ]);
    }

    setOpen(false);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
    });

    if (result.canceled) {
      Alert.alert(`You did not select any "image".`);
    } else {
      console.log("🚀 ~ pickImage ~ result:", result);
      setFiles([
        ...files,
        {
          uri: result.assets[0].uri,
          name: result.assets[0].fileName ?? "",
          type: result.assets[0].mimeType ?? "",
          size: result.assets[0].fileSize ?? 0,
        },
      ]);
    }

    setOpen(false);
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
    });

    // console.log("🚀 ~ pickVideo ~ result:", result);
    if (result.canceled) {
      Alert.alert(`You did not select any "video".`);
    } else {
      setFiles([
        ...files,
        {
          uri: result.assets[0].uri,
          name: result.assets[0].fileName ?? "",
          type: result.assets[0].mimeType ?? "",
          size: result.assets[0].fileSize ?? 0,
        },
      ]);
    }

    setOpen(false);
  };
  return (
    <>
      <Stack
        borderColor="#E4E3E3"
        borderStyle="dashed"
        borderWidth="$0.5"
        onPress={() => setOpen(!open)}
        p="$4"
        userSelect="none"
      >
        <XStack jc="space-between">
          <Paragraph>Click here to upload file</Paragraph>
          <FileArrowUp size={20} />
        </XStack>
        <Paragraph color="gray" size="$2" ta="center">
          {reportType === "picture"
            ? "Image"
            : reportType === "video"
              ? "Video"
              : "PDF, DOC, or image"}{" "}
          format up to 30MB
        </Paragraph>

        <YGroup
          alignSelf="center"
          bordered
          separator={<Separator />}
          width="100%"
        >
          {files.map((file, i) => {
            const fileName = file.name ?? getFileName(file.uri);
            const bytes = file.size ?? 1000;
            const kb = bytes / 1024;
            const size =
              kb < 1024 ? `${Math.round(kb)}KB` : `${Math.round(kb / 1024)}MB`;

            return (
              <YGroup.Item key={i}>
                <XStack
                  ai="center"
                  gap="$1.5"
                  onStartShouldSetResponder={() => true}
                  px="$4"
                  py="$3"
                >
                  <Text
                    color="gray"
                    ellipsizeMode="middle"
                    flex={2}
                    numberOfLines={1}
                  >
                    {fileName}
                  </Text>
                  <Paragraph color="gray" flex={1} size="$3">
                    {size ?? ""}
                  </Paragraph>
                  <XStack ai="center">
                    <Stack>
                      <X
                        onPress={() =>
                          setFiles(files.filter((_, index) => index !== i))
                        }
                        size={20}
                      />
                    </Stack>
                  </XStack>
                </XStack>
              </YGroup.Item>
            );
          })}
        </YGroup>
      </Stack>

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
            <ListItem fontWeight="800">Upload file</ListItem>
            <Separator />
            <YGroup.Item>
              <ListItem
                onPress={
                  reportType === "shortMessage"
                    ? pickDocument
                    : pickImageOrVideoAsync
                }
              >
                Select file from your device
              </ListItem>
            </YGroup.Item>
            {reportType === "video" ? (
              <YGroup.Item>
                <ListItem onPress={pickVideo}>
                  Record video from camera
                </ListItem>
              </YGroup.Item>
            ) : null}
            {reportType === "picture" ? (
              <YGroup.Item>
                <ListItem onPress={pickImage}>
                  Take a picture from the app
                </ListItem>
              </YGroup.Item>
            ) : null}
          </YGroup>
        </Sheet.Frame>
      </Sheet>
    </>
  );
}
