# 🧪 Запуск теста GraphRAG

## Быстрый старт

### 1. Подготовка окружения

```bash
# Запустите Ollama
ollama serve

# В другом терминале: загрузите модель для embeddings
ollama pull nomic-embed-text

# Запустите Neo4j
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest
```

### 2. Настройка переменных окружения

Создайте файл `.env` в корне проекта (если еще не создан):

```bash
# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Ollama
USE_OLLAMA_EMBEDDINGS=true
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Supabase (опционально, для гибридного подхода)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# AI модели
GROQ_API_KEY=your-groq-api-key
GEMINI_API_KEY=your-gemini-api-key
```

### 3. Запуск теста

```bash
ts-node rag-system/test-single-submission.ts
```

## Что делает тест?

1. ✅ **Проверяет окружение**: Ollama и Neo4j запущены?
2. 🧪 **Тестирует embeddings**: Создает векторы для тестовых текстов
3. 📚 **Добавляет урок**: Создает тестовый урок "Введение в GitHub Actions"
4. 📝 **Добавляет работу студента**: Создает тестовую работу студента "Иван Тестовый"
5. 🧠 **Извлекает концепции**: Находит ключевые концепции из урока (GitHub Actions, Workflow, CI/CD, Runner)
6. 🔗 **Создает связи**: Связывает работу студента с концепциями
7. 💾 **Сохраняет в Supabase** (если настроен): Дублирует данные в векторную БД
8. 📊 **Собирает статистику**: Показывает статистику по студенту из Neo4j и Supabase
9. 🎨 **Визуализирует граф**: Показывает структуру графа знаний

## Ожидаемый результат

```
==================================================================
🧪 ТЕСТ GRAPHRAG НА ОДНОЙ РАБОТЕ СТУДЕНТА
==================================================================

✅ Ollama запущен (http://localhost:11434)
✅ Neo4j запущен (bolt://localhost:7687)

🧪 Тестирую Ollama embeddings...
  ✅ Embedding 1: размерность 768, время 45ms
  ✅ Embedding 2: размерность 768, время 38ms

📚 Добавляю урок в граф...
✅ Урок "Введение в GitHub Actions" добавлен в граф

📝 Добавляю работу студента в граф...
✅ Работа студента "Иван Тестовый" добавлена в граф

🧠 Извлекаю концепции из урока...
  ✅ Концепция: GitHub Actions
  ✅ Концепция: Workflow
  ✅ Концепция: CI/CD
  ✅ Концепция: Runner

🔗 Связываю работу студента с концепциями...
  ✅ Связь: Иван Тестовый → GitHub Actions
  ✅ Связь: Иван Тестовый → Workflow
  ✅ Связь: Иван Тестовый → CI/CD

✅ Данные успешно добавлены в граф

📊 Статистика графа:
  Уроков: 1
  Работ студентов: 1
  Концепций: 4
  Связей: 7

💾 Сохраняю данные в Supabase (векторная БД)...
  ✅ Урок сохранен в Supabase
  ✅ Работа студента сохранена в Supabase
  📊 ID студента для статистики: a1b2c3d4e5f6g7h8

📊 Статистика по студенту "Иван Тестовый":
   ID: a1b2c3d4e5f6g7h8

  📈 Neo4j (Граф знаний):
    total | accepted | rejected
    1     | 1        | 0

  🧠 Использованные концепции:
    GitHub Actions
    Workflow
    CI/CD

  📚 Пройденные уроки:
    Введение в GitHub Actions

  📊 Supabase (Векторная БД):
    Всего работ: 1
    Принято: 1
    Средняя схожесть с идеалом: 85.3%

==================================================================
✅ ТЕСТ ЗАВЕРШЕН УСПЕШНО!
==================================================================

📝 Что было сделано:
  1. Проверены Ollama и Neo4j
  2. Создан урок "Введение в GitHub Actions"
  3. Добавлена работа студента "Иван Тестовый"
  4. Извлечены 4 концепции из урока
  5. Созданы связи в графе знаний
  6. Сохранены данные в Supabase (если настроен)
  7. Собрана статистика по студенту

🎯 Следующие шаги:
  1. Откройте Neo4j Browser: http://localhost:7474
  2. Визуализируйте граф запросом:
     MATCH (n) RETURN n LIMIT 25
  3. Изучите связи между узлами
  4. Проверьте статистику студента по ID: a1b2c3d4e5f6g7h8

💡 Полезные запросы:
  - Все уроки: MATCH (l:Lesson) RETURN l
  - Все концепции: MATCH (c:Concept) RETURN c
  - Граф урока: MATCH (l:Lesson)-[r]-(n) WHERE l.id = "test-lesson-001" RETURN l, r, n
  - Статистика студента: MATCH (s:Submission {studentId: "a1b2c3d4e5f6g7h8"}) RETURN s
```

## Визуализация в Neo4j Browser

1. Откройте http://localhost:7474
2. Введите логин: `neo4j`, пароль: `password`
3. Выполните запрос:

```cypher
MATCH (n) RETURN n LIMIT 25
```

Вы увидите граф с узлами:
- 🟦 **Lesson** (урок)
- 🟩 **Submission** (работа студента)
- 🟨 **Concept** (концепции)

И связями:
- `FOR_LESSON` (работа → урок)
- `USES` (работа → концепция)
- `HAS_CONCEPT` (урок → концепция)

## Проверка статистики студента

### В Neo4j Browser

```cypher
// Все работы студента
MATCH (s:Submission {studentId: 'a1b2c3d4e5f6g7h8'})
RETURN s

// Использованные концепции
MATCH (s:Submission {studentId: 'a1b2c3d4e5f6g7h8'})-[:USES]->(c:Concept)
RETURN c.name as concept

// Граф студента
MATCH path = (s:Submission {studentId: 'a1b2c3d4e5f6g7h8'})-[*1..2]-(n)
RETURN path
LIMIT 50
```

### В Supabase (если настроен)

Откройте Supabase Dashboard → SQL Editor:

```sql
-- Все работы студента
SELECT * FROM student_submissions
WHERE student_id = 'a1b2c3d4e5f6g7h8';

-- Статистика
SELECT 
  student_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
  AVG(similarity_to_ideal) as avg_similarity
FROM student_submissions
WHERE student_id = 'a1b2c3d4e5f6g7h8'
GROUP BY student_name;
```

## Troubleshooting

### Ошибка: "Ollama не запущен"

```bash
# Запустите Ollama
ollama serve

# Проверьте, что модель загружена
ollama list
# Если nomic-embed-text нет в списке:
ollama pull nomic-embed-text
```

### Ошибка: "Neo4j не запущен"

```bash
# Проверьте, что контейнер запущен
docker ps | grep neo4j

# Если нет, запустите:
docker start neo4j

# Или создайте новый:
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest
```

### Ошибка: "Python не найден"

Тест использует fallback на `cypher-shell` через Docker, если Python недоступен. Это нормально.

### Ошибка: "Supabase не настроен"

Это нормально! Supabase опционален. Тест пропустит сохранение в Supabase и продолжит работу.

## Следующие шаги

После успешного теста:

1. **Интегрируйте GraphRAG в основной скрипт**: См. [`README_GRAPHRAG.md`](./README_GRAPHRAG.md)
2. **Изучите статистику студентов**: См. [`STUDENT_STATS.md`](./STUDENT_STATS.md)
3. **Настройте гибридный подход**: См. [`README_HYBRID.md`](./README_HYBRID.md)

---

**Удачи!** 🚀




