FROM node:22.23.2-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS dependencies

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

FROM base AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_MAP_STYLE_URL
ENV NEXT_PUBLIC_MAP_STYLE_URL="${NEXT_PUBLIC_MAP_STYLE_URL}"

# Build-time placeholder only. It is never used for a database connection.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN pnpm build

FROM dependencies AS migrator

WORKDIR /app

ENV NODE_ENV=production

COPY drizzle ./drizzle
COPY drizzle.config.ts tsconfig.json ./
COPY src/config ./src/config
COPY src/server/db ./src/server/db

CMD ["pnpm", "db:migrate"]

FROM node:22.23.2-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/live').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "server.js"]
