import { View } from "react-native";

import { Text } from "../heroui/text";

/**
 * Google will not serve video to a media view smaller than 120 in either
 * dimension (dp on Android, points on iOS), and the SDK warns that smaller
 * slots "will be demonetized". At 100 this placement was shutting out every
 * video creative, and the native ad validator flagged it on each ad. The size
 * is a policy floor, not a styling choice, so it applies to every ad rather
 * than only those that turn out to carry video.
 *
 * Two points over the floor, not on it. Measured on an iPhone 17 Pro the media
 * view was exactly 120 and the validator still said it was too small, while an
 * iPhone X with the same layout passed. Native frames are floats, so a value
 * that is nominally 120 can land a hair under, and a check that compares
 * strictly then fails on some devices and not others. A margin removes the
 * question.
 */
export const MEDIA_SIZE = 122;

/**
 * Keeps every asset strictly inside the ad view instead of flush against its
 * edges, with one point of margin on every side.
 *
 * It is applied to a WRAPPER inside the NativeAdView, never as `padding` on
 * the NativeAdView itself. The library insets its native GADNativeAdView by
 * that padding while Yoga still lays the children out as if it had not, so
 * every asset lands one point to the right and below where it should: a
 * 416pt container holds a 414pt native view whose content runs to x=415.
 * Measured on device frames, the call-to-action and body ended at 415 in a
 * 414-wide view, which is exactly AdMob's "advertiser assets outside native
 * ad view". Padding on a plain wrapper is ordinary layout and moves nothing
 * out of bounds.
 */
export const ASSET_INSET = 1;

/**
 * Space kept clear beneath the thumbnail for the SDK's AdChoices icon, which
 * ad-loader pins to the bottom-left corner of the ad view. Google's guidance
 * is to leave room in the chosen corner instead of letting the icon land on
 * the creative, where it can be hard to see. Reserving it as a minimum height
 * means a tall text column still gets its own height for free.
 */
export const ADCHOICES_GUTTER = 20;

/**
 * The height every state of a Google ad slot reserves.
 *
 * A slot is in one of four states — waiting on Google, filled by Google,
 * waiting on the partner fallback, filled by the partner — and each of them is
 * a different component. Any difference between their heights is a layout
 * shift in the middle of the feed: the row shrinks to nothing while the
 * partner ad loads, then grows back when it arrives, and everything below it
 * jumps twice. One reserved height removes that.
 */
export const AD_SLOT_HEIGHT = MEDIA_SIZE + ADCHOICES_GUTTER + ASSET_INSET * 2;

/** What a slot shows before anything has filled it. */
export function AdPlaceholder() {
  return (
    <View
      className="items-center justify-center bg-background px-2.5 opacity-60"
      style={{ minHeight: AD_SLOT_HEIGHT }}
      testID="ad-placeholder"
    >
      <Text className="font-bold text-p-500">Advertisement</Text>
    </View>
  );
}
