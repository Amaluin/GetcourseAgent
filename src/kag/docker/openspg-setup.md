# Настройка OpenSPG Server в Docker для образовательной доменной области

## Обзор

Данный документ описывает настройку OpenSPG Server в Docker для использования в образовательной доменной области GetcourseAgent. Мы будем использовать существующую конфигурацию в `rag-system/kag-openspg/dev/release/docker-compose-west.yml` и адаптируем ее под наши нужды.

## Анализ существующей конфигурации

### Текущая структура
```
rag-system/kag-openspg/
├── dev/release/
│   ├── docker-compose-west.yml
│   └── ...
└── ...
```

### Компоненты в docker-compose-west.yml
1. **openspg-server** - основной сервер OpenSPG
2. **mysql** - база данных для метаданных
3. **neo4j** - графовая база данных
4. **minio** - объектное хранилище

## Адаптированная конфигурация Docker Compose

### docker-compose-education.yml
```yaml
version: '3.8'

services:
  # OpenSPG Server
  openspg-server:
    image: openspg/openspg-server:latest
    container_name: openspg-education
    ports:
      - "8887:8887"
      - "8888:8888"
    environment:
      - SPRING_PROFILES_ACTIVE=dev
      - OPENSPG_STORAGE_TYPE=mysql
      - OPENSPG_MYSQL_HOST=mysql
      - OPENSPG_MYSQL_PORT=3306
      - OPENSPG_MYSQL_DATABASE=openspg_education
      - OPENSPG_MYSQL_USERNAME=openspg
      - OPENSPG_MYSQL_PASSWORD=openspg@123
      - OPENSPG_NEO4J_HOST=neo4j
      - OPENSPG_NEO4J_PORT=7687
      - OPENSPG_NEO4J_USERNAME=neo4j
      - OPENSPG_NEO4J_PASSWORD=neo4j@openspg
      - OPENSPG_MINIO_HOST=minio
      - OPENSPG_MINIO_PORT=9000
      - OPENSPG_MINIO_ACCESS_KEY=minioadmin
      - OPENSPG_MINIO_SECRET_KEY=minioadmin
      - OPENSPG_MINIO_BUCKET=openspg-education
    volumes:
      - ./schema:/app/schema
      - ./rules:/app/rules
    depends_on:
      - mysql
      - neo4j
      - minio
    networks:
      - openspg-network
    restart: unless-stopped

  # MySQL Database
  mysql:
    image: mysql:8.0
    container_name: mysql-education
    ports:
      - "3306:3306"
    environment:
      - MYSQL_ROOT_PASSWORD=root@123
      - MYSQL_DATABASE=openspg_education
      - MYSQL_USER=openspg
      - MYSQL_PASSWORD=openspg@123
    volumes:
      - mysql_data:/var/lib/mysql
      - ./init/mysql:/docker-entrypoint-initdb.d
    networks:
      - openspg-network
    restart: unless-stopped
    command: --default-authentication-plugin=mysql_native_password

  # Neo4j Graph Database
  neo4j:
    image: neo4j:5.12-community
    container_name: neo4j-education
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      - NEO4J_AUTH=neo4j/neo4j@openspg
      - NEO4J_PLUGINS=["apoc"]
      - NEO4J_dbms_security_procedures_unrestricted=apoc.*
      - NEO4J_dbms_memory_heap_initial__size=512m
      - NEO4J_dbms_memory_heap_max__size=2G
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
      - neo4j_import:/var/lib/neo4j/import
      - neo4j_plugins:/plugins
      - ./init/neo4j:/docker-entrypoint-initdb.d
    networks:
      - openspg-network
    restart: unless-stopped

  # MinIO Object Storage
  minio:
    image: minio/minio:latest
    container_name: minio-education
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - minio_data:/data
    networks:
      - openspg-network
    restart: unless-stopped
    command: server /data --console-address ":9001"

  # MinIO Client for bucket creation
  minio-setup:
    image: minio/mc:latest
    container_name: minio-setup-education
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
      /usr/bin/mc alias set myminio http://minio:9000 minioadmin minioadmin;
      /usr/bin/mc mb myminio/openspg-education;
      /usr/bin/mc policy set public myminio/openspg-education;
      exit 0;
      "
    networks:
      - openspg-network

volumes:
  mysql_data:
  neo4j_data:
  neo4j_logs:
  neo4j_import:
  neo4j_plugins:
  minio_data:

networks:
  openspg-network:
    driver: bridge
```

