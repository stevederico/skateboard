FROM node:24-bookworm-slim AS frontend

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN if find /app \( -name '.env' -o -name '.env.*' \) ! -name '.env.example' -print -quit | grep -q .; then \
      echo 'FATAL: .env file present in Docker build context — aborting'; \
      find /app \( -name '.env' -o -name '.env.*' \) ! -name '.env.example' -print; \
      exit 1; \
    fi
RUN npm run build

FROM rust:bookworm AS backend

RUN apt-get update && apt-get install -y --no-install-recommends \
      libsqlite3-dev libcurl4-openssl-dev pkg-config ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY backend/rust-toolchain.toml backend/Cargo.toml backend/Cargo.lock ./
COPY backend/src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libsqlite3-0 libcurl4 ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --home /app --shell /usr/sbin/nologin skateboard

WORKDIR /app
COPY --from=frontend /app/dist ./dist
COPY --from=backend /build/target/release/skateboard-backend /usr/local/bin/skateboard-backend
COPY backend/config.json ./backend/config.json

RUN mkdir -p /app/backend/databases \
    && chown -R skateboard:skateboard /app

USER skateboard
ENV NODE_ENV=production
ENV SKATEBOARD_BACKEND_DIR=/app/backend
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/health >/dev/null || exit 1

CMD ["skateboard-backend"]
