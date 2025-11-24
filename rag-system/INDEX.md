# 📑 Индекс файлов RAG системы

## 📚 Документация

### 📖 README.md
**Назначение**: Главный документ с полным планом реализации
**Содержит**:
- Обзор системы и цели
- Архитектура (диаграммы)
- Структура данных (таблицы БД)
- Workflow (3 основных сценария)
- Пошаговый план реализации (8 фаз)
- Ожидаемые результаты и метрики

**Читать первым**: ✅ Да

---

### ⚡ QUICK_START.md
**Назначение**: Быстрый старт за 5 минут
**Содержит**:
- Минимальная настройка
- Основные команды
- Упрощенная архитектура
- Метрики до/после RAG

**Читать первым**: ✅ Да (если нужно быстро начать)

---

### 🚀 SETUP_GUIDE.md
**Назначение**: Детальная пошаговая инструкция по настройке
**Содержит**:
- Создание проекта в Supabase (с скриншотами)
- Настройка БД и pgvector
- Установка зависимостей
- Настройка .env
- Первый запуск и тестирование
- Интеграция в основной проект
- Troubleshooting

**Читать вторым**: ✅ Да (перед началом работы)

---

### 🏗️ ARCHITECTURE.md
**Назначение**: Подробная техническая архитектура
**Содержит**:
- Общая схема системы (ASCII диаграммы)
- Поток данных (холодный/горячий старт)
- Детали векторного поиска
- Структура данных (примеры JSON)
- Алгоритмы и оптимизации
- Масштабирование и безопасность

**Читать**: Для глубокого понимания системы

---

### 📚 EXAMPLES.md
**Назначение**: 10+ практических примеров использования
**Содержит**:
- Проверка работы с RAG
- Сбор базы знаний
- Поиск похожих работ
- Кэширование уроков
- Статистика и аналитика
- Батч-обработка
- Экспорт данных
- Мониторинг производительности
- Полезные SQL запросы

**Читать**: При реализации конкретных задач

---

## 🗄️ База данных

### 📊 schema.sql
**Назначение**: SQL схема для Supabase
**Содержит**:
- Создание таблиц (lessons, assignments, submissions, concepts)
- Индексы для векторного поиска
- Функции для similarity search
- Триггеры для автообновления
- Views для аналитики
- Row Level Security (RLS)
- Начальные данные

**Использование**: Запустить в Supabase SQL Editor

---

## 💻 TypeScript код

### 🔤 types.ts
**Назначение**: TypeScript типы и интерфейсы
**Содержит**:
- Lesson, Assignment, StudentSubmission
- RAGContext, RAGConfig
- SimilarityMatch, LessonMatch, SubmissionMatch
- KnowledgeBuilderOptions, KnowledgeBuilderResult
- Graph типы (для GraphRAG)

**Использование**: Импортировать в других модулях

---

### 🧮 embeddings.example.ts
**Назначение**: Модуль для работы с embeddings
**Функции**:
- `createEmbedding(text)` - создать embedding для текста
- `batchCreateEmbeddings(texts)` - батч-обработка
- `cosineSimilarity(vec1, vec2)` - вычислить схожесть
- `createContentHash(text)` - хэш для кэширования
- `prepareTextForEmbedding(text)` - подготовка текста

**Использование**: Векторизация текстов

---

### 🗄️ supabase-client.example.ts
**Назначение**: Клиент для работы с Supabase
**Функции**:
- `getLessonFromCache(lessonId)` - получить урок
- `saveLessonToCache(lesson, embedding)` - сохранить урок
- `findSimilarLessons(embedding)` - поиск похожих уроков
- `getAssignment(assignmentId)` - получить задание
- `saveSubmission(submission, embedding)` - сохранить работу
- `findSimilarSubmissions(embedding, assignmentId)` - поиск похожих работ
- `getAcceptedSubmissions(assignmentId)` - все принятые работы
- `getLessonStats()` - статистика

**Использование**: CRUD операции с БД

---

### 🤖 rag-integration.example.ts
**Назначение**: Интеграция RAG в процесс проверки
**Функции**:
- `getRAGContext(lessonId, assignmentId, submissionText)` - получить полный контекст
- `checkHomeworkWithRAG(submission)` - проверить работу с RAG
- `buildEnhancedPrompt(context, studentName, submissionText)` - построить промпт

**Использование**: Главный модуль для проверки работ

---

### 🏗️ knowledge-builder.example.ts
**Назначение**: Сбор базы знаний из принятых работ
**Функции**:
- `buildKnowledgeBase(options)` - собрать базу знаний для урока
- `extractConceptsFromLesson(lessonId)` - извлечь концепции
- `getAllSubmissionsForLesson(page, lessonId)` - парсинг всех работ
- `buildKnowledgeGraph(lessonId)` - построить граф

**Использование**: CLI для первичной загрузки данных

---

## ⚙️ Конфигурация

### 🔧 env.example
**Назначение**: Пример файла с переменными окружения
**Содержит**:
- Supabase URL и ключи
- OpenAI API ключ
- Параметры RAG (similarity threshold, max results)
- Настройки кэша
- GraphRAG конфигурация
- Performance настройки
- Feature flags

**Использование**: Скопировать в `.env` и заполнить

---

### 📦 package.json.example
**Назначение**: Пример package.json для RAG модулей
**Содержит**:
- Зависимости (@supabase/supabase-js, openai, groq-sdk)
- Скрипты (test-connection, build-knowledge, analytics)

