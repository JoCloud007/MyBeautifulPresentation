FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 mcp && adduser --system --uid 1001 mcp
COPY --from=builder --chown=mcp:mcp /app/dist ./dist
COPY --from=deps --chown=mcp:mcp /app/node_modules ./node_modules
COPY --from=builder --chown=mcp:mcp /app/package.json ./package.json
USER mcp
ARG PORT=3053
ENV PORT=$PORT
EXPOSE $PORT
ENV HOSTNAME="0.0.0.0"
CMD ["node", "dist/server.js"]
