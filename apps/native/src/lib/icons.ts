/**
 * Barrel file for phosphor-react-native icons.
 *
 * Imports each icon from its individual source file instead of the package barrel,
 * so Metro only bundles the ~30 icons we actually use (not all 1500+).
 *
 * Tree-shaking workaround: Metro doesn't support tree shaking, so importing from
 * "phosphor-react-native" pulls the entire 8MB index. This file fixes that.
 */

export { ArrowClockwiseIcon } from "phosphor-react-native/src/icons/ArrowClockwise";
export { ArrowLeftIcon } from "phosphor-react-native/src/icons/ArrowLeft";
export { CakeIcon } from "phosphor-react-native/src/icons/Cake";
export { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
export { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
export { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
export { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";
export { ClockIcon } from "phosphor-react-native/src/icons/Clock";
export { CoinsIcon } from "phosphor-react-native/src/icons/Coins";
export { DotsThreeVerticalIcon } from "phosphor-react-native/src/icons/DotsThreeVertical";
export { EyeIcon } from "phosphor-react-native/src/icons/Eye";
export { EyeSlashIcon } from "phosphor-react-native/src/icons/EyeSlash";
export { FileArrowUpIcon } from "phosphor-react-native/src/icons/FileArrowUp";
export { HeartIcon } from "phosphor-react-native/src/icons/Heart";
export { MinusCircleIcon } from "phosphor-react-native/src/icons/MinusCircle";
export { MusicNoteIcon } from "phosphor-react-native/src/icons/MusicNote";
export { NewspaperIcon } from "phosphor-react-native/src/icons/Newspaper";
export { PaperPlaneTiltIcon } from "phosphor-react-native/src/icons/PaperPlaneTilt";
export { PauseIcon } from "phosphor-react-native/src/icons/Pause";
export { PlayCircleIcon } from "phosphor-react-native/src/icons/PlayCircle";
export { PlayIcon } from "phosphor-react-native/src/icons/Play";
export { PlusCircleIcon } from "phosphor-react-native/src/icons/PlusCircle";
export { ShareNetworkIcon } from "phosphor-react-native/src/icons/ShareNetwork";
export { ShieldCheckIcon } from "phosphor-react-native/src/icons/ShieldCheck";
export { SketchLogoIcon } from "phosphor-react-native/src/icons/SketchLogo";
export { StarIcon } from "phosphor-react-native/src/icons/Star";
export { UserIcon } from "phosphor-react-native/src/icons/User";
export { WarningCircleIcon } from "phosphor-react-native/src/icons/WarningCircle";
export { XIcon } from "phosphor-react-native/src/icons/X";

// Re-export the X icon as both X and XIcon (some files use the bare name)
export { XIcon as X } from "phosphor-react-native/src/icons/X";

// Re-export types and context needed by the app
export type { IconProps } from "phosphor-react-native";
export type { Icon } from "phosphor-react-native";
export { IconContext } from "phosphor-react-native";
