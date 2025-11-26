# 🏗️ Архитектура RAG системы

## 📐 Общая схема

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GetCourse Platform                          │
│  - Уроки                                                            │
│  - Задания                                                          │
│  - Работы студентов                                                 │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      │ Playwright (парсинг)
                      ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      GetCourse Agent (main)                         │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐          │
│  │  browser.ts  │   │   auth.ts    │   │  parser.ts   │          │
│  │  (Playwright)│   │  (Login)     │   │  (Submissions)│          │
│  └──────────────┘   └──────────────┘   └──────────────┘          │
│                                                                     │
│  ┌──────────────────────────────────────────────────────┐         │
│  │           lesson-parser.ts                           │         │
│  │  - Парсинг контента урока                            │         │
│  │  - Раскрытие скрытых блоков                          │         │
│  │  - Извлечение видео, изображений, файлов            │         │
│  └──────────────────────────────────────────────────────┘         │
│                                                                     │
│  ┌──────────────────────────────────────────────────────┐         │
│  │                    ai.ts                             │         │
│  │  - Проверка домашних заданий                         │         │
│  │  - Генерация комментариев                            │         │
│  │  - Вердикт (accept/reject)                           │         │
│  └──────────────────────────────────────────────────────┘         │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      │ Интеграция с RAG
                      ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      RAG Orchestrator                               │
│                   (rag-integration.ts)                              │
│                                                                     │
│  Workflow:                                                          │
│  1. Проверить кэш урока                                             │
│  2. Если нет → парсить → векторизовать → сохранить                  │
│  3. Создать embedding работы студента                               │
│  4. Найти похожие принятые работы (vector search)                   │
│  5. Построить расширенный промпт с контекстом                       │
│  6. Отправить в AI                                                  │
│  7. Сохранить результат в БД                                        │
└─────────┬───────────────────────────┬───────────────────────────────┘
          │                           │
          ↓                           ↓
┌─────────────────────┐     ┌─────────────────────────────────────────┐
│  Embeddings Module  │     │      Supabase Client                    │
│  (embeddings.ts)    │     │   (supabase-client.ts)                  │
│                     │     │                                         │
│  - createEmbedding()│     │  - getLessonFromCache()                 │
│  - batchEmbeddings()│     │  - saveLessonToCache()                  │
│  - cosineSimilarity()│    │  - findSimilarSubmissions()             │
│  - contentHash()    │     │  - saveSubmission()                     │
└──────────┬──────────┘     │  - getAssignment()                      │
           │                │  - getLessonStats()                     │
           │                └────────────┬────────────────────────────┘
           │                             │
           │ OpenAI API                  │ PostgreSQL + pgvector
           ↓                             ↓
┌─────────────────────┐     ┌─────────────────────────────────────────┐
│   OpenAI Embeddings │     │         Supabase (PostgreSQL)           │
│                     │     │                                         │
│  text-embedding-    │     │  ┌────────────────────────────────┐    │
│  ada-002            │     │  │  lessons (уроки)               │    │
│                     │     │  │  - id, title, content_text     │    │
│  Input: текст       │     │  │  - embedding VECTOR(1536)      │    │
│  Output: [1536]     │     │  │  - summary, video_urls, etc    │    │
│                     │     │  └────────────────────────────────┘    │
└─────────────────────┘     │                                         │
                            │  ┌────────────────────────────────┐    │
                            │  │  assignments (задания)         │    │
                            │  │  - id, lesson_id, description  │    │
                            │  │  - embedding VECTOR(1536)      │    │
                            │  │  - ideal_answer                │    │
                            │  └────────────────────────────────┘    │
                            │                                         │
                            │  ┌────────────────────────────────┐    │
                            │  │  student_submissions (работы)  │    │
                            │  │  - id, assignment_id, text     │    │
                            │  │  - embedding VECTOR(1536)      │    │
                            │  │  - status, ai_comment          │    │
                            │  │  - similarity_to_ideal         │    │
                            │  └────────────────────────────────┘    │
                            │                                         │
                            │  ┌────────────────────────────────┐    │
                            │  │  lesson_concepts (концепции)   │    │
                            │  │  - id, concept_name, category  │    │
                            │  │  - embedding VECTOR(1536)      │    │
                            │  └────────────────────────────────┘    │
                            │                                         │
                            │  ┌────────────────────────────────┐    │
                            │  │  Vector Search Functions       │    │
                            │  │  - match_lessons()             │    │
                            │  │  - match_accepted_submissions()│    │
                            │  │  - match_concepts()            │    │
                            │  └────────────────────────────────┘    │
                            └─────────────────────────────────────────┘
