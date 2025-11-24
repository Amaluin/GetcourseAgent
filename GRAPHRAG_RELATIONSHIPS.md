# 🕸️ GraphRAG - Структура Relationships

## ✅ Что сделано:

### 1. **Полная структура графа с relationships**

```
📊 СТАТИСТИКА УЗЛОВ:
   Concept              : 52  (Концепции)
   Keyword              : 10  (Ключевые слова)
   Submission           : 4   (Работы студентов)
   Lesson               : 2   (Уроки)
   LessonSection        : 2   (Секции уроков)
   Student              : 1   (Студенты)

📊 СТАТИСТИКА СВЯЗЕЙ:
   MENTIONS             : 20  (Секция → Ключевое слово)
   TEACHES              : 20  (Урок → Концепция)
   TAUGHT_IN            : 20  (Концепция → Урок)
   HAS_SECTION          : 2   (Урок → Секция)
   USES                 : 2   (Работа → Концепция)
   FOR_LESSON           : 2   (Работа → Урок)
   HAS_SUBMISSION       : 2   (Урок → Работа)
   SUBMITTED            : 2   (Студент → Работа)
   STUDIES              : 2   (Студент → Урок)
```

### 2. **Детальная структура**

```
📚 Урок AN09:
   Секций: 1
   Концепций: 10
   Работ студентов: 1

📚 Урок AN08:
   Секций: 1
   Концепций: 10
   Работ студентов: 1

👥 Студент "Денис Ахмедов":
   Работ: 2
   Знает концепций: 0 (будет заполняться при использовании)
   Изучает уроков: 2
```

## 🗺️ Граф Relationships:

```
┌─────────────────────────────────────────────────────────┐
│                   ПОЛНАЯ СТРУКТУРА                       │
└─────────────────────────────────────────────────────────┘

                    (Lesson)
                       │
           ┌───────────┼───────────┐
           │           │           │
     [HAS_SECTION] [TEACHES]  [HAS_SUBMISSION]
           │           │           │
           ▼           ▼           ▼
    (LessonSection) (Concept)  (Submission)
           │           ▲           │
      [MENTIONS]   [TAUGHT_IN] [FOR_LESSON]
           │           │           │
           ▼           │           ▼
      (Keyword)        └───────(Lesson)
                                 │
                            [USES]
                                 │
                                 ▼
                            (Concept)
                                 ▲
                            [KNOWS]
                                 │
                            (Student)
                                 │
                          [SUBMITTED]
                                 │
                                 ▼
                          (Submission)
                                 │
                           [STUDIES]
                                 │
                                 ▼
                            (Lesson)
```

## 🔍 Cypher запросы для навигации:

### 1. Показать всю структуру графа:
```cypher
MATCH (n)-[r]->(m) 
RETURN n, r, m 
LIMIT 100
```

### 2. Показать урок со всеми связями:
```cypher
MATCH (l:Lesson)-[r]-(n) 
WHERE l.id = "345277484" 
RETURN l, r, n
```

### 3. Показать студента со всеми связями:
```cypher
MATCH (st:Student)-[r]-(n) 
RETURN st, r, n 
LIMIT 50
```

### 4. Показать концепции и где они используются:
```cypher
MATCH (c:Concept)-[r]-(n) 
RETURN c, r, n 
LIMIT 100
```

### 5. Показать путь от студента к концепциям через работы:
```cypher
MATCH path = (st:Student)-[:SUBMITTED]->(:Submission)-[:USES]->(c:Concept)
RETURN path 
LIMIT 20
```

### 6. Найти студентов, которые используют определенную концепцию:
```cypher
MATCH (st:Student)-[:SUBMITTED]->(s:Submission)-[:USES]->(c:Concept {name: "webhook"})
RETURN st.name, s.text, c.name
```

### 7. Найти все концепции, которые изучает студент:
```cypher
MATCH (st:Student)-[:STUDIES]->(l:Lesson)-[:TEACHES]->(c:Concept)
WHERE st.name = "Денис Ахмедов"
RETURN DISTINCT c.name
```

### 8. Найти похожих студентов (изучают те же концепции):
```cypher
MATCH (st1:Student)-[:STUDIES]->(:Lesson)-[:TEACHES]->(c:Concept)<-[:TEACHES]-(:Lesson)<-[:STUDIES]-(st2:Student)
WHERE st1.name = "Денис Ахмедов" AND st1 <> st2
RETURN st2.name, count(c) as commonConcepts
ORDER BY commonConcepts DESC
```

### 9. Найти самые популярные концепции:
```cypher
MATCH (l:Lesson)-[:TEACHES]->(c:Concept)<-[:USES]-(s:Submission)
RETURN c.name, count(DISTINCT l) as lessons, count(DISTINCT s) as submissions
ORDER BY lessons DESC, submissions DESC
LIMIT 10
```

