import type { ButtonRootProps } from "heroui-native";
import { cn, Button as HeroUIButton } from "heroui-native";
import { tv } from "tailwind-variants";

const buttonVariants = tv({
  base: "h-12 rounded-lg",
});

export type AppButtonProps = ButtonRootProps & {
  className?: string;
  ref?: React.ComponentProps<typeof HeroUIButton>["ref"];
};

export function Button({ className, ref, ...props }: AppButtonProps) {
  return <HeroUIButton className={cn(buttonVariants(), className)} ref={ref} {...props} />;
}

Button.displayName = "Button";
Button.Label = HeroUIButton.Label;