```

## 🔄 Поток данных

### 1. Первая проверка работы (холодный старт)

```
Студент сдает работу
        ↓
Agent получает submission
        ↓
RAG Orchestrator: getLessonFromCache(lessonId)
        ↓
Кэш пустой → парсим урок (lesson-parser.ts)
        ↓
Создаем embedding урока (OpenAI API)
        ↓
Сохраняем в Supabase (lessons table)
        ↓
Создаем embedding работы студента
        ↓
Ищем похожие работы (vector search) → пусто
        ↓
AI проверяет работу (без примеров)
        ↓
Сохраняем результат в Supabase (student_submissions)
```

**Время: ~33 секунды**
**Токены: ~8000**

### 2. Последующие проверки (горячий кэш)

```
Студент сдает работу
        ↓
Agent получает submission
        ↓
RAG Orchestrator: getLessonFromCache(lessonId)
        ↓
Кэш найден → берем из Supabase (0.5 сек)
        ↓
Создаем embedding работы студента
        ↓
Ищем похожие работы (vector search) → 5 примеров
        ↓
AI проверяет работу (с примерами успешных решений)
        ↓
Сохраняем результат в Supabase
```

**Время: ~11.5 секунд** ⚡
**Токены: ~3000** 💰

## 🧠 Векторный поиск (детально)

### Как работает pgvector

```sql
-- 1. Создаем индекс для быстрого поиска
CREATE INDEX submissions_embedding_idx 
ON student_submissions 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 2. Поиск похожих векторов
SELECT 
  id,
  submission_text,
  1 - (embedding <=> query_embedding) as similarity
FROM student_submissions
WHERE 
  assignment_id = 'assign-123'
  AND status = 'accepted'
  AND 1 - (embedding <=> query_embedding) > 0.7
ORDER BY embedding <=> query_embedding
LIMIT 5;
```

### Операторы расстояния

| Оператор | Метрика | Описание |
|----------|---------|----------|
| `<->` | L2 distance | Евклидово расстояние |
| `<#>` | Inner product | Скалярное произведение |
| `<=>` | Cosine distance | Косинусное расстояние (используем) |

### Почему cosine distance?

- **Инвариантность к длине**: Не важен размер текста
- **Семантическая схожесть**: Учитывает смысл, не слова
- **Стандарт для embeddings**: OpenAI рекомендует

## 📊 Структура данных

### Lesson (Урок)

```typescript
{
  id: "345069174",
  title: "Введение в GitHub Actions",
  contentText: "В этом уроке мы изучим...",
  summary: "Урок покрывает основы CI/CD...",
  embedding: [0.123, -0.456, ...], // 1536 чисел
  videoUrls: ["https://..."],
  imageUrls: ["https://..."],
  instructions: ["Шаг 1...", "Шаг 2..."],
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-15T00:00:00Z",
  version: 2
}
```

### Assignment (Задание)

```typescript
{
  id: "assign-123",
  lessonId: "345069174",
  title: "Настройка CI/CD",
  description: "Настройте GitHub Actions для...",
  idealAnswer: "Для настройки нужно создать...",
  embedding: [0.789, -0.234, ...],
  requirements: ["Создать workflow", "Добавить тесты"]
}
```

### StudentSubmission (Работа студента)

```typescript
{
  id: "sub-456",
  assignmentId: "assign-123",
  lessonId: "345069174",
  studentName: "Иван Петров",
  submissionText: "Я настроил GitHub Actions...",
  embedding: [0.456, -0.789, ...],
  status: "accepted",
  aiComment: "Отличная работа!",
  similarityToIdeal: 0.87, // 87% схожесть с идеалом
  createdAt: "2025-01-20T10:00:00Z"
}
```

## 🔍 Алгоритм поиска похожих работ

```python
def find_similar_submissions(query_embedding, assignment_id, threshold=0.7):
    # 1. Получаем все принятые работы по заданию
    submissions = db.query(
        "SELECT * FROM student_submissions "
        "WHERE assignment_id = ? AND status = 'accepted'",
        assignment_id
    )
    
    # 2. Вычисляем similarity для каждой
    results = []
    for submission in submissions:
        similarity = cosine_similarity(
            query_embedding, 
            submission.embedding
        )
        
        if similarity > threshold:
            results.append({
                'submission': submission,
                'similarity': similarity
            })
    
    # 3. Сортируем по убыванию similarity
    results.sort(key=lambda x: x['similarity'], reverse=True)
    
    # 4. Возвращаем топ-5
    return results[:5]
```

