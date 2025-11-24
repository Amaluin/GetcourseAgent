# 🧠 GraphRAG система для GetCourse Agent

## 📋 Обзор

Система для создания базы знаний на основе:
1. **Контента уроков** - векторизация содержимого уроков
2. **Принятых работ студентов** - анализ успешных решений
3. **GraphRAG** - связывание уроков, заданий и решений в граф знаний

## 🎯 Цели

### Цель 1: Кэширование контекста уроков
- При первом анализе урока сохранять его содержимое в векторную БД
- При повторном обращении к уроку брать данные из БД (экономия времени и токенов)
- Обновлять кэш при изменении урока

### Цель 2: База знаний успешных решений
- Собирать принятые работы студентов по каждому уроку
- Векторизовать успешные решения
- Использовать для подсказок текущему студенту

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                     GetCourse Agent                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   RAG Orchestrator                           │
│  - Проверка кэша урока                                       │
│  - Поиск похожих работ                                       │
│  - Генерация рекомендаций                                    │
└─────────┬───────────────────────────┬───────────────────────┘
          │                           │
          ▼                           ▼
┌─────────────────────┐     ┌─────────────────────────────────┐
│   Supabase Vector   │     │      Graph Database             │
│   (pgvector)        │     │      (Neo4j / в памяти)         │
│                     │     │                                 │
│  - Embeddings       │     │  - Урок → Задание → Решение    │
│  - Similarity       │     │  - Связи между концепциями      │
│  - Metadata         │     │  - Граф зависимостей            │
└─────────────────────┘     └─────────────────────────────────┘
```

## 📊 Структура данных

### 1. Таблица: `lessons` (Уроки)
```sql
CREATE TABLE lessons (
  id TEXT PRIMARY KEY,                    -- lessonId из GetCourse
  title TEXT NOT NULL,
  url TEXT,
  content_text TEXT,                      -- Полный текст урока
  summary TEXT,                           -- AI-саммари
  embedding VECTOR(1536),                 -- OpenAI ada-002 embedding
  video_urls TEXT[],
  image_urls TEXT[],
  instructions TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INTEGER DEFAULT 1               -- Для отслеживания изменений
);
```

### 2. Таблица: `assignments` (Задания)
```sql
CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  lesson_id TEXT REFERENCES lessons(id),
  title TEXT,
  description TEXT,                       -- Текст задания
  ideal_answer TEXT,                      -- Идеальный ответ
  embedding VECTOR(1536),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Таблица: `student_submissions` (Работы студентов)
```sql
CREATE TABLE student_submissions (
  id TEXT PRIMARY KEY,                    -- submissionId из GetCourse
  assignment_id TEXT REFERENCES assignments(id),
  lesson_id TEXT REFERENCES lessons(id),
  student_name TEXT,
  submission_text TEXT,
  image_urls TEXT[],
  file_urls TEXT[],
  status TEXT,                            -- 'accepted' | 'rejected'
  ai_comment TEXT,
  embedding VECTOR(1536),
  similarity_score FLOAT,                 -- Похожесть на идеальный ответ
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4. Таблица: `lesson_concepts` (Концепции из уроков)
```sql
CREATE TABLE lesson_concepts (
  id SERIAL PRIMARY KEY,
  lesson_id TEXT REFERENCES lessons(id),
  concept_name TEXT,                      -- Например: "GitHub Actions", "Docker"
  description TEXT,
  embedding VECTOR(1536),
  mentioned_count INTEGER DEFAULT 1
);
```

### 5. Граф связей (Graph)
```
(Lesson) -[CONTAINS]-> (Assignment)
(Assignment) -[HAS_SUBMISSION]-> (StudentSubmission)
(Lesson) -[TEACHES]-> (Concept)
(StudentSubmission) -[USES]-> (Concept)
(StudentSubmission) -[SIMILAR_TO]-> (StudentSubmission)
```

## 🔄 Workflow

### Workflow 1: Анализ урока (с кэшированием)

```
1. Получить lessonId
2. Проверить в БД: SELECT * FROM lessons WHERE id = lessonId
3. Если найден:
   a. Проверить версию (по дате обновления или хэшу)
   b. Если актуален → вернуть из кэша
   c. Если устарел → перейти к шагу 4
4. Если не найден:
   a. Парсить урок (как сейчас)
   b. Создать embedding через OpenAI
   c. Сохранить в БД
   d. Вернуть данные
```

### Workflow 2: Проверка работы студента (с RAG)

```
1. Получить submission от студента
2. Получить lessonId и assignmentId
3. Загрузить контекст урока из БД (кэш)
4. Найти похожие принятые работы:
   - Векторный поиск по embedding студенческой работы
   - Фильтр: assignment_id = текущий, status = 'accepted'
   - TOP 5 самых похожих работ
5. Построить промпт для AI:
   - Контекст урока (из кэша)
   - Текст задания
   - Идеальный ответ
   - 5 примеров успешных работ других студентов
   - Текущая работа студента
6. AI анализирует с учетом всего контекста
7. Сохранить результат:
   - Если принято → добавить в базу успешных решений
   - Обновить граф связей
```

### Workflow 3: Сбор базы знаний (первичная загрузка)

```
1. Выбрать урок для анализа
2. Получить ВСЕ проверенные работы по этому уроку:
   - Через API GetCourse или парсинг
3. Отфильтровать только принятые (status = 'accepted')
4. Для каждой работы:
   a. Создать embedding
   b. Вычислить similarity с идеальным ответом
   c. Сохранить в БД
5. Построить граф:
   - Связать урок → задание → работы
   - Извлечь концепции (через AI)
   - Связать работы с концепциями
```

## 🛠️ Технологический стек

### Векторная БД: Supabase (PostgreSQL + pgvector)
```typescript
// Установка
npm install @supabase/supabase-js

