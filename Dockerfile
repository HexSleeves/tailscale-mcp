FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run qa && bun run build

FROM oven/bun:1-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_BIND_HOST=127.0.0.1
ENV MCP_HTTP_PORT=3000

COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json README.md LICENSE ./

USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "dist/index.js", "--http", "--host", "127.0.0.1", "--port", "3000"]