## 🎯 Оптимизации

### 1. Кэширование embeddings

```typescript
const embeddingCache = new Map<string, number[]>();

function getCachedEmbedding(text: string): number[] | null {
  const hash = createContentHash(text);
  return embeddingCache.get(hash) || null;
}

async function getOrCreateEmbedding(text: string): Promise<number[]> {
  const cached = getCachedEmbedding(text);
  if (cached) return cached;
  
  const embedding = await createEmbedding(text);
  embeddingCache.set(createContentHash(text), embedding);
  return embedding;
}
```

### 2. Батч-обработка

```typescript
// Вместо:
for (const text of texts) {
  const emb = await createEmbedding(text); // N запросов
}

// Используем:
const embeddings = await batchCreateEmbeddings(texts, 10); // N/10 запросов
```

### 3. Индексация

```sql
-- IVFFlat индекс для быстрого поиска
-- lists = sqrt(rows) оптимально
CREATE INDEX idx ON table 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Для больших таблиц (>100K строк)
WITH (lists = 1000);
```

### 4. Партиционирование

```sql
-- Разделяем таблицу по lesson_id для быстрого поиска
CREATE TABLE student_submissions (
  ...
) PARTITION BY LIST (lesson_id);

CREATE TABLE submissions_lesson_1 
PARTITION OF student_submissions 
FOR VALUES IN ('345069174');
```

## 📈 Масштабирование

### Текущая архитектура (Free tier)

- **База данных**: 500 MB
- **Bandwidth**: 5 GB/месяц
- **Embeddings**: ~1M токенов/месяц ($0.10)
- **Работ в БД**: ~1000

### Масштабирование на 10K работ

- **База данных**: ~5 GB (Pro plan)
- **Bandwidth**: ~50 GB/месяц
- **Embeddings**: ~10M токенов/месяц ($1.00)
- **Стоимость**: ~$25/месяц (Supabase Pro)

### Масштабирование на 100K работ

- **База данных**: ~50 GB (Team plan)
- **Bandwidth**: ~500 GB/месяц
- **Embeddings**: ~100M токенов/месяц ($10.00)
- **Стоимость**: ~$599/месяц (Supabase Team)

## 🔐 Безопасность

### Row Level Security (RLS)

```sql
-- Включаем RLS
ALTER TABLE student_submissions ENABLE ROW LEVEL SECURITY;

-- Политика: только аутентифицированные пользователи
CREATE POLICY "Authenticated users" 
ON student_submissions
FOR ALL TO authenticated 
USING (true);

-- Политика: только владелец курса
CREATE POLICY "Course owner" 
ON student_submissions
FOR ALL TO authenticated 
USING (
  auth.uid() IN (
    SELECT owner_id FROM courses 
    WHERE id = lesson_id
  )
);
```

### API Key Security

```typescript
// Используем service_role ключ только на сервере
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!, // Не публикуем!
  { auth: { persistSession: false } }
);

// Для клиента используем anon ключ
const supabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY! // Можно публиковать
);
```

## 🎨 Визуализация данных

### Граф связей (опционально)

```
        ┌─────────────┐
        │   Lesson    │
        │  "Git Flow" │
        └──────┬──────┘
               │
       ┌───────┴───────┐
       │               │
┌──────▼──────┐ ┌──────▼──────┐
│ Assignment  │ │   Concept   │
│ "Setup Git" │ │ "Git Branch"│
└──────┬──────┘ └──────┬──────┘
       │               │
   ┌───┴───┬───┬───┐   │
   │       │   │   │   │
┌──▼──┐ ┌─▼─┐ │   │   │
│Sub 1│ │S 2│ │...│   │
│✅   │ │✅ │ │   │   │
└─────┘ └───┘ └───┘   │
   │       │           │
   └───────┴───────────┘
```

## 🚀 Будущие улучшения

1. **GraphRAG**: Полноценный граф знаний с Neo4j
2. **Концепции**: Автоматическое извлечение ключевых концепций
3. **Рекомендации**: Персонализированные подсказки для студентов
4. **Аналитика**: Дашборд с метриками и трендами
5. **Multimodal**: Анализ изображений и видео в работах
6. **Real-time**: WebSocket для live обновлений

---

**Вопросы по архитектуре?** Читайте `README.md` или `SETUP_GUIDE.md`!





