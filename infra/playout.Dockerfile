# Antenna — worker de playout: FFmpeg 7 (BtbN, estático) + yt-dlp + Deno.
FROM node:22-bookworm-slim
WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates unzip xz-utils openssl \
    && rm -rf /var/lib/apt/lists/*

# FFmpeg 7.x estático (inclui ffprobe) — elimina o warning "Late SEI" do 5.1
ARG FFMPEG_BUILD=ffmpeg-master-latest-linux64-gpl
ADD https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${FFMPEG_BUILD}.tar.xz /tmp/ffmpeg.tar.xz
RUN tar -xJf /tmp/ffmpeg.tar.xz -C /tmp \
    && cp /tmp/${FFMPEG_BUILD}/bin/ffmpeg /tmp/${FFMPEG_BUILD}/bin/ffprobe /usr/local/bin/ \
    && rm -rf /tmp/ffmpeg.tar.xz /tmp/${FFMPEG_BUILD} \
    && ffmpeg -version | head -1

ARG YTDLP_VERSION=latest
RUN (curl -fsSL -o /usr/local/bin/yt-dlp \
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
