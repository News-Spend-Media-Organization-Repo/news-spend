/**
 * `{{firstName}}` in a notification body or giveaway description is replaced
 * with the recipient's first name at send time.
 */
// One or two braces: operators have typed both, and a single pair used to
// reach users verbatim.
const FIRST_NAME_RE = /\{+\s*firstName\s*\}+/gi;
const LEADING_FIRST_NAME_RE = /^\s*\{+\s*firstName\s*\}+[\s,:;!.\-–—]*/i;
const PLACEHOLDER_TOKEN_RE = /\{+\s*([A-Za-z_][\w.\s-]*)\s*\}+/g;

const PLACEHOLDER_HINT =
  "Only {{firstName}} is supported; it is replaced with each recipient's first name at send time.";

export function hasPlaceholder(text: string): boolean {
  FIRST_NAME_RE.lastIndex = 0;
  return FIRST_NAME_RE.test(text);
}

export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/**
 * Fill in the recipient's first name.
 *
 * Without a usable name the sentence has to still read properly: a leading
 * placeholder ("{{firstName}}, join 1500 winners") is dropped along with its
 * punctuation and the next word capitalised, and one mid-sentence
 * ("Hey {{firstName}}!") becomes "there".
 */
export function personalise(
  text: string,
  name: string | null | undefined
): string {
  const first = firstNameOf(name);
  if (first) {
    return text.replace(FIRST_NAME_RE, first);
  }

  const stripped = text.replace(LEADING_FIRST_NAME_RE, "");
  const lead =
    stripped === text
      ? stripped
      : stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return lead.replace(FIRST_NAME_RE, "there");
}

/** Rewrite any accepted spelling of the placeholder to canonical `{{firstName}}`. */
export function normalisePlaceholders(text: string): string {
  return text.replace(FIRST_NAME_RE, "{{firstName}}");
}

/** Brace tokens that would reach users verbatim, i.e. anything but firstName. */
export function unknownPlaceholders(text: string | null | undefined): string[] {
  if (!text) {
    return [];
  }
  const unknown = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER_TOKEN_RE)) {
    if (match[1]?.trim().toLowerCase() !== "firstname") {
      unknown.add(match[0]);
    }
  }
  return [...unknown];
}

/** Field validator: reject invented placeholders at save time. */
export function validatePlaceholders(value: unknown): true | string {
  if (typeof value !== "string" || value.length === 0) {
    return true;
  }
  const unknown = unknownPlaceholders(value);
  if (unknown.length === 0) {
    return true;
  }
  return `Unknown placeholder${unknown.length > 1 ? "s" : ""}: ${unknown.join(
    ", "
  )}. ${PLACEHOLDER_HINT}`;
}