// Подключение
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)
```

### Embeddings: OpenAI API
```typescript
import OpenAI from 'openai'

async function createEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  })
  return response.data[0].embedding
}
```

### Graph (опционально): Neo4j или in-memory граф
```typescript
// Вариант 1: Neo4j (мощный, но требует сервер)
npm install neo4j-driver

// Вариант 2: In-memory граф (простой, для начала)
// Используем Map<string, Node> и связи в памяти
```

## 📝 Пошаговый план реализации

### Фаза 1: Инфраструктура (1-2 дня)
- [ ] Создать проект в Supabase
- [ ] Настроить pgvector extension
- [ ] Создать таблицы (lessons, assignments, student_submissions)
- [ ] Создать индексы для векторного поиска
- [ ] Настроить .env с SUPABASE_URL и SUPABASE_KEY

### Фаза 2: Модуль векторизации (1 день)
- [ ] Создать `src/rag/embeddings.ts`
  - Функция createEmbedding(text)
  - Функция batchCreateEmbeddings(texts[])
  - Кэширование embeddings
- [ ] Создать `src/rag/supabase-client.ts`
  - Подключение к Supabase
  - CRUD операции для lessons, assignments, submissions

### Фаза 3: Кэширование уроков (2 дня)
- [ ] Создать `src/rag/lesson-cache.ts`
  - getLessonFromCache(lessonId)
  - saveLessonToCache(lessonData)
  - checkLessonVersion(lessonId)
- [ ] Интегрировать в `src/lesson-parser.ts`
  - Проверка кэша перед парсингом
  - Сохранение после парсинга
- [ ] Тестирование на 5-10 уроках

### Фаза 4: Векторный поиск похожих работ (2 дня)
- [ ] Создать `src/rag/similarity-search.ts`
  - findSimilarSubmissions(submissionText, assignmentId, limit)
  - calculateSimilarity(embedding1, embedding2)
- [ ] Создать SQL функции в Supabase:
  ```sql
  CREATE FUNCTION match_submissions(
    query_embedding VECTOR(1536),
    match_threshold FLOAT,
    match_count INT
  )
  RETURNS TABLE (...)
  ```

### Фаза 5: Интеграция RAG в проверку (2 дня)
- [ ] Обновить `src/ai.ts`
  - Добавить загрузку контекста из кэша
  - Добавить поиск похожих работ
  - Расширить промпт примерами успешных решений
- [ ] Тестирование на реальных работах
- [ ] Сравнение качества с/без RAG

### Фаза 6: Сбор базы знаний (3 дня)
- [ ] Создать `src/rag/knowledge-builder.ts`
  - collectAcceptedSubmissions(lessonId)
  - buildKnowledgeBase(submissions[])
  - extractConcepts(lessonContent)
- [ ] Создать скрипт для первичной загрузки:
  - Выбрать 10 популярных уроков
  - Собрать все принятые работы
  - Векторизовать и сохранить
- [ ] Создать дашборд для мониторинга:
  - Сколько уроков в кэше
  - Сколько работ в базе
  - Статистика по урокам

### Фаза 7: GraphRAG (опционально, 3-4 дня)
- [ ] Создать граф связей
- [ ] Извлечение концепций через AI
- [ ] Связывание уроков → концепции → работы
- [ ] Граф-запросы для рекомендаций

### Фаза 8: Оптимизация и мониторинг (2 дня)
- [ ] Добавить логирование использования кэша
- [ ] Метрики: cache hit rate, similarity scores
- [ ] Автоматическое обновление устаревших кэшей
- [ ] Очистка старых данных

## 📈 Ожидаемые результаты

### Метрики успеха:
1. **Скорость**: Проверка работы ускорится на 50-70% (за счет кэша урока)
2. **Качество**: Точность проверки увеличится на 20-30% (за счет примеров)
3. **Токены**: Экономия 40-60% токенов OpenAI (кэш + меньше повторного парсинга)
4. **Консистентность**: Одинаковые работы получают одинаковые оценки

### Примеры использования:

#### До RAG:
```
AI видит:
- Текст урока (парсится каждый раз заново)
- Идеальный ответ
- Работу студента

Время: 30-40 секунд на проверку
Токены: ~8000 на проверку
```

#### После RAG:
```
AI видит:
- Саммари урока (из кэша, 500 токенов вместо 5000)
- Идеальный ответ
- 5 примеров успешных работ других студентов
- Работу текущего студента

Время: 10-15 секунд на проверку
Токены: ~3000 на проверку
Качество: выше, т.к. есть контекст успешных решений
```

## 🔐 Безопасность и приватность

### Важно:
1. **Анонимизация**: Не храним полные имена студентов (только ID или хэш)
2. **Фильтрация**: Не векторизуем персональные данные (email, телефоны)
3. **Доступ**: Только владелец курса имеет доступ к базе знаний
4. **Удаление**: Возможность удалить данные студента по запросу

## 🚀 Быстрый старт (после реализации)

```bash
# 1. Настроить Supabase
npm run setup-supabase

# 2. Создать таблицы
npm run migrate-db

# 3. Собрать базу знаний для урока
npm run build-knowledge -- --lesson-id=345069174

# 4. Запустить агента с RAG
npm run start:rag
```

## 📚 Дополнительные материалы

- [Supabase Vector Documentation](https://supabase.com/docs/guides/ai)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [GraphRAG Paper](https://arxiv.org/abs/2404.16130)
- [pgvector GitHub](https://github.com/pgvector/pgvector)

---

**Статус**: 📋 План готов, ожидает реализации
**Приоритет**: 🔥 Высокий (значительное улучшение качества и скорости)
**Сложность**: ⭐⭐⭐⭐ (4/5)




