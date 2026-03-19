import type { Payload } from "payload";
import { getPayload as _getPayload } from "payload";

import { configurePayload } from "../configurePayload";

export const singleton = <Value>(
  name: string,
  valueFactory: () => Promise<Value> | Value
): Promise<Value> => {
  const g = global as typeof global & {
    __singletons?: Record<string, Promise<Value>>;
  };

  g.__singletons ??= {};
  g.__singletons[name] ??= Promise.resolve(valueFactory());

  return g.__singletons[name];
};

export const getPayload = async (): Promise<Payload> =>
  singleton("payload", async () => {
    const config = configurePayload();
    return await _getPayload({ config });
  });
