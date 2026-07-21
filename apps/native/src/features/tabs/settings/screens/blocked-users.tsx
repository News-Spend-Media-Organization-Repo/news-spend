import { useMutation, useQuery } from "@tanstack/react-query";
import { ListGroup, Separator, Spinner } from "heroui-native";
import { Fragment } from "react";
import { Alert, View } from "react-native";
import { toast } from "sonner-native";

import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";

export default function BlockedUsers() {
  const { data, isLoading, isRefetching, refetch } = useQuery({
    ...orpc.block.getBlockedUsers.queryOptions(),
    refetchInterval: false,
  });

  const unblockMutation = useMutation(
    orpc.block.unblockUser.mutationOptions({
      onError() {
        toast.dismiss();
        toast.error("Failed to unblock user");
      },
      onSuccess() {
        toast.dismiss();
        toast.success("User unblocked");
        queryClient.invalidateQueries({
          queryKey: orpc.block.getBlockedUsers.queryKey(),
        });
      },
    })
  );

  const blockedUsers = data?.blockedUsers ?? [];

  const handleUnblock = (userId: string, username: string) => {
    Alert.alert(
      "Unblock User",
      `Unblock @${username}? Their comments will appear in your feed again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: () => {
            toast.loading("Unblocking user...", {
              duration: Number.POSITIVE_INFINITY,
            });
            unblockMutation.mutate({ userId });
          },
        },
      ]
    );
  };

  return (
    <Screen safeAreaEdges={["bottom"]} systemBarStyle="light">
      {isLoading ? (
        <View className="flex-1 items-center justify-center p-8">
          <Spinner size="lg" />
        </View>
      ) : blockedUsers.length === 0 ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-center text-muted">
            You haven&apos;t blocked any users yet.
          </Text>
          <Button className="mt-4" onPress={() => refetch()} variant="ghost">
            <Button.Label>Refresh</Button.Label>
            {isRefetching ? <Spinner className="ml-2" size="sm" /> : null}
          </Button>
        </View>
      ) : (
        <View className="flex-1 gap-4 p-4">
          <ListGroup>
            {blockedUsers.map((user, index) => (
              <Fragment key={user.id}>
                <ListGroup.Item disabled>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle>@{user.username}</ListGroup.ItemTitle>
                  </ListGroup.ItemContent>
                  <ListGroup.ItemSuffix>
                    <Button
                      isDisabled={unblockMutation.isPending}
                      onPress={() => handleUnblock(user.id, user.username)}
                      size="sm"
                      variant="ghost"
                    >
                      <Button.Label className="text-danger">
                        Unblock
                      </Button.Label>
                    </Button>
                  </ListGroup.ItemSuffix>
                </ListGroup.Item>
                {index < blockedUsers.length - 1 && (
                  <Separator className="mx-4" />
                )}
              </Fragment>
            ))}
          </ListGroup>
        </View>
      )}
    </Screen>
  );
}
