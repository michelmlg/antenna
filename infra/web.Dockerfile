# Antenna — painel (SPA) + nginx com proxy /api e /hls.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --include=dev
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @antenna/web

FROM nginx:alpine
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
