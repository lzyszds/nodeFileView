# syntax=docker/dockerfile:1

FROM node:22-bookworm AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile=false
COPY apps ./apps
COPY locales ./locales
COPY data ./data
RUN pnpm --filter @nodefileview/web build \
  && pnpm --filter @nodefileview/server build

FROM node:22-bookworm
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    fonts-noto-cjk \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --filter @nodefileview/server --prod --frozen-lockfile=false

COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY locales ./locales
COPY apps/server/package.json ./apps/server/
COPY .env.example ./.env.example

RUN mkdir -p /app/data/uploads /app/data/cache /app/data/temp

ENV NODE_ENV=production \
    PORT=8013 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data \
    LIBREOFFICE_PATH=soffice

EXPOSE 8013
VOLUME ["/app/data"]
CMD ["node", "apps/server/dist/index.js"]
