# Лёгкая база
FROM oven/bun:1-alpine

# Рабочая директория внутри контейнера
WORKDIR /app

# Сначала только манифесты — для кеша зависимостей
COPY package.json bun.lock ./

# Установка зависимостей (только production)
RUN --mount=type=cache,target=/root/.cache/bun \
    bun install --frozen-lockfile --production

# Теперь копируем исходники
COPY . .

# Безопасный запуск (не от root)
USER bun

# Порт приложения
EXPOSE 3000

# Запуск — через скрипт start в package.json
CMD ["bun", "run", "start"]