## Структура директорий для образовательной доменной области

```
src/kag/
├── docker/
│   ├── docker-compose-education.yml
│   ├── init/
│   │   ├── mysql/
│   │   │   └── init.sql
│   │   └── neo4j/
│   │       └── init.cypher
│   ├── schema/
│   │   └── education-schema.json
│   └── rules/
│       ├── student-readiness.kgdsl
│       ├── assignment-difficulty.kgdsl
│       └── concept-prerequisites.kgdsl
├── schema/
│   └── education-schema.md
└── types/
    └── education-entities.md
```

## Инициализация баз данных

### MySQL init.sql
```sql
-- Создание таблиц для образовательной доменной области
USE openspg_education;

-- Таблица для метаданных схемы
CREATE TABLE IF NOT EXISTS schema_metadata (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Таблица для правил вывода
CREATE TABLE IF NOT EXISTS reasoning_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Вставка начальных данных
INSERT INTO schema_metadata (name, version, content) VALUES 
('education-schema', '1.0.0', 'Education domain schema for GetcourseAgent');

INSERT INTO reasoning_rules (name, type, content) VALUES 
('StudentReadiness', 'kgdsl', 'Rule for checking student readiness'),
('AssignmentDifficulty', 'kgdsl', 'Rule for assignment difficulty matching'),
('ConceptPrerequisites', 'kgdsl', 'Rule for concept prerequisites validation');
```

### Neo4j init.cypher
```cypher
// Создание ограничений для образовательной доменной области
CREATE CONSTRAINT lesson_id IF NOT EXISTS FOR (l:Lesson) REQUIRE l.id IS UNIQUE;
CREATE CONSTRAINT assignment_id IF NOT EXISTS FOR (a:Assignment) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT student_id IF NOT EXISTS FOR (s:Student) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT submission_id IF NOT EXISTS FOR (sub:Submission) REQUIRE sub.id IS UNIQUE;
CREATE CONSTRAINT concept_id IF NOT EXISTS FOR (c:Concept) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT resource_id IF NOT EXISTS FOR (r:Resource) REQUIRE r.id IS UNIQUE;

// Создание индексов для оптимизации запросов
CREATE INDEX lesson_title IF NOT EXISTS FOR (l:Lesson) ON (l.title);
CREATE INDEX lesson_difficulty IF NOT EXISTS FOR (l:Lesson) ON (l.difficulty);
CREATE INDEX student_level IF NOT EXISTS FOR (s:Student) ON (s.level);
CREATE INDEX concept_category IF NOT EXISTS FOR (c:Concept) ON (c.category);
CREATE INDEX concept_difficulty IF NOT EXISTS FOR (c:Concept) ON (c.difficulty);
CREATE INDEX assignment_title IF NOT EXISTS FOR (a:Assignment) ON (a.title);
CREATE INDEX submission_status IF NOT EXISTS FOR (sub:Submission) ON (sub.status);

// Создание полнотекстовых индексов
CREATE FULLTEXT INDEX lesson_content IF NOT EXISTS FOR (l:Lesson) ON EACH [l.title, l.content, l.summary];
CREATE FULLTEXT INDEX concept_description IF NOT EXISTS FOR (c:Concept) ON EACH [c.name, c.description];
CREATE FULLTEXT INDEX assignment_description IF NOT EXISTS FOR (a:Assignment) ON EACH [a.title, a.description];

// Создание начальных узлов для системы
MERGE (admin:Student {id: 'admin', name: 'System Administrator', level: 'advanced'});
MERGE (system:Lesson {id: 'system_intro', title: 'System Introduction', difficulty: 'beginner'});
```

## Преобразование SPG-Schema в JSON формат

