FROM node:20-bookworm-slim AS builder

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY backend/common/package.json backend/common/package-lock.json backend/common/tsconfig.json ./backend/common/
COPY backend/common/src ./backend/common/src
RUN npm ci --prefix backend/common \
  && npm run build --prefix backend/common

COPY backend/api/package.json backend/api/package-lock.json ./backend/api/
COPY backend/api/prisma ./backend/api/prisma
RUN npm ci --prefix backend/api \
  && npm run prisma:generate --prefix backend/api

COPY backend/worker/package.json backend/worker/package-lock.json backend/worker/tsconfig.json ./backend/worker/
RUN npm ci --prefix backend/worker
COPY backend/worker/src ./backend/worker/src
RUN npm run build --prefix backend/worker

FROM node:20-bookworm-slim AS runner

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV WORKER_REPOSITORY_MODE=prisma
ENV PRISMA_CLIENT_MODULE=/app/backend/api/node_modules/@prisma/client

COPY --from=builder /app/backend/worker/package.json /app/backend/worker/package-lock.json ./backend/worker/
COPY --from=builder /app/backend/worker/node_modules ./backend/worker/node_modules
COPY --from=builder /app/backend/worker/dist ./backend/worker/dist
COPY --from=builder /app/backend/api/node_modules/@prisma ./backend/api/node_modules/@prisma
COPY --from=builder /app/backend/api/node_modules/.prisma ./backend/api/node_modules/.prisma

WORKDIR /app/backend/worker
CMD ["node", "dist/main.js"]
