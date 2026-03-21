import { Check, X } from "@tamagui/lucide-icons";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  Label,
  ListItem,
  Separator,
  SizableText,
  Spinner,
  Stack,
  XStack,
  YGroup,
} from "tamagui";

import { Screen } from "#/components/Screen";
import { Switch } from "#/components/ui/Switch";
import { useUser } from "#/hooks/auth";
import { userQueryOptions } from "#/hooks/auth/useUser";
import { orpc, type RouterInputs } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";

type NotificationType =
  RouterInputs["notificationSettings"]["update"]["notification_type"];

type NotificationConfig = {
  type: NotificationType;
  title: string;
  description: string;
};

const NOTIFICATION_CONFIGS: NotificationConfig[] = [
  {
    type: "BREAKING_NEWS",
    title: "Breaking News",
    description: "Get notified when important news happens",
  },
  {
    type: "COMMENT",
    title: "New Comment",
    description: "Get notified when someone comments on your post",
  },
  {
    type: "EARNING_OPPORTUNITY",
    title: "Earning Opportunity",
    description: "Get notified when you have a new earning opportunity",
  },
  {
    type: "MISC",
    title: "Miscellaneous",
    description: "Get notified for other things that are important",
  },
];

type ItemProps = {
  config: NotificationConfig;
  checked: boolean;
  onToggle: (type: NotificationType, enabled: boolean) => void;
  isLoading?: boolean;
};

const NotificationItem = ({
  config,
  checked,
  onToggle,
  isLoading,
}: ItemProps) => {
  const handleValueChange = useCallback(
    (enabled: boolean) => {
      onToggle(config.type, enabled);
    },
    [config.type, onToggle]
  );

  return (
    <YGroup.Item>
      <ListItem>
        <XStack ai="center" gap="$2" w="100%">
          <Stack flex={1}>
            <Label fos="$5" htmlFor={config.type} lh="$3">
              {config.title}
            </Label>
            <SizableText color="$gray11" size="$3">
              {config.description}
            </SizableText>
          </Stack>
          <Switch
            checked={checked}
            disabled={isLoading}
            id={config.type}
            onCheckedChange={handleValueChange}
          >
            <Switch.Icon placement="left">
              <X color="#fff" />
            </Switch.Icon>
            <Switch.Icon placement="right">
              <Check color="#fff" />
            </Switch.Icon>
            <Switch.Thumb animation="quick" />
          </Switch>
        </XStack>
      </ListItem>
      <Separator />
    </YGroup.Item>
  );
};

export default function Notifications() {
  const { data: session } = useUser();
  const user = session?.user;

  console.log(user?.notificationPreferences);

  const notificationSettingsMutation = useMutation(
    orpc.notificationSettings.update.mutationOptions({
      onMutate: async ({ notification_type, enabled }) => {
        // Cancel outgoing refetch
        await queryClient.cancelQueries({
          queryKey: userQueryOptions.queryKey,
        });

        // Snapshot the previous value
        const previousData = queryClient.getQueryData(
          userQueryOptions.queryKey
        );

        // Optimistically update to the new value
        queryClient.setQueryData(userQueryOptions.queryKey, (old: any) => {
          if (!old) return old;

          return {
            ...old,
            user: {
              ...old.user,
              notificationPreferences: {
                ...old.user?.notificationPreferences,
                types: {
                  ...old.user?.notificationPreferences?.types,
                  [notification_type]: enabled,
                },
              },
            },
          };
        });

        return { previousData };
      },
      onError: (err, variables, context) => {
        console.error("Failed to update notification settings:", err);

        // Roll back on error
        if (context?.previousData) {
          queryClient.setQueryData(
            userQueryOptions.queryKey,
            context.previousData
          );
        }
      },
      onSettled: () => {
        // Always refetch after error or success
        // queryClient.invalidateQueries({ queryKey: userQueryOptions.queryKey });
      },
    })
  );

  const handleNotificationToggle = useCallback(
    (notification_type: NotificationType, enabled: boolean) => {
      if (!user?.id) {
        console.warn("Cannot update notifications: user not found");
        return;
      }

      notificationSettingsMutation.mutate({
        notification_type,
        enabled,
      });
    },
    [user?.id, notificationSettingsMutation]
  );

  const getNotificationStatus = useCallback(
    (type: NotificationType): boolean =>
      user?.notificationPreferences?.types?.[type] ?? false,
    [user?.notificationPreferences?.types]
  );

  if (!user) {
    return (
      <Screen>
        <Stack ai="center" flex={1} jc="center">
          <Spinner size="large" />
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen>
      <YGroup alignSelf="center" separator={<Separator />} size="$4">
        {NOTIFICATION_CONFIGS.map((config) => (
          <NotificationItem
            checked={getNotificationStatus(config.type)}
            config={config}
            isLoading={notificationSettingsMutation.isPending}
            key={config.type}
            onToggle={handleNotificationToggle}
          />
        ))}
      </YGroup>
    </Screen>
  );
}
