import type { Comment } from "@news-spend-media/payload/types";
import { Menu, Separator } from "heroui-native";
import { DotsThreeVerticalIcon } from "phosphor-react-native";
import React from "react";
import { useSnapshot } from "valtio";

import { Icon } from "#/components/heroui/icon";
import PostReportSheet from "#/components/sheets/PostReportSheet";
import useDeleteComment from "#/hooks/comments/useDeleteComment";
import { authState } from "#/state/auth";
import { startEdit } from "#/state/commentState";
import { Button } from "../heroui/button";

export function CommentOptionPopover({ comment }: { comment: Comment }) {
  const [showReportSheet, setShowReportSheet] = React.useState(false);
  const deleteMutation = useDeleteComment();
  const auth = useSnapshot(authState);

  const onDelete = () => {
    deleteMutation.mutate(comment.id);
  };

  const onEdit = () => {
    startEdit(comment);
  };

  const givenTime = new Date(comment.createdAt);
  const currentTime = new Date();

  const timeDifference = currentTime.getTime() - givenTime.getTime();

  const isLessThan15Minutes = timeDifference < 900_000;

  const commentUser = typeof comment.user === "object" ? comment.user.id : comment.user;

  return (
    <>
      <Menu presentation="popover">
        <Menu.Trigger asChild>
          <Button className="p-1" hitSlop={8} variant="ghost">
            <Icon name={DotsThreeVerticalIcon} size={24} />
          </Button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Overlay className="bg-backdrop" />
          <Menu.Content
            align="end"
            className="rounded-lg"
            offset={4}
            placement="bottom"
            presentation="popover"
            width={200}
          >
            {auth.session?.user?.id === commentUser && (
              <>
                {isLessThan15Minutes && (
                  <>
                    <Menu.Item onPress={onEdit}>
                      <Menu.ItemTitle>Edit</Menu.ItemTitle>
                    </Menu.Item>
                    <Separator className="mx-2 my-1 opacity-75" />
                  </>
                )}

                <Menu.Item onPress={onDelete} variant="danger">
                  <Menu.ItemTitle>Delete</Menu.ItemTitle>
                </Menu.Item>
              </>
            )}
            {auth.session?.user?.id !== commentUser && (
              <Menu.Item onPress={() => setShowReportSheet(true)}>
                <Menu.ItemTitle>Report</Menu.ItemTitle>
              </Menu.Item>
            )}
          </Menu.Content>
        </Menu.Portal>
      </Menu>

      <PostReportSheet
        onOpenChange={setShowReportSheet}
        open={showReportSheet}
        postId={comment.id}
        reportType="comment"
      />
    </>
  );
}

export default CommentOptionPopover;
