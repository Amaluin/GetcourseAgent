# 📚 План парсинга курсов и загрузки в KAG

## 🎯 Цель проекта

Создать систему для автоматического парсинга выбранных курсов из GetCourse:
- Навигация по курсам и разделам
- Парсинг всех уроков с автоматическим раскрытием текстов
- Создание детальных embeddings для каждого урока
- Загрузка в KAG систему со всеми связями между уроками, концепциями и разделами

---

## 📋 Пошаговый план реализации

### Фаза 1: Исследование и проектирование (1-2 дня)

#### 1.1. Изучение структуры GetCourse
- [ ] Определить URL структуру курсов
- [ ] Найти селекторы для списка курсов
- [ ] Найти селекторы для разделов внутри курса
- [ ] Найти селекторы для уроков внутри раздела
- [ ] Проанализировать навигацию (хлебные крошки, меню)

#### 1.2. Проектирование структуры данных
- [ ] Определить модель Course (курс)
- [ ] Определить модель Section (раздел)
- [ ] Расширить модель Lesson (урок) - уже есть
- [ ] Определить связи между сущностями

#### 1.3. Проектирование KAG схемы
- [ ] Добавить сущность Course в KAG схему
- [ ] Добавить сущность Section в KAG схему
- [ ] Определить отношения:
  - `Course -[:HAS_SECTION]-> Section`
  - `Section -[:CONTAINS]-> Lesson`
  - `Course -[:TEACHES]-> Concept`
  - `Section -[:COVERS]-> Concept`
  - `Lesson -[:TEACHES]-> Concept` (уже есть)

---

### Фаза 2: Создание парсера курсов (2-3 дня)

#### 2.1. Модуль `src/course-parser.ts`

```typescript
// Интерфейсы
interface Course {
  id: string;
  title: string;
  description?: string;
  url: string;
  sections: Section[];
}

interface Section {
  id: string;
  courseId: string;
  title: string;
  order: number;
  url: string;
  lessons: LessonInfo[];
}

interface LessonInfo {
  id: string;
  sectionId: string;
  title: string;
  order: number;
  url: string;
}

// Основные функции
async function getCourses(page: Page): Promise<Course[]>
async function getCourseSections(page: Page, courseId: string): Promise<Section[]>
async function getSectionLessons(page: Page, sectionId: string): Promise<LessonInfo[]>
```

**Задачи:**
- [ ] Функция `getCourses()` - получить список всех курсов
- [ ] Функция `getCourseSections()` - получить разделы курса
- [ ] Функция `getSectionLessons()` - получить уроки раздела
- [ ] Функция `parseCourseStructure()` - полный парсинг структуры курса

#### 2.2. Интеграция с существующим `lesson-parser.ts`
- [ ] Использовать существующую функцию `getLessonContent()`
- [ ] Добавить поддержку контекста курса и раздела
- [ ] Сохранять метаданные (courseId, sectionId) в LessonContent

---

### Фаза 3: Создание embeddings (1-2 дня)

#### 3.1. Улучшение системы embeddings

**Текущее состояние:**
- Есть базовая система embeddings в `src/graphrag/embeddings.ts`
- Используется Ollama или OpenAI

**Улучшения:**
- [ ] Создать детальные embeddings для каждой секции урока
- [ ] Создать embeddings для концепций, извлеченных из урока
- [ ] Создать embeddings для связей между уроками
- [ ] Оптимизировать размер чанков для лучшего качества

#### 3.2. Модуль `src/embeddings-generator.ts`

```typescript
interface DetailedEmbedding {
  lessonId: string;
  sectionId: string;
  courseId: string;
  embeddings: {
    fullText: number[];
    sections: Array<{
      sectionNumber: number;
      embedding: number[];
    }>;
    concepts: Array<{
      conceptId: string;
      embedding: number[];
    }>;
  };
}

async function generateDetailedEmbeddings(
  lessonContent: LessonContent,
  courseId: string,
  sectionId: string
): Promise<DetailedEmbedding>
```

**Задачи:**
- [ ] Функция для создания embeddings полного текста урока
- [ ] Функция для создания embeddings каждой секции
- [ ] Функция для создания embeddings концепций
- [ ] Кэширование embeddings (избежать повторных запросов)

