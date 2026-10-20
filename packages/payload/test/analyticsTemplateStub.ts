import { createElement, type ReactNode } from "react";

type TemplateProps = {
  children?: ReactNode;
  className?: string;
  permissions?: unknown;
  user?: unknown;
  visibleEntities?: unknown;
  [key: string]: unknown;
};

/** Props each page passed to the real template, newest last. */
export const templateCalls: TemplateProps[] = [];

/**
 * DefaultTemplate needs a real Payload request (config, i18n, permissions), so
 * unit tests render this marker instead. The pages can still be checked for
 * being inside it and for the props they hand over.
 */
export function DefaultTemplateStub(props: TemplateProps): ReactNode {
  templateCalls.push(props);
  return createElement("div", { "data-template": "default" }, props.children);
}
