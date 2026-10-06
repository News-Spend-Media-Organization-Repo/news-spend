export type MacroContext = {
  variables?: Record<string, unknown>;
  config?: Record<string, unknown>;
  /** HTML-escape injected values. Set when the target is HTML, not plain text. */
  escapeHtml?: boolean;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CONFIG_PATTERN = /^@config\(\s*['"]([^'"]+)['"]\s*\)$/;
const PLACEHOLDER_PATTERN = /\{\{([^}]+)\}\}/g;

function getNestedValue(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current !== null && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      obj
    );
}

/**
 * Replace `{{variable}}` and `{{@config('key')}}` placeholders.
 * Unknown placeholders are left untouched so a typo is visible in
 * preview instead of silently sending an empty string.
 */
export function injectMacros(text: string, context: MacroContext = {}): string {
  if (!text) {
    return "";
  }

  const format = (value: unknown): string =>
    context.escapeHtml ? escapeHtml(String(value)) : String(value);

  return text.replace(PLACEHOLDER_PATTERN, (match, raw: string) => {
    const expression = String(raw).trim();

    const configMatch = expression.match(CONFIG_PATTERN);
    if (configMatch?.[1]) {
      const value = getNestedValue(context.config ?? {}, configMatch[1]);
      return value == null ? match : format(value);
    }

    if (expression.startsWith("@")) {
      return match;
    }

    const value = getNestedValue(context.variables ?? {}, expression);
    return value == null ? match : format(value);
  });
}

export function macroVariableNames(texts: string[]): string[] {
  const names = new Set<string>();
  for (const text of texts) {
    if (!text) {
      continue;
    }
    for (const match of text.matchAll(/\{\{([^}@][^}]*)\}\}/g)) {
      const name = match[1]?.trim().split(".")[0];
      if (name) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}