---

### Фаза 4: Загрузка в KAG (2-3 дня)

#### 4.1. Расширение KAG схемы

**Файл:** `src/kag/docker/schema/education-schema.json`

Добавить новые сущности:
```json
{
  "entities": [
    {
      "name": "Course",
      "properties": [
        {"name": "id", "type": "String", "required": true},
        {"name": "title", "type": "String", "required": true},
        {"name": "description", "type": "String"},
        {"name": "url", "type": "String"}
      ]
    },
    {
      "name": "Section",
      "properties": [
        {"name": "id", "type": "String", "required": true},
        {"name": "courseId", "type": "String", "required": true},
        {"name": "title", "type": "String", "required": true},
        {"name": "order", "type": "Integer"},
        {"name": "url", "type": "String"}
      ]
    }
  ],
  "relations": [
    {
      "name": "HAS_SECTION",
      "from": "Course",
      "to": "Section"
    },
    {
      "name": "CONTAINS",
      "from": "Section",
      "to": "Lesson"
    }
  ]
}
```

**Задачи:**
- [ ] Обновить education-schema.json
- [ ] Добавить методы в EducationKAGAdapter для Course и Section
- [ ] Протестировать загрузку схемы

#### 4.2. Модуль `src/kag-course-loader.ts`

```typescript
interface CourseLoaderConfig {
  selectedCourseIds?: string[]; // Если пусто - все курсы
  skipExisting?: boolean; // Пропускать уже загруженные уроки
  generateEmbeddings?: boolean;
  extractConcepts?: boolean;
}

class CourseLoader {
  async loadCourse(courseId: string, config: CourseLoaderConfig): Promise<void>
  async loadSection(sectionId: string, courseId: string): Promise<void>
  async loadLesson(lessonId: string, sectionId: string, courseId: string): Promise<void>
  async createRelations(lessonId: string, sectionId: string, courseId: string): Promise<void>
}
```

**Задачи:**
- [ ] Класс CourseLoader для координации загрузки
- [ ] Метод загрузки курса со всеми разделами и уроками
- [ ] Метод создания связей между сущностями
- [ ] Обработка ошибок и retry логика
- [ ] Прогресс-бар и логирование

#### 4.3. Извлечение концепций

**Использовать существующую функцию:**
- `GraphRAG.extractAndAddConcepts()` - уже есть

**Улучшения:**
- [ ] Извлекать концепции из каждого урока
- [ ] Создавать связи между концепциями разных уроков
- [ ] Определять предварительные требования (prerequisites)
- [ ] Группировать похожие концепции

---

### Фаза 5: Главный скрипт (1 день)

#### 5.1. Создание `src/parse-courses.ts`

```typescript
async function main() {
  // 1. Инициализация
  const browser = await initBrowser();
  const page = await browser.newPage();
  await loginToGetCourse(page);
  
  // 2. Инициализация KAG
  const kagAdapter = new EducationKAGAdapterImpl();
  await kagAdapter.initialize();
  
  // 3. Конфигурация
  const config: CourseLoaderConfig = {
    selectedCourseIds: process.env.SELECTED_COURSES?.split(',') || [],
    skipExisting: true,
    generateEmbeddings: true,
    extractConcepts: true
  };
  
  // 4. Парсинг курсов
  const courses = await getCourses(page);
  const selectedCourses = config.selectedCourseIds.length > 0
    ? courses.filter(c => config.selectedCourseIds.includes(c.id))
    : courses;
  
  // 5. Загрузка каждого курса
  const loader = new CourseLoader(kagAdapter);
  for (const course of selectedCourses) {
    await loader.loadCourse(course.id, config);
  }
  
  // 6. Закрытие
  await kagAdapter.close();
  await closeBrowser();
}
```

**Задачи:**
- [ ] Создать главный скрипт
- [ ] Добавить переменные окружения для выбора курсов
- [ ] Добавить обработку ошибок
- [ ] Добавить логирование прогресса

#### 5.2. Добавить скрипт в package.json

```json
{
  "scripts": {
    "parse-courses": "ts-node src/parse-courses.ts"
  }
}
```

---

