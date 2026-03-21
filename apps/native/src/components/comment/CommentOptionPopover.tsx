import type { Comment } from "@news-spend-media/payload/types";
import React from "react";
import { Button, Stack } from "tamagui";
import { DotsThreeVertical } from "tamagui-phosphor";
import { useSnapshot } from "valtio";

import PostReportSheet from "#/components/sheets/PostReportSheet";
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuItemTitle,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import useDeleteComment from "#/hooks/comments/useDeleteComment";
import { authState } from "#/state/auth";
import { setEditingComment } from "#/state/commentState";

export function CommentOptionPopover({ comment }: { comment: Comment }) {
  const [showReportSheet, setShowReportSheet] = React.useState(false);
  const deleteMutation = useDeleteComment();
  const auth = useSnapshot(authState);

  const onDelete = () => {
    deleteMutation.mutate(comment.id);
  };

  const onEdit = () => {
    setEditingComment(comment);
  };

  const givenTime = new Date(comment.createdAt);
  const currentTime = new Date();

  // Calculate the difference in milliseconds between the given time and the current time
  const timeDifference = currentTime.getTime() - givenTime.getTime();

  // Check if the time difference is less than 15 minutes (900,000 milliseconds)
  const isLessThan15Minutes = timeDifference < 900_000;

  const commentUser =
    typeof comment.user === "object" ? comment.user.id : comment.user;

  return (
    <Stack>
      <DropdownMenuRoot>
        <DropdownMenuTrigger>
          <Button icon={<DotsThreeVertical size={24} />} unstyled />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {auth.session?.user?.id === commentUser && (
            <DropdownMenuGroup>
              {isLessThan15Minutes && (
                <DropdownMenuItem key="edit" onSelect={onEdit}>
                  <DropdownMenuItemTitle>Edit</DropdownMenuItemTitle>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem key="delete" onSelect={onDelete}>
                <DropdownMenuItemTitle>Delete</DropdownMenuItemTitle>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}
          {auth.session?.user?.id !== commentUser && (
            <DropdownMenuItem
              key="report"
              onSelect={() => setShowReportSheet(true)}
            >
              <DropdownMenuItemTitle>Report</DropdownMenuItemTitle>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenuRoot>

      <PostReportSheet
        onOpenChange={setShowReportSheet}
        open={showReportSheet}
        postId={comment.id}
        reportType="comment"
      />
    </Stack>
  );
}

export default CommentOptionPopover;
