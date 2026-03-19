import { auth } from "@news-spend-media/auth";
import { getPayload } from "@news-spend-media/payload";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const [session, payload] = await Promise.all([
    auth.api.getSession({
      headers: context.req.raw.headers,
    }),
    getPayload(),
  ]);
  return {
    session: session?.session,
    user: session?.user,
    payload,
    request: context.req.raw,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
