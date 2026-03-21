import { proxy, subscribe } from "valtio";

import type { RouterOutputs } from "#/lib/orpc";

export const commentState = proxy<{
  replyingTo: string | undefined;
  parentCommentId: string | undefined;
  replyingToComment: RouterOutputs["comments"]["one"] | undefined;
  parentComment: RouterOutputs["comments"]["one"] | undefined;
  editingComment: RouterOutputs["comments"]["one"] | undefined;
}>({
  replyingTo: undefined,
  parentCommentId: undefined,
  replyingToComment: undefined,
  parentComment: undefined,
  editingComment: undefined,
});

export const setReplyingTo = (replyingTo: string | undefined) => {
  commentState.replyingTo = replyingTo;
};

/**
 * Sets the active comment and updates the comment state.
 *
 * @param {RouterOutputs["comments"]["one"] | undefined} parentComment - The comment being replied to
 * @param {RouterOutputs["comments"]["one"] | undefined} replyingToComent - The comment being replied to
 */
export const setActiveComment = (
  parentComment: RouterOutputs["comments"]["one"] | undefined,
  replyingToComent: RouterOutputs["comments"]["one"] | undefined
) => {
  commentState.replyingToComment = replyingToComent;
  commentState.parentComment = parentComment;
  commentState.replyingTo = replyingToComent?._id;
  commentState.parentCommentId = parentComment?._id;
};

export const setParentCommentId = (parentCommentId: string | undefined) => {
  commentState.parentCommentId = parentCommentId;
};

export const setEditingComment = (
  editingComment: RouterOutputs["comments"]["one"] | undefined
) => {
  commentState.editingComment = editingComment;
};

subscribe(commentState, () => {
  console.log("commentState", commentState);
});
