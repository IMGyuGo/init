FROM node:20-bookworm-slim AS builder

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY backend/common/package.json backend/common/package-lock.json backend/common/tsconfig.json ./backend/common/
COPY backend/common/src ./backend/common/src
RUN npm ci --prefix backend/common \
  && npm run build --prefix backend/common

COPY backend/api/package.json backend/api/package-lock.json backend/api/tsconfig.json backend/api/tsconfig.build.json backend/api/nest-cli.json ./backend/api/
COPY backend/api/prisma ./backend/api/prisma
RUN npm ci --prefix backend/api

COPY backend/api/src ./backend/api/src
RUN npm run prisma:generate --prefix backend/api \
  && npm run build --prefix backend/api

FROM node:20-bookworm-slim AS runner

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/backend/common ./backend/common
COPY --from=builder /app/backend/api/package.json /app/backend/api/package-lock.json ./backend/api/
COPY --from=builder /app/backend/api/node_modules ./backend/api/node_modules
COPY --from=builder /app/backend/api/dist ./backend/api/dist
COPY --from=builder /app/backend/api/prisma ./backend/api/prisma
RUN rm -rf backend/api/node_modules/@init/common \
  && mkdir -p backend/api/node_modules/@init \
  && ln -s ../../../common backend/api/node_modules/@init/common

WORKDIR /app/backend/api
EXPOSE 3001
CMD ["node", "dist/src/main.js"]
