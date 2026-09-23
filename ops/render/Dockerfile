FROM node:22-alpine3.22 AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:22-alpine3.22 AS runtime
WORKDIR /app
RUN apk add --no-cache bash ca-certificates postgresql17-client restic su-exec tini \
    && addgroup -S civicforge && adduser -S civicforge -G civicforge
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY backend/src/db/schema.sql backend/src/db/schema.v2.sql ./src/db/
COPY ops/backup/backup-loop.sh ops/backup/restore-drill.sh /usr/local/bin/
COPY ops/render/entrypoint.sh /usr/local/bin/render-entrypoint.sh
COPY ops/render/start.mjs ./render-start.mjs
RUN sed -i 's/\r$//' /usr/local/bin/*.sh \
    && chmod 0555 /usr/local/bin/*.sh \
    && chown -R civicforge:civicforge /app
ENV NODE_ENV=production PORT=10000
EXPOSE 10000 9090
ENTRYPOINT ["/sbin/tini", "-g", "--", "/usr/local/bin/render-entrypoint.sh"]
