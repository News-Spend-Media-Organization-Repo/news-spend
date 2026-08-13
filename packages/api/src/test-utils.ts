import type { Context } from "./context";

/**
 * Build a minimal Context for unit-testing procedures via `call()`.
 *
 * Procedures under test only touch a small slice of the real context, so the
 * defaults here are deliberately cheap. Pass overrides to simulate an
 * authenticated user, a guest, or a request with headers.
 *
 * `payload` is deliberately loose (`Record<string, unknown>`): the full
 * Payload `BasePayload` is a huge type and procedures only stub the handful
 * of methods they call.
 */
export type MockContextOverrides = Partial<Omit<Context, "payload">> & {
  payload?: Record<string, unknown>;
};

export function mockContext(overrides: MockContextOverrides = {}): Context {
  const { user, payload, ...rest } = overrides;
  return {
    session: user ? { id: "session-1", userId: user.id } : null,
    user: user ?? null,
    payload: (payload ?? {}) as unknown as Context["payload"],
    request: undefined,
    headers: new Headers(),
    ...rest,
  } as Context;
}
