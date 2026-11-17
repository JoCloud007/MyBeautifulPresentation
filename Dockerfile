# Multi-stage build for Next.js 15 + Node.js 20 Alpine
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps

# Optional proxy configuration
ARG HTTP_PROXY=""
ARG HTTPS_PROXY=""
ARG NO_PROXY=""
ARG NODE_TLS_REJECT_UNAUTHORIZED="1"
ARG APK_NO_CHECK_CERTIFICATE=""

ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV NO_PROXY=${NO_PROXY}
ENV NODE_TLS_REJECT_UNAUTHORIZED=${NODE_TLS_REJECT_UNAUTHORIZED}

RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./

# Configure npm proxy if set
RUN if [ -n "$HTTP_PROXY" ]; then npm config set proxy "$HTTP_PROXY"; fi
RUN if [ -n "$HTTPS_PROXY" ]; then npm config set https-proxy "$HTTPS_PROXY"; fi
RUN if [ "$NODE_TLS_REJECT_UNAUTHORIZED" = "0" ]; then npm config set strict-ssl false; fi

RUN npm install

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
ARG CACHE_BUST=1
ARG NEXT_PUBLIC_MCP_PPTX_URL=""
ARG NEXT_PUBLIC_MCP_MERMAID_URL=""
ARG NEXT_PUBLIC_MCP_EXCALIDRAW_URL=""
ARG NEXT_PUBLIC_MCP_WEB_URL=""
ENV NEXT_PUBLIC_MCP_PPTX_URL=${NEXT_PUBLIC_MCP_PPTX_URL}
ENV NEXT_PUBLIC_MCP_MERMAID_URL=${NEXT_PUBLIC_MCP_MERMAID_URL}
ENV NEXT_PUBLIC_MCP_EXCALIDRAW_URL=${NEXT_PUBLIC_MCP_EXCALIDRAW_URL}
ENV NEXT_PUBLIC_MCP_WEB_URL=${NEXT_PUBLIC_MCP_WEB_URL}
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
