# KAG (Knowledge Augmented Generation) для GetcourseAgent

Система KAG на основе OpenSPG для интеллектуальной проверки домашних заданий с использованием графа знаний.

## 📋 Содержание

- [Быстрый старт](#-быстрый-старт)
- [Архитектура](#-архитектура)
- [Установка](#-установка)
- [Использование](#-использование)
- [API](#-api)
- [Тестирование](#-тестирование)
- [Troubleshooting](#-troubleshooting)

## 🚀 Быстрый старт

### 1. Запуск Docker контейнеров

```bash
cd src/kag/docker
chmod +x scripts/*.sh
./scripts/start-openspg.sh
```

### 2. Проверка статуса

```bash
./scripts/status-openspg.sh
```

### 3. Запуск тестов

```bash
cd ../..
npm install
npx ts-node src/kag/test-kag-integration.ts
```

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    GetcourseAgent                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  Lesson Parser   │────────>│ Education KAG    │         │
│  │                  │         │    Adapter       │         │
│  └──────────────────┘         └────────┬─────────┘         │
│                                         │                    │
│  ┌──────────────────┐                  │                    │
│  │  AI Checker      │<─────────────────┘                    │
│  │                  │                                        │
│  └──────────────────┘                                        │
│                                                              │
└──────────────────────────────────┬───────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │      KAG Client             │
                    └──────────────┬──────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
┌───────▼────────┐      ┌─────────▼────────┐      ┌─────────▼────────┐
│  OpenSPG       │      │     Neo4j        │      │     MySQL        │
│  Server        │      │  Graph Database  │      │   Metadata DB    │
│  (API/Rules)   │      │  (Knowledge)     │      │   (Schema/Rules) │
└────────────────┘      └──────────────────┘      └──────────────────┘
```

## 📦 Установка

### Требования

- Node.js 18+
- Docker & Docker Compose
- 8GB RAM минимум
- 20GB свободного места на диске

### Шаги установки

1. **Клонирование репозитория** (если еще не сделано)

```bash
git clone <your-repo>
cd GetcourseAgent
```

2. **Установка зависимостей**

```bash
npm install
```

3. **Настройка переменных окружения**

Создайте файл `.env` в корне проекта:

```env
# OpenSPG Configuration
OPENSPG_SERVER_URL=http://localhost:8887
OPENSPG_NEO4J_HOST=localhost
OPENSPG_NEO4J_PORT=7688
OPENSPG_NEO4J_USERNAME=neo4j
OPENSPG_NEO4J_PASSWORD=neo4j@openspg

# KAG Settings
KAG_LOG_LEVEL=info
KAG_CACHE_ENABLED=true
OPENSPG_REASONING_ENABLED=true
```

4. **Запуск Docker контейнеров**

```bash
cd src/kag/docker
./scripts/start-openspg.sh
```

## 💻 Использование

### Базовый пример

```typescript
import { EducationKAGAdapterImpl } from './src/kag/client/EducationKAGAdapter';

// Инициализация
const adapter = new EducationKAGAdapterImpl();
await adapter.initialize();

// Добавление урока
await adapter.addLesson({
  id: 'lesson_001',
  title: 'Введение в TypeScript',
  content: 'Полный текст урока...',
  difficulty: 'beginner'
});

// Добавление студента
await adapter.addStudent({
  id: 'student_001',
  name: 'Иван Иванов',
  level: 'beginner'
});

// Добавление работы
await adapter.addSubmission({
  id: 'sub_001',
  student_id: 'student_001',
  assignment_id: 'assign_001',
  content: 'Моя работа...'
});

// Получение контекста для проверки
const context = await adapter.getContextForSubmission('sub_001');

// Закрытие соединения
await adapter.close();
```

### Интеграция с основным workflow

```typescript
// В src/index.ts
import { EducationKAGAdapterImpl } from './kag/client/EducationKAGAdapter';

const kagAdapter = new EducationKAGAdapterImpl();
await kagAdapter.initialize();

// При парсинге урока
await kagAdapter.addLesson({
  id: lessonId,
  title: lessonTitle,
  content: lessonContent,
  difficulty: 'intermediate'
});

// При проверке работы
const context = await kagAdapter.getContextForSubmission(submissionId);
const aiResponse = await checkHomeworkWithContext(submission, context);
```

## 📚 API

### EducationKAGAdapter

#### Lesson Operations

```typescript
// Добавить урок
await adapter.addLesson(lesson: LessonInput): Promise<boolean>

// Получить урок
await adapter.getLesson(id: string): Promise<Lesson | null>

// Обновить урок
await adapter.updateLesson(id: string, updates: Partial<Lesson>): Promise<boolean>

// Найти уроки
await adapter.findLessons(query: string, options?: SearchOptions): Promise<Lesson[]>
```

#### Student Operations

```typescript
// Добавить студента
await adapter.addStudent(student: StudentInput): Promise<boolean>

// Получить студента
await adapter.getStudent(id: string): Promise<Student | null>

// Обновить студента
await adapter.updateStudent(id: string, updates: Partial<Student>): Promise<boolean>
```

#### Submission Operations

```typescript
// Добавить работу
await adapter.addSubmission(submission: SubmissionInput): Promise<boolean>

// Получить работу
await adapter.getSubmission(id: string): Promise<Submission | null>

// Обновить работу
await adapter.updateSubmission(id: string, updates: Partial<Submission>): Promise<boolean>
```

#### Context & Recommendations

```typescript
// Получить контекст для проверки работы
await adapter.getContextForSubmission(submissionId: string): Promise<SubmissionContext>

// Получить рекомендации для студента
await adapter.getRecommendationsForStudent(studentId: string): Promise<KAGRecommendation[]>
```

## 🧪 Тестирование

### Запуск тестов

```bash
# Базовый тест интеграции
npx ts-node src/kag/test-kag-integration.ts

# С подробным логированием
KAG_LOG_LEVEL=debug npx ts-node src/kag/test-kag-integration.ts
```

### Ожидаемый результат

```
🧪 Testing KAG Integration...

📋 Step 1: Initialization
✅ Adapter initialized

📋 Step 2: Adding a test lesson
✅ Lesson added: Введение в GitHub Actions

📋 Step 3: Retrieving the lesson
✅ Lesson retrieved: Введение в GitHub Actions

...

🎉 All basic tests passed!
```

## 🐛 Troubleshooting

### OpenSPG Server не запускается

```bash
# Проверьте логи
docker logs openspg-education -f

# Перезапустите
cd src/kag/docker
./scripts/stop-openspg.sh
./scripts/start-openspg.sh
```

### Ошибка подключения к Neo4j

```bash
# Проверьте статус
docker exec neo4j-education cypher-shell -u neo4j -p neo4j@openspg "RETURN 1"

# Если не работает, перезапустите
docker restart neo4j-education
```

### Тесты падают с ошибкой

1. **Проверьте, что все сервисы запущены**:
   ```bash
   cd src/kag/docker
   ./scripts/status-openspg.sh
   ```

2. **Проверьте переменные окружения**:
   ```bash
   cat .env
   ```

3. **Очистите данные и запустите заново**:
   ```bash
   ./scripts/reset-openspg.sh
   ./scripts/start-openspg.sh
   ```

### Низкая производительность

1. Увеличьте память для Neo4j в `docker-compose-education.yml`:
   ```yaml
   NEO4J_dbms_memory_heap_max__size=4G
   ```

2. Включите кэширование:
   ```env
   KAG_CACHE_ENABLED=true
   KAG_CACHE_TTL=3600
   ```

## 📖 Дополнительная документация

- [Docker Setup](./docker/README.md) - Подробная документация по Docker
- [Architecture Analysis](./KAG_ARCHITECTURE_ANALYSIS.md) - Анализ архитектуры
- [Implementation Summary](./KAG_IMPLEMENTATION_SUMMARY.md) - План реализации
- [Integration Guide](./integration/) - Руководства по интеграции

## 🤝 Вклад

При добавлении новых функций:

1. Обновите типы в `types/education-entities.ts`
2. Добавьте методы в `EducationKAGAdapter`
3. Напишите тесты
4. Обновите документацию

## 📝 Лицензия

MIT

## 🔗 Полезные ссылки

- [OpenSPG Documentation](https://openspg.yuque.com/)
- [Neo4j Cypher Manual](https://neo4j.com/docs/cypher-manual/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

