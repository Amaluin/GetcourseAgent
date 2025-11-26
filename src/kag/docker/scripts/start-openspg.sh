#!/bin/bash

# Скрипт для запуска OpenSPG для образовательной доменной области GetcourseAgent
# Usage: ./start-openspg.sh

set -e

echo "🚀 Запуск OpenSPG для образовательной доменной области..."

# Переход в директорию с конфигурацией
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
cd "$DOCKER_DIR"

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Ошибка: Docker не установлен"
    echo "Установите Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Ошибка: Docker Compose не установлен"
    echo "Установите Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# Определение команды docker compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Создание необходимых директорий
echo "📁 Создание необходимых директорий..."
mkdir -p schema rules init/mysql init/neo4j

# Проверка наличия файлов конфигурации
if [ ! -f "docker-compose-education.yml" ]; then
    echo "❌ Ошибка: Файл docker-compose-education.yml не найден"
    exit 1
fi

if [ ! -f "schema/education-schema.json" ]; then
    echo "⚠️  Предупреждение: Файл schema/education-schema.json не найден"
fi

# Остановка существующих контейнеров (если есть)
echo "🛑 Остановка существующих контейнеров..."
$DOCKER_COMPOSE -f docker-compose-education.yml down 2>/dev/null || true

# Запуск контейнеров
echo "🐳 Запуск контейнеров..."
$DOCKER_COMPOSE -f docker-compose-education.yml up -d

# Ожидание запуска сервисов
echo "⏳ Ожидание запуска сервисов (30 секунд)..."
sleep 30

# Проверка состояния сервисов
echo ""
echo "📊 Проверка состояния сервисов..."
$DOCKER_COMPOSE -f docker-compose-education.yml ps

# Проверка здоровья сервисов
echo ""
echo "🏥 Проверка здоровья сервисов..."

# Проверка MySQL
if docker exec mysql-education mysqladmin ping -h localhost -u root -proot@123 &> /dev/null; then
    echo "✅ MySQL: работает"
else
    echo "❌ MySQL: не отвечает"
fi

# Проверка Neo4j
if curl -s http://localhost:7475 > /dev/null; then
    echo "✅ Neo4j: работает"
else
    echo "⚠️  Neo4j: не отвечает (может еще запускаться)"
fi

# Проверка MinIO
if curl -s http://localhost:9001 > /dev/null; then
    echo "✅ MinIO: работает"
else
    echo "⚠️  MinIO: не отвечает (может еще запускаться)"
fi

# Проверка OpenSPG Server (может потребоваться больше времени)
echo ""
echo "⏳ Ожидание запуска OpenSPG Server (может занять до 2 минут)..."
MAX_RETRIES=24
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:8887/api/v1/health > /dev/null 2>&1; then
        echo "✅ OpenSPG Server: работает"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo "⚠️  OpenSPG Server: не отвечает после $((MAX_RETRIES * 5)) секунд"
        echo "Проверьте логи: docker logs openspg-education"
    else
        echo -n "."
        sleep 5
    fi
done

# Загрузка схемы в OpenSPG (если сервер запустился)
if curl -s http://localhost:8887/api/v1/health > /dev/null 2>&1; then
    echo ""
    echo "📤 Загрузка схемы в OpenSPG..."
    if [ -f "schema/education-schema.json" ]; then
        if curl -X POST http://localhost:8887/api/v1/schema/load \
          -H "Content-Type: application/json" \
          -d @schema/education-schema.json \
          -s -o /dev/null -w "%{http_code}" | grep -q "200"; then
            echo "✅ Схема загружена успешно"
        else
            echo "⚠️  Не удалось загрузить схему (API может быть недоступен)"
        fi
    fi

    # Загрузка правил вывода
    echo ""
    echo "📤 Загрузка правил вывода..."
    if [ -d "rules" ]; then
        for rule in rules/*.kgdsl; do
            if [ -f "$rule" ]; then
                RULE_NAME=$(basename "$rule")
                if curl -X POST http://localhost:8887/api/v1/rules/load \
                  -H "Content-Type: text/plain" \
                  --data-binary @"$rule" \
                  -s -o /dev/null -w "%{http_code}" | grep -q "200"; then
                    echo "✅ Правило $RULE_NAME загружено"
                else
                    echo "⚠️  Не удалось загрузить правило $RULE_NAME"
                fi
            fi
        done
    fi
fi

# Вывод информации о доступе
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 OpenSPG для образовательной доменной области успешно запущен!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 Доступ к сервисам:"
echo "   • OpenSPG API:    http://localhost:8887"
echo "   • OpenSPG Web:    http://localhost:8888"
echo "   • Neo4j Browser:  http://localhost:7475 (neo4j / neo4j@openspg)"
echo "   • MinIO Console:  http://localhost:9001 (minioadmin / minioadmin)"
echo "   • MySQL:          localhost:3307 (openspg / openspg@123)"
echo ""
echo "📝 Полезные команды:"
echo "   • Просмотр логов:     docker logs openspg-education -f"
echo "   • Остановка:          ./scripts/stop-openspg.sh"
echo "   • Сброс данных:       ./scripts/reset-openspg.sh"
echo "   • Статус сервисов:    docker-compose -f docker-compose-education.yml ps"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

