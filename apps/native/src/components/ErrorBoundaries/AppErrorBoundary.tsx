import { ErrorBoundary } from "@sentry/react-native";
import type React from "react";
import { Heading, Stack, Text } from "tamagui";

import { Button } from "#/components/ui";

type AppFallbackProps = {
  error: unknown;
  componentStack?: string;
  eventId?: string;
  resetError?: () => void;
};

const FallbackComponent: React.FC<AppFallbackProps> = ({ resetError }) => (
  <Stack ai="center" f={1} jc="center" p="$4">
    <Heading mb="$2">Oops! Something went wrong</Heading>
    <Text mb="$4" ta="center">
      Something unexpected happened. We've been notified and are working on a
      fix.
    </Text>
    <Button onPress={() => resetError?.()}>
      <Button.Text>Try Again</Button.Text>
    </Button>
  </Stack>
);

export const AppErrorBoundary = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const handleError = (error: unknown) => {
    // Sentry.ErrorBoundary will capture the error automatically.
    // Use onError for local logging or side effects.
    console.error("Error caught by AppErrorBoundary:", error);
  };

  return (
    <ErrorBoundary
      beforeCapture={(scope) => {
        scope.setTag("boundary", "app");
      }}
      fallback={(props) => <FallbackComponent {...props} />}
      onError={handleError}
      showDialog
    >
      {children}
    </ErrorBoundary>
  );
};
