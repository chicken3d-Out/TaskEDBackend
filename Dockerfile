# Multi-stage build: compile TypeScript in a full node image, then run
# migrations + start from a second stage. Keeps dev deps + src in the
# final image (not just dist) so `npm run migration:run` - the same
# ts-node-based command used in local dev - works identically here,
# rather than depending on TypeORM's plain JS CLI against compiled
# output, which has known interop issues with this TypeORM version.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 3000
CMD ["sh", "-c", "npm run migration:run && node dist/main.js"]
