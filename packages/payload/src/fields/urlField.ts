import type { TextField } from "payload";
import { deepMerge } from "payload";

type UrlFieldValidate = (
  value: unknown,
  args: {
    data: Record<string, unknown>;
    siblingData: Record<string, unknown>;
    id?: string | number;
    operation: "create" | "update";
    req: unknown;
  }
) => boolean | string | Promise<boolean | string>;

type UrlFieldOverrides = Omit<Partial<TextField>, "type"> & {
  validate?: UrlFieldValidate;
};

const defaultUrlField: TextField = {
  name: "url",
  type: "text",
  validate: (value: string | string[] | null | undefined) => {
    const isEmpty = (v: unknown) => v === null || v === undefined || v === "";
    const isValidUrl = (v: unknown) => {
      if (isEmpty(v)) {
        return true;
      }
      try {
        new URL(String(v));
        return true;
      } catch {
        return false;
      }
    };

    if (Array.isArray(value)) {
      for (const v of value) {
        if (!isValidUrl(v)) {
          return "Please enter a valid URL";
        }
      }
      return true;
    }

    return isValidUrl(value) ? true : "Please enter a valid URL";
  },
};

export const urlField = (overrides?: UrlFieldOverrides): TextField => {
  const { validate: extraValidate, ...rest } = overrides ?? {};
  const base = deepMerge(defaultUrlField, rest) as TextField;
  if (extraValidate) {
    const baseValidate = defaultUrlField.validate as UrlFieldValidate;
    const combined: UrlFieldValidate = (val, ctx) => {
      const urlResult = baseValidate(val, ctx);
      if (urlResult !== true) {
        return urlResult;
      }
      return extraValidate(val, ctx);
    };
    base.validate = combined as TextField["validate"];
  }
  return base;
};
