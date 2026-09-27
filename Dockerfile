# Build the app (frontend) in one stage, run the server in a smaller one.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/data \
    STATIC_DIR=./dist
COPY package.json package-lock.json ./
# Only the server's dependencies (hono, openid-client, tsx); the frontend libraries are already bundled in dist/.
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
# The code the server shares with the app: format, conversion and protocol.
COPY src/model ./src/model
COPY src/persist ./src/persist
COPY src/sync/protocol.ts ./src/sync/protocol.ts
# Owned by node, so that a named volume is writable for that user.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node_modules/.bin/tsx", "server/index.ts"]
