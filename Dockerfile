FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/scripts/backup.mjs ./scripts/backup.mjs
COPY --from=build /app/release/web ./release/web
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=8787
VOLUME ["/app/data"]
EXPOSE 8787
CMD ["node","server/index.mjs"]
