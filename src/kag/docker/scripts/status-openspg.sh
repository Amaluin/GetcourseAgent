#!/bin/bash

# Скрипт для проверки статуса OpenSPG
# Usage: ./status-openspg.sh

set -e

echo "📊 Проверка статуса OpenSPG..."
echo ""

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

# Статус контейнеров
echo "🐳 Статус контейнеров:"
$DOCKER_COMPOSE -f docker-compose-education.yml ps

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏥 Проверка здоровья сервисов:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Проверка MySQL
echo -n "MySQL:           "
if docker exec mysql-education mysqladmin ping -h localhost -u root -proot@123 &> /dev/null; then
    echo "✅ работает"
else
    echo "❌ не отвечает"
fi

# Проверка Neo4j
echo -n "Neo4j:           "
if curl -s http://localhost:7475 > /dev/null 2>&1; then
    echo "✅ работает"
else
    echo "❌ не отвечает"
fi

# Проверка MinIO
echo -n "MinIO:           "
if curl -s http://localhost:9001 > /dev/null 2>&1; then
    echo "✅ работает"
else
    echo "❌ не отвечает"
fi

# Проверка OpenSPG Server
echo -n "OpenSPG Server:  "
if curl -s http://localhost:8887/api/v1/health > /dev/null 2>&1; then
    echo "✅ работает"
else
    echo "❌ не отвечает"
fi

# Статистика по томам
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💾 Использование дисков:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

docker system df -v | grep -A 20 "Local Volumes:" | grep "docker_" || echo "Нет данных о томах"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📍 Доступ к сервисам:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "   • OpenSPG API:    http://localhost:8887"
echo "   • OpenSPG Web:    http://localhost:8888"
echo "   • Neo4j Browser:  http://localhost:7475"
echo "   • MinIO Console:  http://localhost:9001"
echo "   • MySQL:          localhost:3307"
echo ""

