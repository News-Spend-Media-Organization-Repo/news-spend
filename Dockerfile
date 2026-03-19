FROM oven/bun:1.3.9-alpine AS base
WORKDIR /app
RUN apk add --no-cache libpq

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
COPY turbo.json ./
COPY apps/ apps/
COPY packages/ packages/
COPY tooling/ tooling/
RUN --mount=type=cache,target=/root/.bun/install/cache bun install

# Builder
FROM base AS builder
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY turbo.json package.json bun.lock ./
COPY apps/payload apps/payload
COPY packages/ packages/
COPY tooling/ tooling/
ARG DATABASE_URI=postgresql://postgres:password@host.docker.internal:5432/payload_test
ARG PAYLOAD_SECRET=build-secret
ENV PAYLOAD_PRIVATE_DATABASE_URI=$DATABASE_URI
ENV PAYLOAD_PRIVATE_SECRET=$PAYLOAD_SECRET
RUN --mount=type=cache,target=/app/.turbo \
    --mount=type=cache,target=/app/apps/payload/.next/cache \
    bun run build --filter=payload

# Runner
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/apps/payload/.next/standalone ./
COPY --from=builder /app/apps/payload/.next/static ./.next/static
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
