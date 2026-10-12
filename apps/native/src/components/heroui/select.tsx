import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { ControlField } from "heroui-native/control-field";
import { FieldError } from "heroui-native/field-error";
import { useThemeColor } from "heroui-native/hooks";
import { Label } from "heroui-native/label";
import { ScrollShadow } from "heroui-native/scroll-shadow";
import { Select } from "heroui-native/select";
import { Separator } from "heroui-native/separator";
import { cn } from "heroui-native/utils";
import { Fragment, type ReactNode } from "react";
import { useController, useFormContext } from "react-hook-form";
import { ScrollView } from "react-native";
import { KeyboardController } from "react-native-keyboard-controller";

type SelectOption = { label: string; value: string };
type ItemRenderProps = { isSelected: boolean };

/**
 * How the option list is presented.
 *
 * `popover` is a floating, positioned panel. That is fine for a short list, but
 * it does not scroll reliably on Android — see the note on the list body below
 * — so longer option sets should use `bottom-sheet`.
 */
export type SelectPresentation = "popover" | "bottom-sheet";

type Props = {
  name: string;
  placeholder: string;
  label?: string;
  labelClassName?: string;
  options: SelectOption[];
  renderItem: (option: SelectOption, props: ItemRenderProps) => ReactNode;
  renderTriggerPrefix?: () => ReactNode;
  selectionMode?: "single" | "multiple";
  scrollable?: boolean;
  presentation?: SelectPresentation;
  contentClassName?: string;
  triggerClassName?: string;
  controlFieldClassName?: string;
};

export function FormSelectField({
  name,
  placeholder,
  label,
  labelClassName,
  options,
  renderItem,
  renderTriggerPrefix,
  selectionMode = "single",
  scrollable = false,
  presentation = "popover",
  contentClassName,
  triggerClassName,
  controlFieldClassName,
}: Props) {
  const { control } = useFormContext();
  const { field, fieldState } = useController({ name, control });
  const { error, invalid } = fieldState;

  const items = options.map((option, index) => (
    <Fragment key={option.value}>
      <Select.Item
        className={cn(
          "flex-1 flex-row overflow-hidden rounded-[10px] px-2",
          // The sheet separates rows with hairlines and wants the taller, more
          // comfortable row the HeroUI example has. The popover keeps its
          // compact row, which is built around its selection pill.
          presentation === "bottom-sheet" ? "py-2" : "p-0"
        )}
        label={option.label}
        value={option.value}
      >
        {(renderProps) => renderItem(option, renderProps)}
      </Select.Item>
      {/* A sheet separates its rows with a hairline; a popover keeps the row
          gap its selection pill is designed around. Interleaved here rather
          than in SelectList so each row keeps its own key. */}
      {presentation === "bottom-sheet" && index < options.length - 1 ? (
        <Separator />
      ) : null}
    </Fragment>
  ));

  return (
    <ControlField
      className={cn("flex-col items-stretch gap-1.5", controlFieldClassName)}
      isInvalid={invalid}
    >
      {label && (
        <Label>
          <Label.Text className={cn("", labelClassName)}>{label}</Label.Text>
        </Label>
      )}
      <Select
        onValueChange={(val) => {
          field.onChange(val);
          field.onBlur();
        }}
        presentation={presentation}
        selectionMode={selectionMode}
        value={field.value}
      >
        <Select.Trigger
          className={cn(
            "h-12.5 w-full flex-row items-center gap-2 rounded-lg border-[1.5px] px-3.5",
            invalid ? "border-danger" : "border-field-border",
            triggerClassName
          )}
          onPress={() => KeyboardController.dismiss()}
          variant="unstyled"
        >
          {renderTriggerPrefix?.()}
          {/* flex-1 so the value takes the slack and the chevron is pushed to
              the trailing edge. Without it the indicator is a zero-width view
              and sits hard against the end of the text, drifting left as the
              label gets shorter. */}
          <Select.Value
            className={cn(
              "flex-1 text-sm",
              (!field.value || field.value?.length === 0) &&
                "text-field-placeholder"
            )}
            numberOfLines={1}
            placeholder={placeholder}
          />
          <Select.TriggerIndicator className="shrink-0" />
        </Select.Trigger>

        <Select.Portal>
          <Select.Overlay className="bg-black/50" />
          {/*
            The presentation has to match on the root and on the content, and
            the popover-only props (`avoidCollisions`, `placement`, `width`) are
            not valid on a sheet — so these stay two branches rather than one
            element built by spreading a conditional prop object.
          */}
          {presentation === "bottom-sheet" ? (
            /* A snap point sets the height and dynamic sizing is turned off so
               the sheet measures against the detent rather than its content.
               Without the detent a twenty-option list opens taller than the
               screen, and a short one opens as a sliver. */
            <Select.Content
              backgroundClassName="bg-transparent shadow-none"
              contentContainerClassName={cn(
                // The card itself, matching HeroUI's own sheet: detached from
                // the screen edges, rounded at the top, riding on the app's
                // overlay surface. `overflow-hidden` is load-bearing — it is
                // what clips rows at the card's edge as they scroll past, which
                // is the cue that there is more below.
                "mx-2.5 h-full overflow-hidden rounded-t-4xl border border-separator/20 bg-overlay pt-1 pb-1",
                contentClassName
              )}
              contentContainerProps={{
                style: { borderCurve: "continuous" },
              }}
              detached
              enableDynamicSizing={false}
              enableOverDrag={false}
              handleClassName="h-1"
              handleIndicatorClassName="w-12 h-[3px]"
              presentation="bottom-sheet"
              snapPoints={["35%"]}
            >
              <SelectList presentation={presentation} scrollable={scrollable}>
                {items}
              </SelectList>
            </Select.Content>
          ) : (
            <Select.Content
              avoidCollisions
              className={cn(
                "rounded-xl px-0 py-2",
                scrollable && "aspect-[1.2] overflow-hidden p-0 py-2",
                contentClassName
              )}
              placement="bottom"
              presentation="popover"
              width="trigger"
            >
              <SelectList presentation={presentation} scrollable={scrollable}>
                {items}
              </SelectList>
            </Select.Content>
          )}
        </Select.Portal>
      </Select>

      <FieldError className="pl-1 text-xs">{error?.message}</FieldError>
    </ControlField>
  );
}

