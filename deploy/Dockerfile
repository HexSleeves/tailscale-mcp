FROM oven/bun:1.3 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build:binary

FROM gcr.io/distroless/cc-debian12:nonroot

COPY --from=builder /app/dist/server /server

EXPOSE 3000
USER nonroot

ENTRYPOINT ["/server", "--http"]
