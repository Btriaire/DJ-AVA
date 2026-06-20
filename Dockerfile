# ─────────────────────────────────────────────────────────────────────────────
# DJSynth — image de production pour le VPS.
# L'app ne peut PAS tourner en serverless Vercel : elle lance des binaires natifs
# (yt-dlp, ffmpeg, Demucs) et écrit un cache de stems sur disque. Cette image
# embarque toute la chaîne média.
#
#   docker build -t djsynth .                 # avec stems (tire torch, ~lourd)
#   docker build --build-arg WITH_STEMS=0 -t djsynth .   # sans séparation de stems
# ─────────────────────────────────────────────────────────────────────────────

# ---- build stage : compile le bundle standalone ----
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

# ---- runtime stage : serveur minimal + chaîne média ----
FROM node:20-slim AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV STEMS_CACHE_DIR=/data/stems-cache

# ffmpeg + yt-dlp (pip), et Demucs en option (séparation de stems = torch CPU)
ARG WITH_STEMS=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip ca-certificates \
  && pip3 install --no-cache-dir --break-system-packages yt-dlp \
  && if [ "$WITH_STEMS" = "1" ]; then pip3 install --no-cache-dir --break-system-packages demucs; fi \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# le bundle standalone contient server.js + le strict nécessaire de node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

RUN mkdir -p /data/stems-cache
VOLUME ["/data/stems-cache"]
EXPOSE 3000
CMD ["node", "server.js"]
