# Free Render demo image.
# The Render Blueprint uses backend/Dockerfile directly. This file remains as a
# simple no-paid-resource manual/container entry point.
FROM node:22-alpine AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY backend/src/db/schema.sql backend/src/db/schema.v2.sql ./src/db/
RUN addgroup -S civicforge && adduser -S civicforge -G civicforge \
    && mkdir -p /tmp/civicforge-uploads \
    && chown -R civicforge:civicforge /app /tmp/civicforge-uploads
USER civicforge
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["node", "dist/index.js"]
