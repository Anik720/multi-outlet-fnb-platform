# syntax=docker/dockerfile:1

# ---- deps: install all dependencies (cached on lockfile) ---------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# ---- build: generate Prisma client + compile TypeScript ----------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime: minimal image, non-root user -----------------------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma

USER node
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply pending migrations, seed demo data if enabled + DB empty, then serve.
CMD ["npm", "run", "start:prod"]
