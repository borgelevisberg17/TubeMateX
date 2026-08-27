FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/var/lib/tubematex \
    DOWNLOAD_DIR=/var/lib/tubematex/downloads \
    HISTORY_DIR=/var/lib/tubematex/history \
    SESSION_DB_DIR=/var/lib/tubematex \
    DATABASE_PATH=/var/lib/tubematex/tubematex.sqlite \
    SEARCH_PROVIDERS=ytsearch,scsearch,vimeo,twitch

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

WORKDIR /app
COPY backend/server.js ./backend/server.js
COPY frontend ./frontend

RUN mkdir -p /var/lib/tubematex/downloads /var/lib/tubematex/history \
    && chown -R node:node /app /var/lib/tubematex
USER node

EXPOSE 3000
VOLUME ["/var/lib/tubematex"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "backend/server.js"]
