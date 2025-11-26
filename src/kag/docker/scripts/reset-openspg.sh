#!/bin/bash

# Скрипт для сброса OpenSPG (удаление всех данных)
# Usage: ./reset-openspg.sh

set -e

echo "⚠️  ВНИМАНИЕ: Этот скрипт удалит ВСЕ данные OpenSPG!"
echo ""
read -p "Вы уверены? (yes/no): " -r
echo

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "❌ Отменено"
    exit 1
fi

echo "🔄 Сброс OpenSPG..."

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
echo "🛑 Остановка контейнеров..."
$DOCKER_COMPOSE -f docker-compose-education.yml down

# Удаление томов данных
echo "🗑️  Удаление томов данных..."
docker volume rm docker_mysql_data 2>/dev/null || echo "   Volume mysql_data не найден"
docker volume rm docker_neo4j_data 2>/dev/null || echo "   Volume neo4j_data не найден"
docker volume rm docker_neo4j_logs 2>/dev/null || echo "   Volume neo4j_logs не найден"
docker volume rm docker_neo4j_import 2>/dev/null || echo "   Volume neo4j_import не найден"
docker volume rm docker_neo4j_plugins 2>/dev/null || echo "   Volume neo4j_plugins не найден"
docker volume rm docker_minio_data 2>/dev/null || echo "   Volume minio_data не найден"

echo ""
echo "✅ Все данные удалены"
echo ""
echo "📝 Для запуска с нуля используйте: ./scripts/start-openspg.sh"

