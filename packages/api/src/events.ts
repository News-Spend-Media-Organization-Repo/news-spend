import { EventPublisher } from "@orpc/server";

export const publisher = new EventPublisher<
  Record<string, { id: string; message: string }>
>();