### education-schema.json
```json
{
  "name": "education-schema",
  "version": "1.0.0",
  "description": "Education domain schema for GetcourseAgent KAG system",
  "entities": [
    {
      "name": "Lesson",
      "properties": [
        {"name": "id", "type": "string", "required": true},
        {"name": "title", "type": "string", "required": true},
        {"name": "content", "type": "text", "required": true},
        {"name": "summary", "type": "text", "required": false},
        {"name": "duration", "type": "integer", "required": false},
        {"name": "difficulty", "type": "enum", "values": ["beginner", "intermediate", "advanced"], "required": false},
        {"name": "created_at", "type": "datetime", "required": true},
        {"name": "updated_at", "type": "datetime", "required": true},
        {"name": "videoUrls", "type": "array", "items": {"type": "string"}, "required": false},
        {"name": "imageUrls", "type": "array", "items": {"type": "string"}, "required": false}
      ],
      "indexes": [
        {"type": "unique", "properties": ["id"]},
        {"type": "btree", "properties": ["title"]},
        {"type": "btree", "properties": ["difficulty"]},
        {"type": "fulltext", "properties": ["title", "content", "summary"]}
      ]
    },
    {
      "name": "Assignment",
      "properties": [
        {"name": "id", "type": "string", "required": true},
        {"name": "lesson_id", "type": "string", "required": true},
        {"name": "title", "type": "string", "required": true},
        {"name": "description", "type": "text", "required": true},
        {"name": "requirements", "type": "array", "items": {"type": "string"}, "required": false},
        {"name": "ideal_answer", "type": "text", "required": false},
        {"name": "max_attempts", "type": "integer", "required": false},
        {"name": "deadline", "type": "datetime", "required": false},
        {"name": "created_at", "type": "datetime", "required": true},
        {"name": "updated_at", "type": "datetime", "required": true}
      ],
      "indexes": [
        {"type": "unique", "properties": ["id"]},
        {"type": "btree", "properties": ["lesson_id"]},
        {"type": "btree", "properties": ["title"]}
      ]
    },
    {
      "name": "Student",
      "properties": [
        {"name": "id", "type": "string", "required": true},
        {"name": "name", "type": "string", "required": true},
        {"name": "email", "type": "string", "required": false},
        {"name": "registration_date", "type": "datetime", "required": true},
        {"name": "level", "type": "enum", "values": ["beginner", "intermediate", "advanced"], "required": false},
        {"name": "progress", "type": "float", "required": false},
        {"name": "created_at", "type": "datetime", "required": true},
        {"name": "updated_at", "type": "datetime", "required": true}
      ],
      "indexes": [
        {"type": "unique", "properties": ["id"]},
        {"type": "unique", "properties": ["email"]},
        {"type": "btree", "properties": ["level"]},
        {"type": "btree", "properties": ["progress"]}
      ]
    },
    {
      "name": "Submission",
      "properties": [
        {"name": "id", "type": "string", "required": true},
        {"name": "assignment_id", "type": "string", "required": true},
        {"name": "student_id", "type": "string", "required": true},
        {"name": "content", "type": "text", "required": true},
        {"name": "status", "type": "enum", "values": ["pending", "accepted", "rejected"], "required": false},
        {"name": "submitted_at", "type": "datetime", "required": true},
        {"name": "score", "type": "float", "required": false},
        {"name": "feedback", "type": "text", "required": false},
        {"name": "checked_at", "type": "datetime", "required": false},
        {"name": "imageUrls", "type": "array", "items": {"type": "string"}, "required": false},
        {"name": "fileUrls", "type": "array", "items": {"type": "string"}, "required": false}
      ],
      "indexes": [
        {"type": "unique", "properties": ["id"]},
        {"type": "btree", "properties": ["assignment_id"]},
        {"type": "btree", "properties": ["student_id"]},
        {"type": "btree", "properties": ["status"]},
        {"type": "btree", "properties": ["submitted_at"]}
      ]
    },
    {
      "name": "Concept",
      "properties": [
        {"name": "id", "type": "string", "required": true},
        {"name": "name", "type": "string", "required": true},
        {"name": "description", "type": "text", "required": true},
        {"name": "category", "type": "enum", "values": ["tool", "platform", "technique", "concept", "other"], "required": false},
        {"name": "difficulty", "type": "enum", "values": ["beginner", "intermediate", "advanced"], "required": false},
        {"name": "prerequisites", "type": "array", "items": {"type": "string"}, "required": false},
        {"name": "created_at", "type": "datetime", "required": true},
        {"name": "updated_at", "type": "datetime", "required": true}
      ],
      "indexes": [
        {"type": "unique", "properties": ["id"]},
        {"type": "unique", "properties": ["name"]},
        {"type": "btree", "properties": ["category"]},
        {"type": "btree", "properties": ["difficulty"]},
        {"type": "fulltext", "properties": ["name", "description"]}
      ]
    },
    {
      "name": "Resource",
      "properties": [
        {"name": "id", "type": "string", "required": true},
        {"name": "type", "type": "enum", "values": ["video", "document", "image", "link", "tool"], "required": true},
        {"name": "url", "type": "string", "required": true},
        {"name": "title", "type": "string", "required": true},
        {"name": "description", "type": "text", "required": false},
        {"name": "format", "type": "enum", "values": ["mp4", "pdf", "jpg", "png", "html", "other"], "required": false},
        {"name": "created_at", "type": "datetime", "required": true},
        {"name": "updated_at", "type": "datetime", "required": true}
      ],
      "indexes": [
        {"type": "unique", "properties": ["id"]},
        {"type": "btree", "properties": ["type"]},
        {"type": "btree", "properties": ["format"]}
      ]
    }
  ],
  "relations": [
    {
      "name": "CONTAINS",
      "from": "Lesson",
      "to": "Assignment",
      "properties": [
        {"name": "order", "type": "integer", "required": false},
        {"name": "required", "type": "boolean", "required": false}
      ]
    },
    {
      "name": "STUDIES",
      "from": "Student",
      "to": "Lesson",
      "properties": [
        {"name": "progress", "type": "float", "required": false},
        {"name": "started_at", "type": "datetime", "required": false},
        {"name": "completed_at", "type": "datetime", "required": false}
      ]
    },
    {
      "name": "SUBMITS",
      "from": "Student",
      "to": "Assignment",
      "properties": [
        {"name": "submission_id", "type": "string", "required": true},
        {"name": "attempts", "type": "integer", "required": false},
        {"name": "time_spent", "type": "integer", "required": false}
      ]
    },
    {
      "name": "EVALUATES",
      "from": "Submission",
      "to": "Concept",
      "properties": [
        {"name": "mastery_level", "type": "float", "required": false},
        {"name": "evidence", "type": "text", "required": false}
      ]
    },
    {
      "name": "REQUIRES",
      "from": "Concept",
      "to": "Concept",
      "properties": [
        {"name": "strength", "type": "float", "required": false},
        {"name": "description", "type": "text", "required": false}
      ]
    },
    {
      "name": "USES",
      "from": "Lesson",
      "to": "Resource",
      "properties": [
        {"name": "purpose", "type": "enum", "values": ["required", "optional", "reference", "example"], "required": false},
        {"name": "importance", "type": "integer", "required": false}
      ]
    },
    {
      "name": "TEACHES",
      "from": "Lesson",
      "to": "Concept",
      "properties": [
        {"name": "depth", "type": "integer", "required": false},
        {"name": "method", "type": "enum", "values": ["theory", "practice", "example", "demonstration"], "required": false}
      ]
    }
  ]
}
```

