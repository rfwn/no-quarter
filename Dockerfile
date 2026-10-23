# ---- build: deps, web bundle, dataset → SQLite ----
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends unzip python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev
COPY web/package*.json web/
RUN npm --prefix web ci

COPY . .
RUN npm run build
# The dataset is baked into the image as a read-only database (~400 MB).
RUN DATASET_DIR=/tmp/dataset DB_PATH=/app/db/torob.db node scripts/build-db.js && rm -rf /tmp/dataset

# ---- runtime ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/db/torob.db \
    DATA_DIR=/app/storage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/db ./db
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./
# /app/storage is a Liara disk: checkpoints, follow-ups, traces, audit log.
RUN mkdir -p /app/storage
EXPOSE 3000
CMD ["node", "src/server.js"]
