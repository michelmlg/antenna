# Antenna — API (controle). yt-dlp NÃO vive aqui: operações de binário vão ao worker.
FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
RUN npm ci --include=dev

COPY packages/database packages/database
COPY packages/shared packages/shared
COPY packages/core packages/core
COPY apps/api apps/api
RUN npx prisma generate --schema packages/database/prisma/schema.prisma

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npx", "tsx", "apps/api/src/index.ts"]
