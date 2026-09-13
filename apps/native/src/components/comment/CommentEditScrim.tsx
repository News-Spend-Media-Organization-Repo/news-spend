import { Keyboard, Pressable } from "react-native";
import { useSnapshot } from "valtio";
import { commentState, resetCommentState } from "#/state/commentState";

/**
 * Dims the screen behind the composer while a comment is being edited.
 *
 * Lives on the screen rather than inside CommentBox. It used to be a sibling
 * of the composer content, dimming via `absolute inset-0` — but once the
 * composer was wrapped for keyboard handling, "inset-0" resolved to the
 * composer's own bounds and the dim covered nothing. Rendered here it sits
 * over the header and list, and the composer, mounted after it, stays above.
 */
export function CommentEditScrim() {
  const { mode } = useSnapshot(commentState);

  if (mode !== "edit") {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel="Cancel editing"
      accessibilityRole="button"
      className="absolute inset-0"
      onPress={() => {
        resetCommentState();
        Keyboard.dismiss();
      }}
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    />
  );
}

export default CommentEditScrim;
