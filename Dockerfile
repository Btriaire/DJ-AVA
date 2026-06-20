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

# deno : runtime JS requis par yt-dlp pour résoudre les défis "signature"/"n" de
# YouTube (sinon seuls les storyboards sont dispo sur une IP datacenter). yt-dlp
# télécharge le script solveur EJS au runtime via --remote-components ejs:github.
# Layer séparé (curl/unzip installés puis purgés ici) pour ne pas invalider le
# cache lourd de Demucs/torch au-dessus. NB : build x86_64 (VPS) ; adapter si arm64.
ARG DENO_VERSION=v2.8.3
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates \
  && curl -fsSL "https://github.com/denoland/deno/releases/download/${DENO_VERSION}/deno-x86_64-unknown-linux-gnu.zip" -o /tmp/deno.zip \
  && unzip /tmp/deno.zip -d /usr/local/bin && chmod +x /usr/local/bin/deno && rm /tmp/deno.zip \
  && /usr/local/bin/deno --version | head -1 \
  && apt-get purge -y curl unzip && apt-get autoremove -y \
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
