# ---- Builder Stage ----
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

RUN bun build src/main.ts --compile --target=bun --outfile=dist/server

# ---- Final Stage ----
# distroless has no shell, wget, or curl — healthchecks are handled by
# docker-compose via the ts-mcp sidecar. Do NOT add HEALTHCHECK here.
FROM gcr.io/distroless/cc-debian12:nonroot

COPY --from=builder /app/dist/server /server

EXPOSE 3000

USER nonroot

ENTRYPOINT ["/server"]
