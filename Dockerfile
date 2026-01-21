# Multi-stage build for smaller production image
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm install && cd backend && npm install

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy backend
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# Copy package files
COPY package*.json ./

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:8000/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

# Run server
CMD ["node", "--experimental-sqlite", "backend/server.js"]
