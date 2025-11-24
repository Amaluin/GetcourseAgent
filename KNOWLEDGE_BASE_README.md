# 📚 База Знаний - Инструкция

## 🎯 Что это?

Теперь система автоматически создает **детальную базу знаний** из уроков:
- Каждый урок разбивается на **секции** (по видео или по абзацам)
- Для каждой секции создается **векторный embedding** (Ollama + nomic-embed-text)
- Извлекаются **ключевые слова** и создаются связи в графе
- Доступен **семантический поиск** по всей базе знаний

## 🚀 Быстрый старт

### 1. Загрузка уроков в базу знаний

```bash
# Включите GraphRAG
$env:GRAPHRAG_ENABLED="true"

# Запустите основной скрипт
npm run start
```

Скрипт автоматически:
- Парсит уроки
- Разбивает на секции
- Создает embeddings
- Сохраняет в Neo4j

### 2. Поиск в базе знаний

```bash
# Семантический поиск
npm run search "GitHub Actions"
npm run search "как создать workflow"
npm run search "что такое CI/CD"
```

## 📊 Структура базы знаний

### Узлы (Nodes)

1. **Lesson** - Урок
   - id, title, summary, content
   
2. **LessonSection** - Секция урока
   - sectionNumber, title, content
   - videoUrl, videoTitle
   - beforeVideo, afterVideo (текст до и после видео)
   - embedding (векторное представление)
   - keywords (ключевые слова)

3. **Keyword** - Ключевое слово
   - name

4. **Concept** - Концепция
   - name, description

5. **Submission** - Работа студента
   - studentId, studentName, text, status

### Связи (Relationships)

- `(Lesson)-[:HAS_SECTION]->(LessonSection)`
- `(LessonSection)-[:MENTIONS]->(Keyword)`
- `(Lesson)-[:HAS_CONCEPT]->(Concept)`
- `(Submission)-[:FOR_LESSON]->(Lesson)`
- `(Submission)-[:USES]->(Concept)`

## 🔍 Примеры поиска

### Семантический поиск

```bash
npm run search "GitHub Actions"
```

**Результат:**
```
🔍 Найдено 3 релевантных секций:

1. 📚 Урок: "Введение в GitHub Actions"
   📍 Секция 1: Playground
   🎥 Видео: Playground
   🔗 https://...
   📝 Содержание: GitHub Actions - это платформа для автоматизации...
   ⭐ Релевантность: 87.3%

2. 📚 Урок: "CI/CD с GitHub Actions"
   📍 Секция 2: Создание Workflow
   ...
```

### Поиск по ключевому слову

Можно также искать по точному ключевому слову (будет добавлено в следующей версии).

## 💡 Как это работает?

### 1. Парсинг урока

```typescript
// lesson-parser.ts создает детальные секции
const detailedSections = createDetailedSections(videoSections, fullText);

// Каждая секция содержит:
{
  sectionNumber: 1,
  title: "Playground",
  content: "полный текст секции",
  videoUrl: "https://...",
  beforeVideo: "текст до видео",
  afterVideo: "текст после видео"
}
```

### 2. Создание embeddings

```typescript
// knowledge-base.ts
const embedding = await createEmbedding(fullContent);
// Возвращает вектор из 768 чисел (nomic-embed-text)
```

### 3. Сохранение в Neo4j

```typescript
// neo4j-client.ts
await saveLessonSection(session, {
  id: "339292840-section-1",
  lessonId: "339292840",
  sectionNumber: 1,
  title: "Playground",
  content: "...",
  embedding: [0.123, -0.456, ...], // 768 чисел
  keywords: ["github", "actions", "workflow", ...]
});
```

### 4. Семантический поиск

```typescript
// 1. Создаем embedding для запроса
const queryEmbedding = await createEmbedding("GitHub Actions");

// 2. Вычисляем косинусное сходство с каждой секцией
const similarity = cosineSimilarity(queryEmbedding, sectionEmbedding);

// 3. Сортируем по релевантности
results.sort((a, b) => b.relevanceScore - a.relevanceScore);
```

## 🎨 Визуализация в Neo4j Browser

Откройте http://localhost:7474 и выполните:

```cypher
// Посмотреть структуру урока с секциями
MATCH path = (l:Lesson {id: "339292840"})-[:HAS_SECTION]->(s:LessonSection)
RETURN path

// Посмотреть секции с ключевыми словами
MATCH path = (s:LessonSection)-[:MENTIONS]->(k:Keyword)
WHERE s.lessonId = "339292840"
RETURN path
LIMIT 50

// Найти секции, упоминающие конкретное ключевое слово
MATCH (k:Keyword {name: "github"})<-[:MENTIONS]-(s:LessonSection)<-[:HAS_SECTION]-(l:Lesson)
RETURN l.title, s.sectionNumber, s.title
```

## 🔧 Настройка

### .env файл

```bash
# GraphRAG
GRAPHRAG_ENABLED=true
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### Очистка базы данных

```cypher
// Удалить все секции и ключевые слова
MATCH (s:LessonSection)
DETACH DELETE s

MATCH (k:Keyword)
DETACH DELETE k

// Или удалить всё
MATCH (n)
DETACH DELETE n
```

## 📈 Преимущества

1. **Быстрый поиск**: Не нужно парсить урок каждый раз
2. **Семантический поиск**: Находит по смыслу, а не по точному совпадению
3. **Детальная информация**: Точно знаете, в какой секции и после какого видео упоминается термин
4. **Масштабируемость**: База растет автоматически с каждым новым уроком
5. **Персонализация**: AI видит примеры успешных работ и историю студента

## 🎯 Примеры использования

### Вопрос: "Где говорилось про GitHub Actions?"

```bash
npm run search "GitHub Actions"
```

**Ответ:**
```
📚 Урок: "Введение в GitHub Actions"
📍 Секция 1: Playground
🎥 Видео: Playground
🔗 https://university.zerocoder.ru/...

📝 Полное содержание секции:
GitHub Actions - это платформа для автоматизации рабочих процессов...
[полный текст секции]
```

### Вопрос: "Как создать workflow?"

```bash
npm run search "создать workflow"
```

Система найдет все секции, где упоминается создание workflow, и покажет:
- В каком уроке
- В какой секции (номер)
- После какого видео
- Полный текст с контекстом

## 🚀 Следующие шаги

1. Загрузите все уроки в базу знаний
2. Протестируйте поиск по разным запросам
3. Используйте базу знаний для проверки домашних заданий
4. Расширьте базу знаний дополнительными материалами

---

**Готово!** Теперь у вас есть полноценная база знаний с семантическим поиском! 🎉