### Фаза 6: Тестирование и оптимизация (1-2 дня)

#### 6.1. Тестирование
- [ ] Протестировать парсинг одного курса
- [ ] Протестировать парсинг раздела
- [ ] Протестировать парсинг урока
- [ ] Протестировать загрузку в KAG
- [ ] Протестировать создание связей

#### 6.2. Оптимизация
- [ ] Оптимизировать скорость парсинга (параллельная обработка)
- [ ] Оптимизировать создание embeddings (батчинг)
- [ ] Добавить кэширование
- [ ] Оптимизировать запросы к KAG API

---

## 🏗️ Схема реализации

### Архитектура системы

```
┌─────────────────────────────────────────────────────────────┐
│                    GetCourse Platform                        │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │  Course  │───▶│ Section  │───▶│  Lesson  │             │
│  └──────────┘    └──────────┘    └──────────┘             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Playwright (парсинг)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Course Parser Module                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │  course-parser.ts                                   │   │
│  │  - getCourses()                                     │   │
│  │  - getCourseSections()                             │   │
│  │  - getSectionLessons()                              │   │
│  └────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────┐   │
│  │  lesson-parser.ts (существующий)                   │   │
│  │  - getLessonContent()                              │   │
│  │  - expandAllHiddenBlocks()                         │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           Embeddings Generator Module                        │
│  ┌────────────────────────────────────────────────────┐   │
│  │  embeddings-generator.ts                           │   │
│  │  - generateDetailedEmbeddings()                    │   │
│  │  - createSectionEmbeddings()                       │   │
│  │  - createConceptEmbeddings()                       │   │
│  └────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────┐   │
│  │  graphrag/embeddings.ts (существующий)              │   │
│  │  - EmbeddingManager                                │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              KAG Course Loader Module                        │
│  ┌────────────────────────────────────────────────────┐   │
│  │  kag-course-loader.ts                               │   │
│  │  - CourseLoader.loadCourse()                        │   │
│  │  - CourseLoader.loadSection()                       │   │
│  │  - CourseLoader.loadLesson()                         │   │
│  │  - CourseLoader.createRelations()                   │   │
│  └────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────┐   │
│  │  kag/client/EducationKAGAdapter.ts (существующий)    │   │
│  │  - addLesson()                                       │   │
│  │  - addConcept()                                      │   │
│  │  - addRelation()                                     │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    KAG System (OpenSPG)                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  Course  │───▶│ Section  │───▶│  Lesson  │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│       │                │                │                    │
│       └────────────────┼────────────────┘                   │
│                        │                                    │
│                        ▼                                    │
│                  ┌──────────┐                               │
│                  │ Concept  │                               │
│                  └──────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

### Поток данных

```
1. Пользователь запускает скрипт
   ↓
2. Инициализация браузера и авторизация
   ↓
3. Получение списка курсов (или выбранных)
   ↓
4. Для каждого курса:
   ├─▶ Получение разделов
   │   ↓
   │   Для каждого раздела:
   │   ├─▶ Получение уроков
   │   │   ↓
   │   │   Для каждого урока:
   │   │   ├─▶ Парсинг содержимого (раскрытие блоков)
   │   │   ├─▶ Создание детальных секций
   │   │   ├─▶ Генерация embeddings
   │   │   ├─▶ Извлечение концепций
   │   │   └─▶ Загрузка в KAG
   │   │
   │   └─▶ Создание связей Section → Lesson
   │
   └─▶ Создание связей Course → Section
   
5. Создание связей между концепциями
   ↓
6. Завершение и закрытие соединений
```

### Структура данных в KAG

```
Course
  ├─ id: "course-123"
  ├─ title: "Основы программирования"
  ├─ description: "..."
  └─ HAS_SECTION ──▶ Section
                       ├─ id: "section-456"
                       ├─ title: "Введение в Python"
                       ├─ order: 1
                       └─ CONTAINS ──▶ Lesson
                                         ├─ id: "lesson-789"
                                         ├─ title: "Переменные и типы"
                                         ├─ content: "..."
                                         ├─ summary: "..."
                                         ├─ embeddings: [...]
                                         ├─ detailedSections: [...]
                                         └─ TEACHES ──▶ Concept
                                                          ├─ id: "concept-var"
                                                          ├─ name: "Переменные"
                                                          └─ description: "..."
