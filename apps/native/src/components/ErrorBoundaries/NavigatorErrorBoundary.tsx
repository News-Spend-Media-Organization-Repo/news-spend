import { ErrorBoundary } from "@sentry/react-native";
import type React from "react";
import { Heading, Stack, Text } from "tamagui";

import { Button } from "#/components/ui";

type NavigatorFallbackProps = {
  error: unknown;
  componentStack?: string;
  eventId?: string;
  resetError?: () => void;
};

const NavigatorFallbackComponent: React.FC<NavigatorFallbackProps> = ({
  resetError,
}) => (
  <Stack ai="center" f={1} jc="center" p="$4">
    <Heading mb="$2">Oops!</Heading>
    <Text mb="$4" ta="center">
      Something unexpected happened. We've been notified and are working on a
      fix.
    </Text>
    <Stack flexDirection="row" gap="$2">
      <Button
        onPress={() => {
          // resetError is provided by ErrorBoundary when fallback is a function
          resetError?.();
        }}
      >
        <Button.Text>Try Again</Button.Text>
      </Button>
    </Stack>
  </Stack>
);

export const NavigatorErrorBoundary = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <ErrorBoundary
    beforeCapture={(scope) => {
      scope.setTag("boundary", "navigator");
    }}
    fallback={(props) => <NavigatorFallbackComponent {...props} />}
    onError={(error) => {
      console.error("Navigation error:", error);
    }}
  >
    {children}
  </ErrorBoundary>
);
