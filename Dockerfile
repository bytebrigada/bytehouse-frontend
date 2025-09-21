# syntax=docker/dockerfile:1.7-labs
FROM oven/bun:1-alpine

WORKDIR /app
ENV NODE_ENV=production

# 1) Сначала манифесты — кеш зависимостей
COPY package.json bun.lock ./

# 2) Установка зависимостей (dev тоже нужны для сборки)
RUN --mount=type=cache,target=/root/.cache/bun \
    bun install --frozen-lockfile

# 3) Код
COPY . .

# 4) Сборка Next
# (предполагается, что в package.json есть "build": "next build")
RUN bun run build

# 5) Запуск прод-сервера Next
USER bun
EXPOSE 3000
ENV PORT=3000
# (предполагается, что в package.json есть "start": "next start -p ${PORT:-3000}")
CMD ["bun", "run", "start"]
