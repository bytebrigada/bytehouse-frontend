# ---------- Build stage ----------
FROM oven/bun:1 AS build
WORKDIR /app

# Устанавливаем зависимости
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Собираем Vite
COPY . .
# важно: у тебя в package.json "build": "tsc -b && vite build"
RUN bun run build

# ---------- Runtime stage ----------
FROM nginx:1.27-alpine AS runtime
# Nginx конфиг для SPA (fallback на index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Копируем сборку
COPY --from=build /app/dist /usr/share/nginx/html

# (опционально) healthcheck — проверяем, что index отдает 200
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://localhost/ || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