## Правила вывода в KGDSL формате

### student-readiness.kgdsl
```kgdsl
# Правило проверки готовности студента к заданию
RULE StudentReadiness {
  DESCRIPTION "Check if student is ready for assignment based on completed lessons and concept mastery"
  
  # Условие: студент изучил необходимые уроки
  WHEN (
    student:Student -[STUDIES]-> lesson:Lesson
    AND lesson.progress >= 0.8
    AND lesson -[CONTAINS]-> assignment:Assignment
    AND assignment.id = $assignment_id
  )
  
  # Условие: студент освоил необходимые концепции
  AND (
    student:Student -[SUBMITS]-> submission:Submission
    AND submission.status = 'accepted'
    AND submission -[EVALUATES]-> concept:Concept
    AND concept -[REQUIRES*]-> required_concept:Concept
    AND assignment -[REQUIRES]-> required_concept
  )
  
  # Вывод: студент готов к заданию
  INFER (
    student:Student -[READY_FOR]-> assignment:Assignment
    AND assignment.difficulty <= student.level
  )
  
  CONFIDENCE 0.85
}
```

### assignment-difficulty.kgdsl
```kgdsl
# Правило соответствия сложности задания уровню студента
RULE AssignmentDifficulty {
  DESCRIPTION "Match assignment difficulty with student level and progress"
  
  # Условие: студент и задание
  WHEN (
    student:Student
    AND assignment:Assignment
    AND assignment.id = $assignment_id
  )
  
  # Условие: проверка уровня студента
  AND (
    (student.level = 'beginner' AND assignment.difficulty IN ['beginner'])
    OR (student.level = 'intermediate' AND assignment.difficulty IN ['beginner', 'intermediate'])
    OR (student.level = 'advanced' AND assignment.difficulty IN ['beginner', 'intermediate', 'advanced'])
  )
  
  # Вывод: задание подходит студенту
  INFER (
    student:Student -[SUITABLE_FOR]-> assignment:Assignment
  )
  
  CONFIDENCE 0.9
}
```

