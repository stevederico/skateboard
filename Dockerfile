# Multi-stage build for smaller production image
FROM denoland/deno:alpine-2.6.3 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install dependencies with deno
RUN deno install && cd backend && deno install

# Copy source code
COPY . .

# Build frontend
RUN deno run build

# Production stage
FROM denoland/deno:alpine-2.6.3

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy backend
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# Copy package files
COPY package*.json ./

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD deno eval "const r = await fetch('http://localhost:8000/api/health'); if (!r.ok) Deno.exit(1);" || exit 1

# Run server
CMD ["deno", "run", "start"]
