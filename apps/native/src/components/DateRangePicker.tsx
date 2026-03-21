import { X } from "@tamagui/lucide-icons";
import { addDays } from "date-fns";
import { useRef, useState } from "react";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { Dialog, Fieldset, Label, Text, Unspaced, XStack } from "tamagui";

import { useGlobalBackHandler } from "#/hooks/useBackHandler";

import { Button } from "./ui";

export function DateRangePicker({
  open,
  setOpen,
  onDateFilter,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  onDateFilter: (startDate: Date, endDate: Date) => void;
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());

  const dateRef = useRef<"startDate" | "endDate">("startDate");
  useGlobalBackHandler(() => {
    if (open) {
      setOpen(false);
      return true;
    }

    return false;
  });

  const onConfirm = (date: Date) => {
    if (dateRef.current === "startDate") {
      setStartDate(date);
    } else {
      setEndDate(date);
    }
    setShowDatePicker(false);
  };

  const onCancel = () => {
    setShowDatePicker(false);
  };

  const onSave = () => {
    onDateFilter(startDate, addDays(endDate, 1));
    setOpen(false);
  };

  return (
    <>
      <Dialog modal open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay
            key="overlay"
            animation="slow"
            backgroundColor="black"
            opacity={0.7}
            onPress={() => console.log("close")}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />

          <Dialog.Content
            bordered
            elevate
            key="content"
            animateOnly={["transform", "opacity"]}
            animation={[
              "quick",
              {
                opacity: {
                  overshootClamping: true,
                },
              },
            ]}
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            gap="$4"
            width="90%"
          >
            <Dialog.Title asChild fontSize="$7">
              <Text fontSize="$2">Choose a date range</Text>
            </Dialog.Title>
            <Fieldset gap="$1">
              <Label htmlFor="startDate">Start Date</Label>
              <Button
                outlined
                onPress={() => {
                  setShowDatePicker(true);
                  dateRef.current = "startDate";
                }}
              >
                <Button.Text color="black">
                  {startDate?.toDateString()}
                </Button.Text>
              </Button>
            </Fieldset>
            <Fieldset gap="$1">
              <Label htmlFor="endDate">End Date</Label>
              <Button
                outlined
                onPress={() => {
                  setShowDatePicker(true);
                  dateRef.current = "endDate";
                }}
              >
                <Button.Text color="black">
                  {endDate?.toDateString()}
                </Button.Text>
              </Button>
            </Fieldset>

            <XStack>
              <Button aria-label="Close" w="100%" onPress={onSave}>
                <Button.Text>Save</Button.Text>
              </Button>
            </XStack>

            <Unspaced>
              <Dialog.Close asChild>
                <Button
                  ghost
                  position="absolute"
                  top="$3"
                  right="$3"
                  size="$4"
                  circular
                >
                  <X />
                </Button>
              </Dialog.Close>
            </Unspaced>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
      <DateTimePickerModal
        isVisible={showDatePicker}
        mode="date"
        maximumDate={new Date()}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </>
  );
}
