#!/bin/bash

# Скрипт для остановки OpenSPG
# Usage: ./stop-openspg.sh

set -e

echo "🛑 Остановка OpenSPG..."

# Переход в директорию с конфигурацией
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
cd "$DOCKER_DIR"

# Определение команды docker compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Остановка контейнеров
echo "🐳 Остановка контейнеров..."
$DOCKER_COMPOSE -f docker-compose-education.yml down

echo ""
echo "✅ OpenSPG остановлен"
echo ""
echo "📝 Примечание: Данные сохранены в Docker volumes"
echo "   Для полного удаления данных используйте: ./scripts/reset-openspg.sh"

