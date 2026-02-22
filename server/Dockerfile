# ---- Build Stage ----
FROM oven/bun:1-debian AS builder

WORKDIR /app

# 安装依赖
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile

# 复制源码
COPY server/src ./src
COPY server/tsconfig.json ./

# 编译为独立二进制
RUN bun build src/index.ts --compile --minify --outfile registry-server

# ---- Runtime Stage ----
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 仅复制编译后的二进制
COPY --from=builder /app/registry-server ./registry-server

# 数据目录
RUN mkdir -p /app/data
VOLUME /app/data

ENV DATA_DIR=/app/data
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://localhost:3000/api/health || exit 1

CMD ["./registry-server"]
