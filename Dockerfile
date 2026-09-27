# Build the app (frontend) and the server in one stage, run them in a smaller one.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The server is bundled into one file with its dependencies (scripts/buildServer.mjs),
# so the image needs neither node_modules nor TypeScript at runtime. The CLI likewise
# (scripts/buildCli.mjs), into dist/cli/, where /install.sh fetches it from.
RUN npm run build && npm run build:server && npm run build:cli

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/data \
    STATIC_DIR=./dist \
    NODE_OPTIONS=--enable-source-maps
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# Owned by node, so that a named volume is writable for that user.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "dist-server/index.mjs"]
