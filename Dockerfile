# Используем официальный образ Bun
FROM oven/bun:1 as base

# Рабочая директория внутри контейнера
WORKDIR /app

# Копируем package.json и lock-файл для установки зависимостей
COPY package.json bun.lockb* ./

# Устанавливаем зависимости
RUN bun install --frozen-lockfile

# Копируем весь проект
COPY . .

# Билдим Next.js приложение
RUN bun run build

# Запускаем в режиме production
EXPOSE 3000
CMD ["bun", "run", "start"]