/**
 * The scrolling body of the option list.
 *
 * A popover is a positioned overlay whose drag competes with the ancestor
 * scroll view, and on some Android devices the gesture never reaches the list
 * at all — the options are there but they do not scroll. That is a known
 * upstream problem (heroui-inc/heroui-native#209). The constant-height
 * workaround on the popover branch below is the maintainers' own suggestion and
 * it still does not hold on every device, which is why a long list belongs in a
 * sheet: a sheet is a real modal with its own scroll container, so there is no
 * competing ancestor to lose the drag to.
 */
function SelectList({
  presentation,
  scrollable,
  children,
}: {
  presentation: SelectPresentation;
  scrollable: boolean;
  children: ReactNode;
}) {
  // Hook first: the popover branch below returns early, and a hook after an
  // early return breaks the rules of hooks.
  const themeColorOverlay = useThemeColor("overlay");

  if (presentation === "bottom-sheet") {
    // The sheet's own scroll container — it detents, so the list scrolls inside
    // a frame the drag never competes with.
    //
    // Rows are separated by hairlines rather than a gap, and the padding sits
    // on the scroll *content*, not on the viewport. That distinction is the
    // whole point: content padding scrolls away with the rows, so they run out
    // of the card's top and bottom edges instead of stopping short of them,
    // which is what tells a reader there is more to scroll to.
    return (
      <ScrollShadow
        color={themeColorOverlay}
        LinearGradientComponent={LinearGradient}
      >
        <BottomSheetScrollView
          contentContainerClassName="px-2 py-4"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </BottomSheetScrollView>
      </ScrollShadow>
    );
  }

  if (!scrollable) {
    return <>{children}</>;
  }

  return (
    // `flex-1` is what makes this scroll. The popover content is a fixed-height
    // box (aspect ratio + overflow hidden), and without it the shadow wrapper
    // sizes to its content instead of the box: the list becomes exactly as tall
    // as its items, has nothing to scroll, and the overflow is simply clipped.
    // `nestedScrollEnabled` lets Android hand the drag to this list rather than
    // an ancestor scroller.
    <ScrollShadow
      className="flex-1"
      color={themeColorOverlay}
      LinearGradientComponent={LinearGradient}
      size={60}
    >
      <ScrollView
        contentContainerStyle={{ rowGap: 8 }}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </ScrollShadow>
  );
}
