# Base images are pinned by multi-arch index digest (tag kept for
# readability). Each digest was first published at least 7 days before
# it was pinned (2026-11-03).
# node:24.22.0-bookworm-slim, pushed 2026-10-21
FROM node:24.22.0-bookworm-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4 AS frontend

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

# rust:1.99.1-bookworm, first published 2026-10-22 (the tag moved on 2026-10-28)
FROM rust:1.99.1-bookworm@sha256:48b7f435b8fc6378ce43b44f15e3a47fd8919b2825f835c39bd4bd3da50af5b8 AS backend

# Use the image's pinned toolchain; rust-toolchain.toml says "stable", which
# would otherwise make rustup download whatever stable is current.
ENV RUSTUP_TOOLCHAIN=1.99.1

RUN apt-get update && apt-get install -y --no-install-recommends \
      libsqlite3-dev libcurl4-openssl-dev pkg-config ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY backend/rust-toolchain.toml backend/Cargo.toml backend/Cargo.lock ./
COPY backend/src ./src
RUN cargo build --release --locked

# debian:bookworm-20261020-slim, pushed 2026-10-21
FROM debian:bookworm-20261020-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8

RUN apt-get update && apt-get install -y --no-install-recommends \
      libsqlite3-0 libcurl4 ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --home /app --shell /usr/sbin/nologin skateboard

WORKDIR /app
COPY --from=frontend /app/dist ./dist
COPY --from=backend /build/target/release/skateboard-backend /usr/local/bin/skateboard-backend
COPY backend/config.json ./backend/config.json
# Checkout and the webhook read the plan list (stripeProducts) from here.
COPY src/constants.json ./src/constants.json

RUN mkdir -p /app/backend/databases \
    && chown -R skateboard:skateboard /app

USER skateboard
ENV NODE_ENV=production
ENV SKATEBOARD_BACKEND_DIR=/app/backend
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/health >/dev/null || exit 1

CMD ["skateboard-backend"]
