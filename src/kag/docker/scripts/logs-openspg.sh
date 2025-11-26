#!/bin/bash

# Скрипт для просмотра логов OpenSPG
# Usage: ./logs-openspg.sh [service_name]
# Examples:
#   ./logs-openspg.sh              # все сервисы
#   ./logs-openspg.sh openspg-server  # только OpenSPG Server
#   ./logs-openspg.sh mysql        # только MySQL

set -e

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

SERVICE_NAME="${1:-}"

if [ -z "$SERVICE_NAME" ]; then
    echo "📋 Просмотр логов всех сервисов..."
    echo "   Нажмите Ctrl+C для выхода"
    echo ""
    $DOCKER_COMPOSE -f docker-compose-education.yml logs -f
else
    echo "📋 Просмотр логов сервиса: $SERVICE_NAME"
    echo "   Нажмите Ctrl+C для выхода"
    echo ""
    $DOCKER_COMPOSE -f docker-compose-education.yml logs -f "$SERVICE_NAME"
fi

