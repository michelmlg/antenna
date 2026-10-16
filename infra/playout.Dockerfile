# Antenna — worker de playout: FFmpeg, yt-dlp e Deno (desafios do YouTube) moram aqui.
FROM node:22-bookworm-slim
WORKDIR /app

ARG YTDLP_VERSION=latest
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates unzip openssl \
    && rm -rf /var/lib/apt/lists/* \
    && (curl -fsSL -o /usr/local/bin/yt-dlp \
        "https://github.com/yt-dlp/yt-dlp/releases/${YTDLP_VERSION}/download/yt-dlp_linux" \
        && chmod +x /usr/local/bin/yt-dlp) \
    && (curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y >/dev/null 2>&1 \
        || echo "AVISO: deno não instalado") \
    && mkdir -p /root/.config/yt-dlp && printf -- "--no-playlist\n" > /root/.config/yt-dlp/config

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY packages/core/package.json packages/core/
COPY apps/playout/package.json apps/playout/
RUN npm ci --include=dev

COPY packages/database packages/database
COPY packages/shared packages/shared
COPY packages/core packages/core
COPY apps/playout apps/playout
RUN npx prisma generate --schema packages/database/prisma/schema.prisma

ENV NODE_ENV=production
CMD ["npx", "tsx", "apps/playout/src/index.ts"]
