# Antenna — API (controle). yt-dlp NÃO vive aqui: operações de binário vão ao worker.
FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
RUN npm ci --include=dev

COPY packages/database packages/database
COPY packages/shared packages/shared
COPY packages/core packages/core
COPY apps/api apps/api
# logo padrão da personalização (semeado em data/branding na 1ª leitura)
COPY apps/web/public/logo-default-wordmark.png apps/web/public/
RUN npx prisma generate --schema packages/database/prisma/schema.prisma

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npx", "tsx", "apps/api/src/index.ts"]
