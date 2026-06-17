# Built with: docker build -f apps/api/Dockerfile -t knockit-api .
# MUST be run with the monorepo ROOT as the build context (the trailing "."
# in that command refers to the repo root, not apps/api) — this image needs
# the workspace root package.json + package-lock.json to resolve
# dependencies correctly under npm workspaces. Building from inside
# apps/api alone (as an earlier version of this file did) silently used the
# wrong lockfile location and would fail or resolve dependencies
# incorrectly. The deploy workflows already invoke this with the correct
# context — see deploy-staging.yml / deploy-production.yml.

# ── Build stage ──
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace-root manifests first (better layer caching) plus every
# workspace's own package.json, since npm needs all of them to resolve the
# workspace dependency graph before `npm ci` will succeed.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN npm ci

COPY apps/api ./apps/api
COPY packages/shared-types ./packages/shared-types
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

# Run as non-root user inside the container
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs
USER nestjs

CMD ["node", "apps/api/dist/main.js"]
