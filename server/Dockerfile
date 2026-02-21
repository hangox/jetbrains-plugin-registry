FROM oven/bun:1-alpine

WORKDIR /app

# 安装依赖
COPY server/package.json server/bun.lock ./
RUN bun install --production --frozen-lockfile

# 复制源码
COPY server/src ./src
COPY server/tsconfig.json ./

# 数据目录
RUN mkdir -p /app/data
VOLUME /app/data

ENV DATA_DIR=/app/data
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://localhost:3000/api/health || exit 1

CMD ["bun", "run", "src/index.ts"]
