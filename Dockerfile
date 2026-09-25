# AceMate: build the website, then run the Node server that serves it.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 ACEMATE_DB_PATH=/data/acemate.db
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist/web ./dist/web
# Attach a persistent volume at /data (Railway: a Volume mounted at /data;
# Docker: -v acemate-data:/data). Hosts mount volumes as root, so the server
# runs as root to be able to write the database there.
RUN mkdir -p /data
EXPOSE 8787
CMD ["node", "server/index.mjs"]
