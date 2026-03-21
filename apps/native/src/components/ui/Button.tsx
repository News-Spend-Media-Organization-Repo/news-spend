import { getSpace } from "@tamagui/get-token";
import {
  createStyledContext,
  type GetProps,
  getTokens,
  type SizeTokens,
  Stack,
  styled,
  Text,
  useTheme,
  withStaticProperties,
} from "@tamagui/web";
import { cloneElement, useContext } from "react";

export const ButtonContext = createStyledContext({
  size: "$4" as SizeTokens,
});

export const ButtonFrame = styled(Stack, {
  name: "Button",
  context: ButtonContext,
  // bg: "$p500",
  alignItems: "center",
  flexDirection: "row",
  // ai: "center",
  jc: "center",
  pressStyle: {
    borderColor: "transparent",
    opacity: 0.9,
  },

  hoverStyle: {
    boc: "transparent",
  },

  focusStyle: {
    boc: "$borderColorFocus",
  },
  variants: {
    size: {
      "...size": (name, { tokens }) => {
        return {
          height: tokens.size[name],

          borderRadius: tokens.radius[name],

          gap: tokens.space[name].val * 0.2,

          paddingHorizontal: getSpace(name, {
            shift: -1,
          }),
        };
      },
    },
    primary: {
      true: {
        bg: "$p500",
        borderColor: "transparent",
        h: 48,
      },
    },

    active: {
      true: {
        hoverStyle: {
          bg: "$background",
          h: 48,
        },
      },
    },
    disabled: {
      true: {
        opacity: 0.8,
        pointerEvents: "none",
        h: 48,
      },
    },
    outlined: {
      true: {
        bg: "transparent",
        borderColor: "$p300",
        borderWidth: 1,
        h: 48,
      },
    },
    ghost: {
      true: {
        borderColor: "transparent",

        bg: "transparent",
        pressTheme: true,

        h: 48,

        pressStyle: {
          bg: "transparent",
          borderWidth: 0,
        },
      },
    },
    unstyled: {
      true: {
        size: "$true",
        justifyContent: "center",
        alignItems: "center",
        flexWrap: "nowrap",
        flexDirection: "row",
        cursor: "pointer",
        hoverTheme: true,
        pressTheme: true,
        backgrounded: true,
        borderWidth: 1,
        borderColor: "transparent",
        bg: "transparent",
        p: 0,

        focusStyle: {
          outlineColor: "$borderColorFocus",
          outlineStyle: "solid",
          outlineWidth: 2,
        },
      },
    },
  } as const,
  defaultVariants: {
    size: "$4",
    primary: true,
  },
});

type ButtonProps = GetProps<typeof ButtonFrame>;

export const ButtonText = styled(Text, {
  name: "ButtonText",
  context: ButtonContext,
  color: "$s50",
  fontWeight: "500",
  userSelect: "none",
  variants: {
    size: {
      "...fontSize": (name, { font, tokens }) => {
        // console.log("🚀 ~ font:", font);
        return {
          fontSize: font?.size[name],
        };
      },
    },
    primary: {
      true: {
        color: "$p50",
      },
    },
    unstyled: {
      true: {
        userSelect: "none",
        cursor: "pointer",
        // flexGrow 1 leads to inconsistent native style where text pushes to start of view
        flexGrow: 0,
        flexShrink: 1,
        ellipse: true,
        color: "$color",
      },
    },
  } as const,
  defaultVariants: {
    size: "$4",
    primary: true,
  },
});

const ButtonIcon = (props: {
  children: React.ReactNode;
  color?: any;
  width?: any;
  height?: any;
}) => {
  const { size } = useContext(ButtonContext);
  const tokens = getTokens();
  const smallerSize = tokens.size[size].val * 0.5;
  // const theme = useTheme();
  return cloneElement(props.children, {
    width: props.width ?? smallerSize,
    height: props.height ?? smallerSize,
    color: props.color,
  });
};

export const Button = withStaticProperties(ButtonFrame, {
  Props: ButtonContext.Provider,
  Text: ButtonText,
  Icon: ButtonIcon,
});
