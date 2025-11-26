# 🧪 Руководство по тестированию GraphRAG

## 📋 Обзор

Этот гайд поможет вам протестировать GraphRAG систему на одной работе студента и убедиться, что всё работает корректно.

---

## 🚀 Быстрый запуск теста

### Шаг 1: Подготовка

```bash
# 1. Убедитесь, что Ollama запущен
ollama serve

# 2. Убедитесь, что модель установлена
ollama pull nomic-embed-text

# 3. Запустите Neo4j (если еще не запущен)
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  -v neo4j_data:/data \
  neo4j:latest

# 4. Подождите ~30 секунд, пока Neo4j запустится
sleep 30
```

### Шаг 2: Настройка .env

Создайте или обновите `.env`:

```bash
# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
USE_OLLAMA_EMBEDDINGS=true
```

### Шаг 3: Установка зависимостей

```bash
# Python зависимости для работы с Neo4j
pip install neo4j

# TypeScript зависимости
npm install axios
```

### Шаг 4: Запуск теста

```bash
# Запустите тестовый скрипт
ts-node rag-system/test-single-submission.ts
```

---

## 📊 Ожидаемый результат

```
======================================================================
🧪 ТЕСТ GRAPHRAG НА ОДНОЙ РАБОТЕ СТУДЕНТА
======================================================================

🔍 Проверяю Ollama...
✅ Ollama запущен, модель nomic-embed-text найдена

🔍 Проверяю Neo4j...
✅ Neo4j запущен и доступен

🧪 Тестирую Ollama embeddings...
  ✅ Embedding 1: размерность 768, время 52ms
  ✅ Embedding 2: размерность 768, время 48ms

📚 Добавляю урок в граф...
✅ Урок "Введение в GitHub Actions" добавлен в граф

📝 Добавляю работу студента в граф...
✅ Работа студента "Иван Тестовый" добавлена в граф

🧠 Извлекаю концепции из урока...
  ✅ Концепция: GitHub Actions
  ✅ Концепция: Workflow
  ✅ Концепция: CI/CD
  ✅ Концепция: Runner

🔍 Проверяю данные в графе...
  Уроки: 1
  Работы студентов: 1
  Концепции: 4
  Связи урок→работа: 1
  Связи урок→концепция: 4

📊 Граф связей:
lesson                          student         concepts
"Введение в GitHub Actions"     "Иван Тестовый" ["GitHub Actions", "Workflow", "CI/CD", "Runner"]

📈 Визуализация графа:
   Откройте Neo4j Browser: http://localhost:7474
   Логин: neo4j, пароль: password

   Выполните запрос:
   MATCH (l:Lesson {id: 'test-lesson-001'})-[r]-(n) RETURN l, r, n

======================================================================
✅ ТЕСТ ЗАВЕРШЕН УСПЕШНО!
======================================================================

📝 Что было сделано:
  1. Проверены Ollama и Neo4j
  2. Создан урок "Введение в GitHub Actions"
  3. Добавлена работа студента "Иван Тестовый"
  4. Извлечены 4 концепции из урока
  5. Созданы связи в графе

🎯 Следующие шаги:
  1. Откройте Neo4j Browser: http://localhost:7474
  2. Визуализируйте граф запросом:
     MATCH (n) RETURN n LIMIT 25
  3. Изучите связи между узлами

💡 Полезные запросы:
  - Все уроки: MATCH (l:Lesson) RETURN l
  - Все концепции: MATCH (c:Concept) RETURN c
  - Граф урока: MATCH (l:Lesson)-[r]-(n) WHERE l.id = "test-lesson-001" RETURN l, r, n
```

---

## 🎨 Визуализация в Neo4j Browser

### Шаг 1: Откройте браузер

Перейдите по адресу: http://localhost:7474

### Шаг 2: Войдите

- **Username**: `neo4j`
- **Password**: `password`

### Шаг 3: Выполните запросы

#### Показать весь граф

```cypher
MATCH (n) RETURN n LIMIT 25
```

#### Показать только тестовые данные

```cypher
MATCH (l:Lesson {id: 'test-lesson-001'})-[r]-(n) 
RETURN l, r, n
```

#### Показать концепции урока

```cypher
MATCH (l:Lesson {id: 'test-lesson-001'})-[:TEACHES]->(c:Concept)
RETURN l.title as Урок, collect(c.name) as Концепции
```

#### Показать работы студентов

```cypher
MATCH (l:Lesson)-[:HAS_SUBMISSION]->(s:Submission)
RETURN l.title as Урок, s.studentName as Студент, s.status as Статус
```

---

## 🔧 Troubleshooting

### Ошибка: "Ollama не запущен"