### concept-prerequisites.kgdsl
```kgdsl
# Правило проверки предварительных условий для концепций
RULE ConceptPrerequisites {
  DESCRIPTION "Validate concept prerequisites for learning path"
  
  # Условие: концепция и ее предварительные условия
  WHEN (
    concept:Concept
    AND concept -[REQUIRES]-> prerequisite:Concept
    AND student:Student -[STUDIES]-> lesson:Lesson
    AND lesson -[TEACHES]-> prerequisite
    AND lesson.progress >= 0.8
  )
  
  # Вывод: студент готов изучить концепцию
  INFER (
    student:Student -[READY_TO_LEARN]-> concept:Concept
  )
  
  CONFIDENCE 0.8
}
```

## Скрипты для запуска и управления

### start-openspg.sh
```bash
#!/bin/bash

# Скрипт для запуска OpenSPG для образовательной доменной области

echo "Запуск OpenSPG для образовательной доменной области..."

# Переход в директорию с конфигурацией
cd "$(dirname "$0")"

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
    echo "Ошибка: Docker не установлен"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "Ошибка: Docker Compose не установлен"
    exit 1
fi

# Создание необходимых директорий
mkdir -p schema rules init/mysql init/neo4j

# Запуск контейнеров
echo "Запуск контейнеров..."
docker-compose -f docker-compose-education.yml up -d

# Ожидание запуска сервисов
echo "Ожидание запуска сервисов..."
sleep 30

# Проверка состояния сервисов
echo "Проверка состояния сервисов..."
docker-compose -f docker-compose-education.yml ps

# Загрузка схемы в OpenSPG
echo "Загрузка схемы в OpenSPG..."
curl -X POST http://localhost:8887/api/v1/schema/load \
  -H "Content-Type: application/json" \
  -d @schema/education-schema.json

# Загрузка правил вывода
echo "Загрузка правил вывода..."
for rule in rules/*.kgdsl; do
    if [ -f "$rule" ]; then
        echo "Загрузка правила: $rule"
        curl -X POST http://localhost:8887/api/v1/rules/load \
          -H "Content-Type: text/plain" \
          --data-binary @"$rule"
    fi
done

echo "OpenSPG для образовательной доменной области успешно запущен!"
echo "Доступ к веб-интерфейсу: http://localhost:8888"
echo "Доступ к Neo4j: http://localhost:7474 (neo4j/neo4j@openspg)"
echo "Доступ к MinIO: http://localhost:9001 (minioadmin/minioadmin)"
```