```

---

## 📝 Детальный план реализации

### Шаг 1: Исследование структуры GetCourse

**Файл:** `src/research-course-structure.ts` (временный, для исследования)

```typescript
// Исследовать:
// 1. URL курсов: /teach/control/stream/list или /pl/teach/control/stream/list
// 2. Селекторы для списка курсов
// 3. Селекторы для разделов
// 4. Селекторы для уроков
```

**Задачи:**
- [ ] Создать временный скрипт для исследования
- [ ] Определить все необходимые селекторы
- [ ] Сохранить результаты в документацию

### Шаг 2: Создание базового парсера курсов

**Файл:** `src/course-parser.ts`

**Функции:**
1. `getCourses(page: Page): Promise<Course[]>`
   - Переход на страницу списка курсов
   - Парсинг всех курсов
   - Извлечение ID, названия, URL

2. `getCourseSections(page: Page, courseId: string): Promise<Section[]>`
   - Переход на страницу курса
   - Парсинг разделов
   - Извлечение ID, названия, порядка, URL

3. `getSectionLessons(page: Page, sectionId: string): Promise<LessonInfo[]>`
   - Переход на страницу раздела
   - Парсинг уроков
   - Извлечение ID, названия, порядка, URL

### Шаг 3: Интеграция с парсером уроков

**Модификация:** `src/lesson-parser.ts`

**Изменения:**
- Добавить параметры `courseId` и `sectionId` в `getLessonContent()`
- Сохранять эти параметры в `LessonContent`

### Шаг 4: Создание генератора embeddings

**Файл:** `src/embeddings-generator.ts`

**Функции:**
1. `generateDetailedEmbeddings(lessonContent, courseId, sectionId)`
   - Создать embedding для полного текста
   - Создать embeddings для каждой секции
   - Создать embeddings для концепций

2. `createSectionEmbeddings(sections)`
   - Обработать каждую секцию
   - Создать векторное представление

3. `createConceptEmbeddings(concepts)`
   - Обработать каждую концепцию
   - Создать векторное представление

### Шаг 5: Расширение KAG схемы

**Файл:** `src/kag/docker/schema/education-schema.json`

**Добавить:**
- Entity: Course
- Entity: Section
- Relation: HAS_SECTION (Course → Section)
- Relation: CONTAINS (Section → Lesson)

### Шаг 6: Создание загрузчика в KAG

**Файл:** `src/kag-course-loader.ts`

**Класс:** `CourseLoader`

**Методы:**
1. `loadCourse(courseId, config)`
   - Загрузить курс в KAG
   - Загрузить все разделы
   - Загрузить все уроки
   - Создать связи

2. `loadSection(sectionId, courseId)`
   - Загрузить раздел в KAG
   - Загрузить все уроки раздела
   - Создать связи Section → Lesson

3. `loadLesson(lessonId, sectionId, courseId)`
   - Загрузить урок в KAG
   - Загрузить embeddings
   - Извлечь концепции
   - Создать связи Lesson → Concept

4. `createRelations(lessonId, sectionId, courseId)`
   - Создать все связи между сущностями

### Шаг 7: Главный скрипт

**Файл:** `src/parse-courses.ts`

**Логика:**
1. Инициализация браузера и KAG
2. Получение списка курсов
3. Фильтрация выбранных курсов (если указаны)
4. Для каждого курса:
   - Загрузка через CourseLoader
   - Логирование прогресса
5. Завершение

### Шаг 8: Переменные окружения

**Файл:** `.env`

**Добавить:**
```ini
# Выбранные курсы для парсинга (через запятую, пусто = все курсы)
SELECTED_COURSES=course-id-1,course-id-2

# Настройки парсинга
SKIP_EXISTING_LESSONS=true
GENERATE_EMBEDDINGS=true
EXTRACT_CONCEPTS=true

# Настройки KAG
KAG_ENABLED=true
```

---

## 🔧 Технические детали

### Селекторы GetCourse (предположительные, требуют исследования)

```typescript
// Курсы
const COURSE_SELECTORS = {
  list: '.stream-list, .course-list, [data-stream-list]',
  item: '.stream-item, .course-item, [data-stream-id]',
  title: '.stream-title, .course-title',
  id: '[data-stream-id], [data-course-id]'
};

