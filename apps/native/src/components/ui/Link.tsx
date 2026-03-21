import { Slot } from "@radix-ui/react-slot";
import { LinkProps, useLinkProps } from "@react-navigation/native";
import React from "react";
import { Text } from "tamagui";

type Props = {
  asChild?: boolean;
  children?: React.ReactNode;
} & LinkProps<ReactNavigation.RootParamList>;

const Link = ({
  screen,
  params,
  action,
  href,
  children,
  asChild,
  ...rest
}: Props) => {
  const props = useLinkProps({ params, action, href });

  const [isHovered, setIsHovered] = React.useState(false);

  const Element = asChild ? Slot : Text;

  return (
    <Element {...props} {...rest}>
      {children}
    </Element>
  );
};

export default Link;