**Решение**:
```bash
# Запустите Ollama
ollama serve

# В новом терминале проверьте
curl http://localhost:11434/api/tags
```

### Ошибка: "Neo4j недоступен"

**Решение**:
```bash
# Проверьте статус контейнера
docker ps | grep neo4j

# Если не запущен, запустите
docker start neo4j

# Или создайте новый
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest

# Подождите 30 секунд
sleep 30
```

### Ошибка: "Python не найден"

**Решение**:
```bash
# Установите Python 3
# Ubuntu/Debian:
sudo apt install python3 python3-pip

# macOS:
brew install python3

# Windows:
# Скачайте с python.org

# Установите neo4j драйвер
pip3 install neo4j
```

### Ошибка: "модель nomic-embed-text не найдена"

**Решение**:
```bash
# Установите модель
ollama pull nomic-embed-text

# Проверьте
ollama list
```

### Граф пустой

**Решение**:
```bash
# Очистите Neo4j и запустите тест заново
docker exec neo4j cypher-shell -u neo4j -p password "MATCH (n) DETACH DELETE n"

# Запустите тест снова
ts-node rag-system/test-single-submission.ts
```

---

## 📊 Что проверяет тест?

### 1. Зависимости
- ✅ Ollama запущен
- ✅ Модель nomic-embed-text установлена
- ✅ Neo4j запущен и доступен

### 2. Embeddings
- ✅ Создание embeddings работает
- ✅ Размерность корректная (768)
- ✅ Скорость приемлемая (<100ms)

### 3. Граф знаний
- ✅ Создание узлов (Lesson, Submission, Concept)
- ✅ Создание связей (HAS_SUBMISSION, TEACHES)
- ✅ Запросы к графу работают

### 4. Данные
- ✅ Урок сохранен с метаданными
- ✅ Работа студента сохранена
- ✅ Концепции извлечены
- ✅ Связи созданы

---

## 🎯 Следующие шаги после теста

### 1. Изучите граф

Откройте Neo4j Browser и поэкспериментируйте с запросами:

```cypher
// Найти все концепции, которые изучает урок
MATCH (l:Lesson)-[:TEACHES]->(c:Concept)
RETURN l.title, collect(c.name)

// Найти студентов, которые использовали концепцию
MATCH (c:Concept)<-[:USES]-(s:Submission)
RETURN c.name, collect(s.studentName)

// Найти похожие работы (через общие концепции)
MATCH (s1:Submission)-[:USES]->(c:Concept)<-[:USES]-(s2:Submission)
WHERE s1 <> s2
RETURN s1.studentName, s2.studentName, collect(c.name) as shared_concepts
```

### 2. Добавьте реальные данные

Теперь, когда тест работает, интегрируйте GraphRAG в основной проект:

```typescript
// В src/index.ts
import { GraphitiClient } from './graphrag/graphiti_client';

const graphiti = new GraphitiClient();

// При проверке работы
const context = await graphiti.getContext(lessonId, submissionText);
```

### 3. Мониторьте граф

Регулярно проверяйте статистику:

```cypher
// Статистика графа
MATCH (l:Lesson) WITH count(l) as lessons
MATCH (s:Submission) WITH lessons, count(s) as submissions
MATCH (c:Concept) WITH lessons, submissions, count(c) as concepts
MATCH ()-[r]->() WITH lessons, submissions, concepts, count(r) as relationships
RETURN lessons, submissions, concepts, relationships
```

---

## 💡 Полезные команды

### Очистка тестовых данных

```bash
# Удалить только тестовые данные
docker exec neo4j cypher-shell -u neo4j -p password \
  "MATCH (n) WHERE n.id STARTS WITH 'test-' DETACH DELETE n"
```

### Экспорт графа

```bash
# Экспорт в JSON
docker exec neo4j cypher-shell -u neo4j -p password \
  "MATCH (n) RETURN n" --format json > graph-export.json
```

### Бэкап Neo4j

```bash
# Создать дамп
docker exec neo4j neo4j-admin dump --to=/tmp/neo4j-backup.dump

# Копировать из контейнера
docker cp neo4j:/tmp/neo4j-backup.dump ./neo4j-backup.dump
```

---

## 🎉 Готово!

Теперь вы знаете, как:
- ✅ Запустить тест GraphRAG
- ✅ Проверить, что данные записались
- ✅ Визуализировать граф в Neo4j Browser
- ✅ Решать проблемы
- ✅ Работать с графом знаний

**Следующий шаг**: Интегрируйте GraphRAG в основной проект! 🚀

---

*Создано: 23 ноября 2025*  
*Версия: 1.0.0*  
*Статус: ✅ Готово к использованию*




