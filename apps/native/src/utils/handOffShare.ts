/**
 * Runs a share and reports it once the link has been handed to the target.
 *
 * `Share.shareSingle` cannot say whether the share was completed. On iOS every
 * target (WhatsApp, Messenger, Twitter, Facebook) resolves with an array,
 * `[true, ""]`, while the library reads `.success` from an object, so
 * `result.success` is false even when the target opened. On Android the flag
 * comes from the activity result, which a target such as WhatsApp commonly
 * reports as cancelled after the message was sent. Gating on it meant these
 * shares were never counted.
 *
 * So a share is counted when the target opened without throwing, meaning the
 * link was handed off. That can include a reader who then backs out of the
 * target app; delivery is not knowable from here.
 */
export async function handOffShare(
  open: () => Promise<unknown>,
  method: string,
  onShare?: (shareMethod: string) => void
): Promise<void> {
  try {
    await open();
  } catch (error) {
    // Not installed, or the reader dismissed it: nothing was handed off.
    console.log(error instanceof Error ? error.message : error);
    return;
  }
  onShare?.(method);
}
