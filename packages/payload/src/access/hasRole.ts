import type { Access } from "payload";

import type { Admin } from "../payload-types";

export const hasRole =
  (role: Admin["role"]): Access =>
  ({ req: { user } }) =>
    // The collection matters as much as the role: a document from any other
    // auth collection must never pass on a `role` value it happens to carry.
    user?.collection === "admins" && user.role === role;

export const adminOnly: Access = hasRole("super-admin");