### stop-openspg.sh
```bash
#!/bin/bash

# Скрипт для остановки OpenSPG

echo "Остановка OpenSPG..."

cd "$(dirname "$0")"

docker-compose -f docker-compose-education.yml down

echo "OpenSPG остановлен"
```

### reset-openspg.sh
```bash
#!/bin/bash

# Скрипт для сброса OpenSPG

echo "Сброс OpenSPG..."

cd "$(dirname "$0")"

# Остановка контейнеров
docker-compose -f docker-compose-education.yml down

# Удаление томов данных
docker volume rm rag-system_mysql_data rag-system_neo4j_data rag-system_minio_data 2>/dev/null

# Запуск с нуля
docker-compose -f docker-compose-education.yml up -d

echo "OpenSPG сброшен и запущен с нуля"
```

## Интеграция с GetcourseAgent

### Переменные окружения в .env
```env
# OpenSPG Configuration
OPENSPG_SERVER_URL=http://localhost:8887
OPENSPG_WEB_URL=http://localhost:8888
OPENSPG_MYSQL_HOST=localhost
OPENSPG_MYSQL_PORT=3306
OPENSPG_MYSQL_DATABASE=openspg_education
OPENSPG_MYSQL_USERNAME=openspg
OPENSPG_MYSQL_PASSWORD=openspg@123
OPENSPG_NEO4J_HOST=localhost
OPENSPG_NEO4J_PORT=7687
OPENSPG_NEO4J_USERNAME=neo4j
OPENSPG_NEO4J_PASSWORD=neo4j@openspg
OPENSPG_MINIO_HOST=localhost
OPENSPG_MINIO_PORT=9000
OPENSPG_MINIO_ACCESS_KEY=minioadmin
OPENSPG_MINIO_SECRET_KEY=minioadmin
OPENSPG_MINIO_BUCKET=openspg-education
```

## Мониторинг и логирование

### docker-compose.monitoring.yml
```yaml
version: '3.8'

services:
  # Prometheus для мониторинга
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus-education
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    networks:
      - openspg-network
    restart: unless-stopped

  # Grafana для визуализации
  grafana:
    image: grafana/grafana:latest
    container_name: grafana-education
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources
    networks:
      - openspg-network
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:

networks:
  openspg-network:
    external: true
```

## Тестирование конфигурации

### test-openspg-connection.js
```javascript
// Тестирование соединения с OpenSPG
const axios = require('axios');

async function testOpenSPGConnection() {
    try {
        // Проверка здоровья сервера
        const healthResponse = await axios.get('http://localhost:8887/api/v1/health');
        console.log('✅ OpenSPG Server Health:', healthResponse.data);

        // Проверка загрузки схемы
        const schemaResponse = await axios.get('http://localhost:8887/api/v1/schema');
        console.log('✅ Schema loaded:', schemaResponse.data);

        // Проверка правил вывода
        const rulesResponse = await axios.get('http://localhost:8887/api/v1/rules');
        console.log('✅ Rules loaded:', rulesResponse.data);

        console.log('🎉 OpenSPG успешно настроен и готов к работе!');
    } catch (error) {
        console.error('❌ Ошибка при проверке OpenSPG:', error.message);
        process.exit(1);
    }
}

testOpenSPGConnection();
```

## Следующие шаги

1. **Создать структуру директорий**: Выполнить mkdir для всех необходимых директорий
2. **Создать файлы конфигурации**: Создать docker-compose-education.yml и все файлы инициализации
3. **Запустить контейнеры**: Использовать start-openspg.sh для запуска
4. **Проверить работоспособность**: Использовать test-openspg-connection.js
5. **Интегрировать с GetcourseAgent**: Создать клиент для работы с OpenSPG

## Преимущества данной конфигурации

1. **Изолированность**: Все сервисы в отдельных контейнерах
2. **Масштабируемость**: Легко масштабировать отдельные компоненты
3. **Мониторинг**: Встроенные инструменты мониторинга
4. **Резервное копирование**: Легко бэкапить тома данных
5. **Разработка**: Быстрый сброс и перезапуск для разработки
6. **Продакшн**: Готовая конфигурация для продакшн-окружения