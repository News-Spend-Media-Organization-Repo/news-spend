/**
 * `{{firstName}}` in a notification body or giveaway description is replaced
 * with the recipient's first name at send time.
 */
const FIRST_NAME_RE = /\{\{\s*firstName\s*\}\}/gi;
const LEADING_FIRST_NAME_RE = /^\s*\{\{\s*firstName\s*\}\}[\s,:;!.\-–—]*/i;

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