// Разделы
const SECTION_SELECTORS = {
  list: '.section-list, .module-list, [data-section-list]',
  item: '.section-item, .module-item, [data-section-id]',
  title: '.section-title, .module-title',
  id: '[data-section-id], [data-module-id]'
};

// Уроки
const LESSON_SELECTORS = {
  list: '.lesson-list, [data-lesson-list]',
  item: '.lesson-item, [data-lesson-id]',
  title: '.lesson-title',
  id: '[data-lesson-id]'
};
```

### Структура Course в KAG

```typescript
interface CourseEntity {
  id: string;              // ID курса из GetCourse
  title: string;            // Название курса
  description?: string;     // Описание курса
  url: string;              // URL курса
  createdAt: Date;          // Дата создания
  updatedAt: Date;          // Дата обновления
}
```

### Структура Section в KAG

```typescript
interface SectionEntity {
  id: string;              // ID раздела из GetCourse
  courseId: string;         // ID родительского курса
  title: string;            // Название раздела
  order: number;            // Порядок в курсе
  url: string;              // URL раздела
  createdAt: Date;
  updatedAt: Date;
}
```

### Связи в KAG

```typescript
// Course → Section
{
  type: 'HAS_SECTION',
  from: courseId,
  to: sectionId,
  order: number
}

// Section → Lesson
{
  type: 'CONTAINS',
  from: sectionId,
  to: lessonId,
  order: number
}

// Lesson → Concept (уже существует)
{
  type: 'TEACHES',
  from: lessonId,
  to: conceptId,
  strength: number
}
```

---

## 📊 Ожидаемые результаты

### После реализации:

1. **Автоматический парсинг курсов**
   - Возможность выбрать курсы для парсинга
   - Автоматическое извлечение структуры (курсы → разделы → уроки)

2. **Детальные embeddings**
   - Embeddings для каждого урока
   - Embeddings для каждой секции урока
   - Embeddings для концепций

3. **Полная база знаний в KAG**
   - Все курсы, разделы и уроки
   - Все связи между сущностями
   - Все концепции и их связи

4. **Возможности поиска**
   - Поиск по курсам
   - Поиск по разделам
   - Поиск по урокам
   - Семантический поиск по содержимому

---

## 🚀 Запуск

### После реализации:

```bash
# Парсинг всех курсов
npm run parse-courses

# Парсинг выбранных курсов (через .env)
SELECTED_COURSES=course-1,course-2 npm run parse-courses
```

---

## ⚠️ Важные замечания

1. **Скорость парсинга**
   - Парсинг может занять много времени для больших курсов
   - Рекомендуется парсить курсы постепенно
   - Использовать `SKIP_EXISTING_LESSONS=true` для пропуска уже загруженных

2. **Ограничения API**
   - Следить за лимитами API для embeddings
   - Использовать батчинг для оптимизации

3. **Обработка ошибок**
   - Реализовать retry логику
   - Сохранять прогресс для возможности продолжения

4. **Тестирование**
   - Начинать с одного курса
   - Тестировать на небольшом количестве уроков
   - Постепенно масштабировать

---

## 📅 Оценка времени

- **Фаза 1:** 1-2 дня
- **Фаза 2:** 2-3 дня
- **Фаза 3:** 1-2 дня
- **Фаза 4:** 2-3 дня
- **Фаза 5:** 1 день
- **Фаза 6:** 1-2 дня

**Итого:** 8-13 дней

---

## ✅ Чек-лист готовности

- [ ] Исследована структура GetCourse
- [ ] Создан парсер курсов
- [ ] Создан парсер разделов
- [ ] Интегрирован с парсером уроков
- [ ] Создан генератор embeddings
- [ ] Расширена KAG схема
- [ ] Создан загрузчик в KAG
- [ ] Создан главный скрипт
- [ ] Протестировано на одном курсе
- [ ] Протестировано на нескольких курсах
- [ ] Оптимизирована производительность
- [ ] Создана документация

---

**Дата создания:** 2024
**Версия:** 1.0