### 10. Путь обучения студента:
```cypher
MATCH path = (st:Student)-[:STUDIES]->(l:Lesson)-[:TEACHES]->(c:Concept)
WHERE st.name = "Денис Ахмедов"
RETURN path
```

## 🎯 Использование relationships для AI:

### Контекст для проверки домашней работы:

```typescript
// При проверке работы студента AI получает контекст:

1. Урок и его концепции:
   MATCH (l:Lesson {id: $lessonId})-[:TEACHES]->(c:Concept)
   RETURN c.name

2. Работы других студентов по этому уроку:
   MATCH (l:Lesson {id: $lessonId})-[:HAS_SUBMISSION]->(s:Submission)
   WHERE s.status = 'accepted'
   RETURN s.text, s.studentName

3. История студента:
   MATCH (st:Student {id: $studentId})-[:SUBMITTED]->(s:Submission)
   RETURN s.status, s.lessonId

4. Концепции, которые знает студент:
   MATCH (st:Student {id: $studentId})-[:KNOWS]->(c:Concept)
   RETURN c.name

5. Секции урока с контентом:
   MATCH (l:Lesson {id: $lessonId})-[:HAS_SECTION]->(s:LessonSection)
   RETURN s.title, s.content
   ORDER BY s.sectionNumber
```

## 📊 Пример использования в коде:

```typescript
// src/graphrag/neo4j-client.ts

// Получаем полный контекст для AI
async function getContext(lessonId: string, studentId: string) {
  // 1. Концепции урока
  const concepts = await session.run(`
    MATCH (l:Lesson {id: $lessonId})-[:TEACHES]->(c:Concept)
    RETURN c.name
  `, { lessonId });

  // 2. Похожие успешные работы
  const similarSubmissions = await session.run(`
    MATCH (l:Lesson {id: $lessonId})-[:HAS_SUBMISSION]->(s:Submission)
    WHERE s.status = 'accepted'
    RETURN s.text, s.studentName
    LIMIT 3
  `, { lessonId });

  // 3. История студента
  const studentHistory = await session.run(`
    MATCH (st:Student {id: $studentId})-[:SUBMITTED]->(s:Submission)-[:FOR_LESSON]->(l:Lesson)
    RETURN l.title, s.status, s.created_at
    ORDER BY s.created_at DESC
    LIMIT 5
  `, { studentId });

  // 4. Концепции, которые знает студент
  const knownConcepts = await session.run(`
    MATCH (st:Student {id: $studentId})-[:KNOWS]->(c:Concept)
    RETURN c.name
  `, { studentId });

  return {
    lessonConcepts: concepts.records.map(r => r.get('name')),
    similarSubmissions: similarSubmissions.records.map(r => ({
      text: r.get('text'),
      studentName: r.get('studentName')
    })),
    studentHistory: studentHistory.records.map(r => ({
      lessonTitle: r.get('title'),
      status: r.get('status')
    })),
    knownConcepts: knownConcepts.records.map(r => r.get('name'))
  };
}
```

## 🚀 Автоматическое создание relationships:

При добавлении нового урока:
```typescript
1. Создается узел Lesson
2. Извлекаются концепции → создаются Concept
3. Создаются связи: (Lesson)-[:TEACHES]->(Concept)
4. Создаются обратные связи: (Concept)-[:TAUGHT_IN]->(Lesson)
5. Создаются секции → LessonSection
6. Связываются: (Lesson)-[:HAS_SECTION]->(LessonSection)
```

При добавлении работы студента:
```typescript
1. Создается узел Submission
2. Создается/находится Student
3. Создаются связи:
   - (Student)-[:SUBMITTED]->(Submission)
   - (Submission)-[:FOR_LESSON]->(Lesson)
   - (Lesson)-[:HAS_SUBMISSION]->(Submission)
   - (Student)-[:STUDIES]->(Lesson)
4. Анализируется текст работы
5. Если упоминается Concept:
   - (Submission)-[:USES]->(Concept)
   - (Student)-[:KNOWS]->(Concept)
```

## 💡 Преимущества relationships:

1. **Навигация по графу** — можно идти от любого узла к любому
2. **Контекстный поиск** — найти все связанные данные
3. **Рекомендации** — похожие студенты, похожие концепции
4. **Анализ** — кто что изучает, что популярно
5. **Персонализация** — AI видит всю историю студента

## 🛠️ CLI команды:

```bash
# Визуализация графа
npm run visualize-graph

# Проверка секций
npm run inspect-kb

# Поиск в базе знаний
npm run search "запрос"

# Очистка базы
npm run clear-kb
```

## 🎉 Итог:

✅ Граф полностью связан с 9 типами relationships
✅ Автоматическое создание связей при добавлении данных
✅ Двунаправленные связи для быстрой навигации
✅ Полный контекст для AI из графа
✅ Возможность анализа и рекомендаций

**GraphRAG готов к использованию!** 🚀


