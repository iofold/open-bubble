FROM node:25-bookworm-slim AS build

ARG DUCKDB_VERSION=v1.4.2

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY apps/api/package*.json ./apps/api/
COPY apps/codex-app-server/package*.json ./apps/codex-app-server/
COPY apps/control-panel/package*.json ./apps/control-panel/

RUN cd apps/codex-app-server && npm ci
RUN cd apps/api && npm ci
RUN cd apps/control-panel && npm ci

COPY docs ./docs
COPY apps/api ./apps/api
COPY apps/codex-app-server ./apps/codex-app-server
COPY apps/control-panel ./apps/control-panel
COPY apps/codex-agent/testdata ./apps/codex-agent/testdata

RUN cd apps/codex-app-server && npm run build
RUN cd apps/control-panel && npm run build
RUN cd apps/api && npm run build:api

RUN curl -fsSL "https://github.com/duckdb/duckdb/releases/download/${DUCKDB_VERSION}/duckdb_cli-linux-amd64.zip" -o /tmp/duckdb.zip \
  && unzip /tmp/duckdb.zip -d /usr/local/bin \
  && chmod +x /usr/local/bin/duckdb \
  && rm /tmp/duckdb.zip

FROM node:25-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV OPEN_BUBBLE_CONTEXT_DB=/data/context.duckdb
ENV OPEN_BUBBLE_CONTROL_PANEL_DIST=/app/apps/control-panel/dist

COPY --from=build /usr/local/bin/duckdb /usr/local/bin/duckdb
COPY --from=build /app/apps/api/package*.json ./apps/api/
COPY --from=build /app/apps/codex-app-server/package*.json ./apps/codex-app-server/
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/codex-app-server/node_modules ./apps/codex-app-server/node_modules
COPY --from=build /app/apps/codex-app-server/dist ./apps/codex-app-server/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/control-panel/dist ./apps/control-panel/dist
COPY --from=build /app/docs ./docs

RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "apps/api/dist/src/server.js"]
