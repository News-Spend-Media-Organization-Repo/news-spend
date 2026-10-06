import { macroVariableNames } from "./macros";

/**
 * Closed registry of template variables. Template authors may only use
 * these `{{keys}}`; anything else fails validation instead of silently
 * sending a blank. Add a key here (plus its resolver) to support it in
 * new templates.
 */
export const TEMPLATE_VARIABLES = [
  {
    key: "username",
    label: "Username",
    description: "Recipient's username, e.g. ada_01.",
    sample: "ada_01",
  },
  {
    key: "name",
    label: "Display name",
    description: "Recipient's display name, e.g. Ada.",
    sample: "Ada",
  },
  {
    key: "email",
    label: "Email address",
    description: "Recipient's email address.",
    sample: "ada@example.com",
  },
] as const;

export type TemplateVariableKey = (typeof TEMPLATE_VARIABLES)[number]["key"];

const REGISTRY_KEYS = new Set<string>(
  TEMPLATE_VARIABLES.map((variable) => variable.key)
);

export type TemplateUser = {
  email: string;
  name?: string | null;
  username?: string | null;
};

/**
 * Resolve every registered variable for one recipient. username falls
 * back to name so `{{username}}` never renders blank when only a display
 * name exists.
 */
export function resolveUserVariables(
  user: TemplateUser
): Record<TemplateVariableKey, string> {
  const username =
    user.username && user.username.length > 0
      ? user.username
      : (user.name ?? "");
  return {
    email: user.email,
    name: user.name ?? "",
    username,
  };
}

/**
 * Default sample values for preview and test sends, shared by every
 * template. Production sends resolve the same keys from the recipient.
 */
export function sampleVariables(): Record<TemplateVariableKey, string> {
  return Object.fromEntries(
    TEMPLATE_VARIABLES.map((variable) => [variable.key, variable.sample])
  ) as Record<TemplateVariableKey, string>;
}

/**
 * Unknown `{{placeholders}}` in template content. Used by field
 * validation to reject invented variables at save time.
 */
export function findUnknownVariables(texts: string[]): string[] {
  return macroVariableNames(texts).filter((name) => !REGISTRY_KEYS.has(name));
}
