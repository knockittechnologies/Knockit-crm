# Built with: docker build -f apps/api/Dockerfile -t knockit-api .
# Run from the REPO ROOT as build context.

# ── Build stage ──
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

RUN npm ci

COPY apps/api ./apps/api

RUN npm run build --workspace=apps/api

# ── Production stage ──
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

RUN npm ci --omit=dev --workspace=apps/api

COPY --from=builder /app/apps/api/dist ./apps/api/dist

EXPOSE 3000

RUN addgroup -S nodejs && adduser -S nestjs -G nodejs
USER nestjs

CMD ["node", "apps/api/dist/main.js"]