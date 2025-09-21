# syntax=docker/dockerfile:1.7-labs
FROM oven/bun:1-alpine

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Зависимости (dev тоже нужны для сборки)
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.cache/bun \
    bun install --frozen-lockfile

# Исходники
COPY . .

# Сборка Next
RUN bun x next build

# Прод-запуск через next start (в Bun-образе нет node, поэтому server.js не подойдёт)
USER bun
EXPOSE 3000
ENV PORT=3000
CMD ["bun", "x", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
