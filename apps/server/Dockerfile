FROM oven/bun:1.3.9-alpine AS base

WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun build src/index.ts --outdir=dist --target=bun

FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 server

COPY --from=builder --chown=server:nodejs /app/dist ./dist
COPY --from=builder --chown=server:nodejs /app/src ./src

USER server

EXPOSE 9000

ENV PORT=9000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "dist/index.js"]
