FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=4000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY src/db/schema.sql src/db/schema.v2.sql ./src/db/
RUN addgroup -S civicforge && adduser -S civicforge -G civicforge && mkdir -p /data/uploads && chown -R civicforge:civicforge /app /data
USER civicforge
EXPOSE 4000
CMD ["node", "dist/index.js"]
