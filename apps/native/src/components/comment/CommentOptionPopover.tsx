import { DotsThreeVerticalIcon } from "phosphor-react-native";
import React from "react";

import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import CommentOptionSheet from "#/components/sheets/CommentOptionSheet";
import PostReportSheet from "#/components/sheets/PostReportSheet";
import type { RouterOutputs } from "#/lib/orpc";

type Comment = RouterOutputs["comments"]["one"];

export function CommentOptionPopover({ comment }: { comment: Comment }) {
  const [open, setOpen] = React.useState(false);
  const [showReportSheet, setShowReportSheet] = React.useState(false);

  return (
    <>
      <Button
        className="p-1"
        hitSlop={8}
        onPress={() => setOpen(true)}
        variant="ghost"
      >
        <Icon name={DotsThreeVerticalIcon} size={24} />
      </Button>

      <CommentOptionSheet
        comment={comment}
        onOpenChange={setOpen}
        onReport={() => {
          setOpen(false);
          setShowReportSheet(true);
        }}
        open={open}
      />

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
