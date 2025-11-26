# OpenSPG Docker для GetcourseAgent

Эта директория содержит Docker конфигурацию для запуска OpenSPG с образовательной доменной областью.

## 🚀 Быстрый старт

```bash
# Запуск всех сервисов
cd src/kag/docker
chmod +x scripts/*.sh
./scripts/start-openspg.sh

# Проверка статуса
./scripts/status-openspg.sh

# Просмотр логов
./scripts/logs-openspg.sh

# Остановка
./scripts/stop-openspg.sh
```

## 📁 Структура

```
docker/
├── docker-compose-education.yml  # Основная конфигурация
├── init/
│   ├── mysql/
│   │   └── init.sql             # Инициализация MySQL
│   └── neo4j/
│       └── init.cypher          # Инициализация Neo4j
├── schema/
│   └── education-schema.json    # SPG-Schema
├── rules/
│   ├── student-readiness.kgdsl  # Правила вывода
│   ├── assignment-difficulty.kgdsl
│   └── concept-prerequisites.kgdsl
└── scripts/
    ├── start-openspg.sh         # Запуск
    ├── stop-openspg.sh          # Остановка
    ├── reset-openspg.sh         # Сброс данных
    ├── logs-openspg.sh          # Просмотр логов
    └── status-openspg.sh        # Проверка статуса
```

## 🐳 Сервисы

### OpenSPG Server
- **Порты**: 8887 (API), 8888 (Web)
- **Описание**: Основной сервер OpenSPG

### MySQL
- **Порт**: 3307
- **Пользователь**: openspg
- **Пароль**: openspg@123
- **База данных**: openspg_education

### Neo4j
- **Порты**: 7475 (HTTP), 7688 (Bolt)
- **Пользователь**: neo4j
- **Пароль**: neo4j@openspg

### MinIO
- **Порты**: 9000 (API), 9001 (Console)
- **Пользователь**: minioadmin
- **Пароль**: minioadmin

## 📝 Команды

### Запуск
```bash
./scripts/start-openspg.sh
```

### Остановка
```bash
./scripts/stop-openspg.sh
```

### Сброс всех данных
```bash
./scripts/reset-openspg.sh
```

### Просмотр логов
```bash
# Все сервисы
./scripts/logs-openspg.sh

# Конкретный сервис
./scripts/logs-openspg.sh openspg-server
./scripts/logs-openspg.sh mysql
./scripts/logs-openspg.sh neo4j
```

### Проверка статуса
```bash
./scripts/status-openspg.sh
```

## 🔧 Конфигурация

### Переменные окружения

Создайте файл `.env` в директории `docker/`:

```env
# MySQL
MYSQL_ROOT_PASSWORD=root@123
MYSQL_DATABASE=openspg_education
MYSQL_USER=openspg
MYSQL_PASSWORD=openspg@123

# Neo4j
NEO4J_AUTH=neo4j/neo4j@openspg

# MinIO
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
```

## 🐛 Troubleshooting

### OpenSPG Server не запускается

```bash
# Проверьте логи
docker logs openspg-education -f

# Перезапустите сервис
docker restart openspg-education
```

### MySQL не отвечает

```bash
# Проверьте статус
docker exec mysql-education mysqladmin ping -h localhost -u root -proot@123

# Подключитесь к MySQL
docker exec -it mysql-education mysql -u openspg -popenspg@123 openspg_education
```

### Neo4j не отвечает

```bash
# Проверьте логи
docker logs neo4j-education -f

# Откройте браузер Neo4j
open http://localhost:7475
```

### Очистка всех данных

```bash
# Остановка и удаление всех данных
./scripts/reset-openspg.sh

# Запуск с нуля
./scripts/start-openspg.sh
```

## 📊 Мониторинг

### Использование ресурсов

```bash
# Статистика контейнеров
docker stats

# Использование дисков
docker system df -v
```

### Проверка здоровья

```bash
# Статус всех сервисов
./scripts/status-openspg.sh

# Проверка API
curl http://localhost:8887/api/v1/health
```

## 🔐 Безопасность

**ВАЖНО**: Пароли в конфигурации предназначены только для разработки!

Для продакшн-окружения:
1. Измените все пароли
2. Используйте Docker secrets
3. Настройте SSL/TLS
4. Ограничьте доступ к портам

## 📚 Дополнительная информация

- [OpenSPG Documentation](https://openspg.yuque.com/)
- [Neo4j Documentation](https://neo4j.com/docs/)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [MinIO Documentation](https://min.io/docs/)

