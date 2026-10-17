import type { FaqIcon } from "@news-spend-media/payload/lib/faqSeed";
import type { Icon } from "#/lib/icons";
import {
  BookOpenIcon,
  GiftIcon,
  HeadsetIcon,
  MegaphoneIcon,
  QuestionIcon,
  RocketIcon,
  ShieldCheckIcon,
  StarIcon,
  TargetIcon,
  WrenchIcon,
} from "#/lib/icons";

const ICONS: Record<FaqIcon, Icon> = {
  rocket: RocketIcon,
  star: StarIcon,
  gift: GiftIcon,
  target: TargetIcon,
  megaphone: MegaphoneIcon,
  shield: ShieldCheckIcon,
  wrench: WrenchIcon,
  headset: HeadsetIcon,
  "help-circle": QuestionIcon,
  book: BookOpenIcon,
};

const isFaqIcon = (key: string): key is FaqIcon => key in ICONS;

/** The CMS stores an icon key; anything it doesn't know renders as a question mark. */
export const faqIcon = (key: string): Icon =>
  isFaqIcon(key) ? ICONS[key] : QuestionIcon;
