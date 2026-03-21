import { ListItem } from "tamagui";
import * as DropdownMenu from "zeego/dropdown-menu";

export const DropdownMenuRoot = DropdownMenu.Root;
export const DropdownMenuTrigger = DropdownMenu.Trigger;
export const DropdownMenuContent = DropdownMenu.Content;
export const DropdownMenuArrow = DropdownMenu.Arrow;
export const DropdownMenuGroup = DropdownMenu.Group;
export const DropdownMenuLabel = DropdownMenu.Label;
export const DropdownMenuItemTitle = DropdownMenu.ItemTitle;

type ItemProps = React.ComponentProps<(typeof DropdownMenu)["Item"]>;

export const DropdownMenuItem = DropdownMenu.create((props: ItemProps) => {
  return <ListItem {...props} />;
}, "Item");
