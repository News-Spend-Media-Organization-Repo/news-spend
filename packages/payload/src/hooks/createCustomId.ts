import type { FieldHook } from "payload";

export const createCustomId: FieldHook = async ({
  operation,
  data,
  req,
}): Promise<void> => {
  if (operation === "create") {
    if (data) data.id = crypto.randomUUID();
  }
};
