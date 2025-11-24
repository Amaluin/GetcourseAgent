# 🚀 Пошаговая инструкция по настройке RAG системы

## Шаг 1: Создание проекта в Supabase

### 1.1. Регистрация
1. Перейдите на [supabase.com](https://supabase.com)
2. Нажмите "Start your project"
3. Войдите через GitHub (рекомендуется)

### 1.2. Создание проекта
1. Нажмите "New Project"
2. Заполните форму:
   - **Name**: `getcourse-rag` (или любое другое)
   - **Database Password**: Придумайте надежный пароль (сохраните!)
   - **Region**: Выберите ближайший регион (например, `Frankfurt` для России)
   - **Pricing Plan**: Выберите `Free` (достаточно для начала)
3. Нажмите "Create new project"
4. Подождите 1-2 минуты, пока проект создается

### 1.3. Получение ключей доступа
1. В боковом меню выберите **Settings** → **API**
2. Найдите и скопируйте:
   - **Project URL** (например: `https://abcdefgh.supabase.co`)
   - **anon public** ключ (начинается с `eyJ...`)
   - **service_role** ключ (для админских операций)

## Шаг 2: Настройка базы данных

### 2.1. Включение pgvector
1. В боковом меню выберите **Database** → **Extensions**
2. Найдите `vector` в списке
3. Нажмите кнопку **Enable** напротив `vector`
4. Подождите несколько секунд

### 2.2. Создание таблиц
1. В боковом меню выберите **SQL Editor**
2. Нажмите **New query**
3. Скопируйте содержимое файла `schema.sql` из этой папки
4. Вставьте в редактор
5. Нажмите **Run** (или `Ctrl+Enter`)
6. Дождитесь сообщения "Success. No rows returned"

### 2.3. Проверка таблиц
1. В боковом меню выберите **Table Editor**
2. Убедитесь, что созданы таблицы:
   - `lessons`
   - `assignments`
   - `student_submissions`
   - `lesson_concepts`
   - `submission_concepts`
   - `cache_stats`

## Шаг 3: Настройка проекта

### 3.1. Установка зависимостей
```bash
npm install @supabase/supabase-js
```

### 3.2. Настройка .env
1. Скопируйте `rag-system/env.example` в корень проекта как `.env`
2. Заполните переменные:

```bash
# Supabase (из шага 1.3)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# OpenAI (для embeddings)
OPENAI_API_KEY=sk-...

# RAG настройки
SIMILARITY_THRESHOLD=0.7
MAX_SIMILAR_SUBMISSIONS=5
ENABLE_CACHE=true
```

### 3.3. Проверка подключения
Создайте тестовый файл `test-supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

async function test() {
  const { data, error } = await supabase
    .from('lessons')
    .select('id')
    .limit(1);

  if (error) {
    console.error('❌ Ошибка:', error);
  } else {
    console.log('✅ Подключение успешно!');
  }
}

test();
```

Запустите:
```bash
ts-node test-supabase.ts
```

## Шаг 4: Первый запуск

### 4.1. Тестовая векторизация
Создайте тестовый урок:

```typescript
import { createEmbedding } from './rag-system/embeddings.example';
import { saveLessonToCache } from './rag-system/supabase-client.example';

async function testLesson() {
  const lessonText = "GitHub Actions - это платформа для автоматизации CI/CD";
  const embedding = await createEmbedding(lessonText);
  
  await saveLessonToCache({
    id: 'test-lesson-1',
    title: 'Тестовый урок',
    url: 'https://example.com',
    contentText: lessonText,
    summary: 'Краткое содержание',
    videoUrls: [],
    imageUrls: [],
    fileUrls: [],
    instructions: []
  }, embedding);

  console.log('✅ Тестовый урок сохранен!');
}

testLesson();
```

### 4.2. Проверка в Supabase
1. Откройте **Table Editor** → **lessons**
2. Убедитесь, что появилась запись с `id = 'test-lesson-1'`
3. Проверьте, что поле `embedding` заполнено

## Шаг 5: Интеграция в основной проект

### 5.1. Копирование модулей
Скопируйте файлы из `rag-system/` в `src/rag/`:

```bash
mkdir src/rag
cp rag-system/*.example.ts src/rag/
# Переименуйте файлы, убрав .example
```

### 5.2. Обновление импортов
В файлах `src/rag/*.ts` обновите импорты:

```typescript
// Было:
// import { getLessonContent } from '../src/lesson-parser';

// Стало:
import { getLessonContent } from '../lesson-parser';
```

### 5.3. Интеграция в index.ts
Обновите `src/index.ts`:

```typescript
import { checkHomeworkWithRAG } from './rag/rag-integration';

// В основном цикле:
for (const submission of submissions) {
  // Вместо:
  // const feedback = await checkHomework(submission);
  
  // Используйте:
  const feedback = await checkHomeworkWithRAG({
    id: submission.submissionId,
    lessonId: submission.lessonId,
    assignmentId: submission.assignmentId,
    studentId: submission.studentId,
    studentName: submission.studentName,
    submissionText: submission.submissionText,
    imageUrls: submission.imageUrls,
    fileUrls: submission.fileUrls
  });
}
```

## Шаг 6: Сбор базы знаний

### 6.1. Добавление скрипта в package.json
```json
{
  "scripts": {
    "build-knowledge": "ts-node src/rag/knowledge-builder.ts"
  }
}
```

### 6.2. Запуск сбора
```bash
# Для одного урока
npm run build-knowledge -- --lesson-id=345069174

# С извлечением концепций
npm run build-knowledge -- --lesson-id=345069174 --extract-concepts

# С построением графа
npm run build-knowledge -- --lesson-id=345069174 --extract-concepts --build-graph
```

## Шаг 7: Мониторинг и оптимизация

### 7.1. Просмотр статистики
В Supabase SQL Editor:

```sql
-- Статистика по урокам
SELECT * FROM lesson_stats ORDER BY submissions_count DESC;

-- Топ концепций
SELECT * FROM top_concepts LIMIT 20;

-- Статистика кэша
SELECT 
  entity_type,
  COUNT(*) as total,
  SUM(hit_count) as total_hits,
  AVG(hit_count) as avg_hits
FROM cache_stats
GROUP BY entity_type;
```

### 7.2. Очистка старых данных
```sql
-- Удалить работы старше 6 месяцев
DELETE FROM student_submissions 
WHERE created_at < NOW() - INTERVAL '6 months';

-- Удалить неиспользуемые кэши
DELETE FROM cache_stats 
WHERE last_accessed < NOW() - INTERVAL '3 months';
```

### 7.3. Оптимизация индексов
```sql
-- Проверить использование индексов
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes 
ORDER BY idx_scan;

-- Если idx_scan = 0, индекс не используется и можно удалить
```

## Шаг 8: Backup и безопасность

### 8.1. Автоматический backup
1. В Supabase: **Settings** → **Database**
2. Включите **Point in Time Recovery** (PITR)
3. Настройте расписание backup'ов

### 8.2. Row Level Security (RLS)
Уже настроено в `schema.sql`, но можно добавить:

```sql
-- Политика: только владелец курса видит работы
CREATE POLICY "Course owner access" ON student_submissions
  FOR ALL TO authenticated 
  USING (auth.uid() = (SELECT owner_id FROM courses WHERE id = lesson_id));
```

### 8.3. API Rate Limiting
В `.env`:
```bash
# Ограничение запросов
MAX_CONCURRENT_REQUESTS=5
SUPABASE_TIMEOUT=30000
```

## Шаг 9: Масштабирование

### 9.1. Переход на платный план
Когда Free план станет мал:
- **Pro** ($25/мес): 8GB база, 50GB bandwidth
- **Team** ($599/мес): 100GB база, 250GB bandwidth

### 9.2. Оптимизация embeddings
```typescript
// Кэширование embeddings локально
const embeddingCache = new Map<string, number[]>();

function getCachedEmbedding(text: string): number[] | null {
  const hash = createContentHash(text);
  return embeddingCache.get(hash) || null;
}
```

### 9.3. Использование CDN для изображений
Если храните скриншоты в Supabase Storage:
```typescript
const { data } = await supabase.storage
  .from('screenshots')
  .getPublicUrl('path/to/image.png');

// data.publicUrl - CDN URL
```

## Troubleshooting

### Проблема: "relation 'lessons' does not exist"
**Решение**: Запустите `schema.sql` в SQL Editor

### Проблема: "extension 'vector' does not exist"
**Решение**: Включите расширение в Database → Extensions

### Проблема: "embedding dimension mismatch"
**Решение**: Проверьте, что используете `text-embedding-ada-002` (1536 размерность)

### Проблема: "too many connections"
**Решение**: Используйте connection pooling:
```typescript
const supabase = createClient(url, key, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});
```

### Проблема: Медленные векторные запросы
**Решение**: Увеличьте количество списков в индексе:
```sql
DROP INDEX lessons_embedding_idx;
CREATE INDEX lessons_embedding_idx ON lessons 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 200); -- Было 100
```

## Полезные ссылки

- [Supabase Documentation](https://supabase.com/docs)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [Supabase Vector Search](https://supabase.com/docs/guides/ai/vector-search)

---

**Готово!** 🎉 Теперь у вас есть полноценная RAG система для GetCourse Agent!