**Использование**: Добавить в основной package.json

---

## 📋 Вспомогательные файлы

### 📑 INDEX.md (этот файл)
**Назначение**: Навигация по всем файлам проекта
**Содержит**: Описание каждого файла и его назначение

---

## 🗂️ Структура папок (после реализации)

```
GetcourseAgent/
├── src/
│   ├── rag/                          # RAG модули
│   │   ├── embeddings.ts             # Векторизация
│   │   ├── supabase-client.ts        # Клиент БД
│   │   ├── rag-integration.ts        # Интеграция
│   │   ├── knowledge-builder.ts      # Сбор базы знаний
│   │   └── types.ts                  # TypeScript типы
│   ├── browser.ts                    # Playwright
│   ├── auth.ts                       # Авторизация
│   ├── parser.ts                     # Парсинг работ
│   ├── lesson-parser.ts              # Парсинг уроков
│   ├── ai.ts                         # AI проверка
│   └── index.ts                      # Главный файл
├── rag-system/                       # Документация и примеры
│   ├── README.md                     # Главный план
│   ├── QUICK_START.md                # Быстрый старт
│   ├── SETUP_GUIDE.md                # Инструкция
│   ├── ARCHITECTURE.md               # Архитектура
│   ├── EXAMPLES.md                   # Примеры
│   ├── INDEX.md                      # Этот файл
│   ├── schema.sql                    # SQL схема
│   ├── types.ts                      # TypeScript типы
│   ├── embeddings.example.ts         # Пример модуля
│   ├── supabase-client.example.ts    # Пример клиента
│   ├── rag-integration.example.ts    # Пример интеграции
│   ├── knowledge-builder.example.ts  # Пример сборщика
│   ├── env.example                   # Пример .env
│   └── package.json.example          # Пример package.json
├── .env                              # Переменные окружения
├── package.json                      # Зависимости
└── tsconfig.json                     # TypeScript конфиг
```

## 🎯 Порядок чтения документации

### Для быстрого старта:
1. **QUICK_START.md** - понять суть за 5 минут
2. **SETUP_GUIDE.md** - настроить систему
3. **EXAMPLES.md** - запустить первые примеры

### Для полного понимания:
1. **README.md** - общий план и цели
2. **ARCHITECTURE.md** - техническая архитектура
3. **SETUP_GUIDE.md** - настройка
4. **EXAMPLES.md** - практические примеры
5. **schema.sql** - структура БД
6. **types.ts** - типы данных

### Для реализации:
1. Прочитать **README.md** (план реализации)
2. Настроить по **SETUP_GUIDE.md**
3. Скопировать `*.example.ts` файлы в `src/rag/`
4. Запустить `schema.sql` в Supabase
5. Следовать примерам из **EXAMPLES.md**

## 📊 Статистика проекта

- **Всего файлов**: 14
- **Документация**: 6 файлов (~15,000 слов)
- **Код**: 5 TypeScript модулей (~2,000 строк)
- **SQL**: 1 файл (~500 строк)
- **Конфигурация**: 2 файла

## 🔗 Связи между файлами

```
README.md
   ├── QUICK_START.md (краткая версия)
   ├── SETUP_GUIDE.md (детальная настройка)
   ├── ARCHITECTURE.md (техническая архитектура)
   └── EXAMPLES.md (практические примеры)

schema.sql
   └── types.ts (TypeScript типы для таблиц)

embeddings.example.ts
   └── supabase-client.example.ts (использует embeddings)
       └── rag-integration.example.ts (использует supabase-client)
           └── knowledge-builder.example.ts (использует rag-integration)

env.example
   └── все *.example.ts файлы (читают переменные)
```

## 🎓 Глоссарий

- **RAG** - Retrieval-Augmented Generation (генерация с извлечением контекста)
- **GraphRAG** - RAG с использованием графовых баз данных
- **Embedding** - векторное представление текста (массив чисел)
- **Vector Search** - поиск похожих векторов в БД
- **Cosine Similarity** - мера схожести векторов (0.0 - 1.0)
- **pgvector** - расширение PostgreSQL для векторов
- **IVFFlat** - алгоритм индексации векторов
- **Neo4j** - графовая база данных
- **Cypher** - язык запросов для Neo4j
- **Ollama** - платформа для локальных LLM моделей
- **Graphiti** - фреймворк для динамических графов знаний
- **Cache Hit** - успешное получение данных из кэша
- **Cold Start** - первый запуск без кэша
- **Hot Start** - запуск с прогретым кэшем

## 📊 Новые файлы

### STUDENT_STATS.md
**Назначение**: Статистика и аналитика студентов
**Содержит**:
- Получение статистики из Neo4j (Cypher-запросы)
- Получение статистики из Supabase (векторный поиск)
- Визуализация в Grafana
- Персонализация проверки на основе истории студента
- Рекомендации на основе похожих студентов

### test-single-submission.ts
**Назначение**: Тестовый скрипт для проверки GraphRAG
**Функции**:
- Проверка Ollama и Neo4j
- Создание тестового урока и работы студента
- Извлечение концепций и создание связей
- Сохранение в Supabase (опционально)
- Сбор статистики по студенту
- Визуализация графа

**Запуск**: `ts-node rag-system/test-single-submission.ts`

---

**Навигация готова!** 🎉 Используйте этот файл для быстрого поиска нужной информации.


