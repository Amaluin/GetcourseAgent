# Руководство по исследованию структуры GetCourse

## 📋 Обзор

Этот документ описывает процесс исследования структуры GetCourse платформы для определения селекторов и URL паттернов, необходимых для создания парсера курсов.

## 🎯 Цель исследования

Провести полное исследование структуры GetCourse для определения:
- URL структуры для доступа к курсам, разделам и урокам
- Селекторов для списка курсов, разделов и уроков
- Селекторов для каждого элемента (ID, название, описание, ссылка)
- Паттернов навигации между курсами → разделы → уроки

## 🚀 Запуск исследовательского скрипта

### Предварительные требования

1. Убедитесь, что заполнен файл `.env` с необходимыми учетными данными:
   ```env
   GC_URL=https://your-getcourse-domain.com
   GC_LOGIN=your-email@example.com
   GC_PASSWORD=your-password
   GC_STREAM_URL=https://your-getcourse-domain.com/teach/control/stream/all/answers
   ```

2. Установлены все зависимости:
   ```bash
   npm install
   ```

### Запуск в режиме с видимым браузером

Для наблюдения за процессом исследования в реальном времени:

1. Откройте `src/config.ts` и установите:
   ```typescript
   headless: false
   ```

2. Запустите скрипт:
   ```bash
   npm run research
   ```

### Запуск в headless режиме

Для автоматического исследования без GUI:

1. В `src/config.ts` установите:
   ```typescript
   headless: true
   ```

2. Запустите скрипт:
   ```bash
   npm run research
   ```

## 📊 Что делает скрипт

### 1. Авторизация
- Использует существующую систему авторизации (`auth.ts`)
- Сохраняет сессию для последующих запусков
- Проверяет успешность входа

### 2. Исследование курсов
- Пробует различные селекторы для списка курсов
- Извлекает ID, название, описание и URL курсов
- Логирует примеры HTML структуры
- Сохраняет найденные селекторы

### 3. Исследование разделов
- Пробует различные селекторы для списка разделов
- Извлекает ID, название, порядок и URL разделов
- При наличии курсов, переходит в первый курс для поиска разделов
- Логирует структуру и сохраняет селекторы

### 4. Исследование уроков
- Пробует различные селекторы для списка уроков
- Извлекает ID, название, порядок и URL уроков
- При наличии разделов, переходит в первый раздел для поиска уроков
- Логирует структуру и сохраняет селекторы

### 5. Анализ навигации
- Исследует главное меню и его селекторы
- Ищет хлебные крошки (breadcrumbs)
- Анализирует иерархию навигации
- Находит паттерны URL для навигации

### 6. Исследование различных страниц
Если на текущей странице мало информации, скрипт пробует:
- `/teach/control` - главная админки
- `/teach/control/stream` - тренинги
- `/pl/teach/control/stream` - курсы
- `/teach/control/my-courses` - мои курсы
- `/teach/control/trainings` - мои тренинги

### 7. Сохранение результатов
- Создает `research-results.md` с детальной документацией
- Создает `research-results.json` с структурированными данными
- Логирует итоговую статистику в консоль

## 📄 Формат результатов

### research-results.md
Markdown файл содержит:
- URL структуру (паттерны для курсов, разделов, уроков)
- Найденные селекторы (для курсов, разделов, уроков, навигации)
- Примеры найденных элементов с HTML
- Примечания и наблюдения
- Выводы для Фазы 2 (готовность к созданию парсера)
- Рекомендуемая структура модуля `course-parser.ts`
- Следующие шаги

### research-results.json
JSON файл содержит структурированные данные:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "baseUrl": "https://...",
  "urls": {
    "coursesListUrl": "...",
    "courseUrlPattern": "...",
    "sectionUrlPattern": "...",
    "lessonUrlPattern": "..."
  },
  "selectors": {
    "courses": { ... },
    "sections": { ... },
    "lessons": { ... },
    "navigation": { ... }
  },
  "examples": {
    "courses": [...],
    "sections": [...],
    "lessons": [...]
  },
  "navigation": { ... },
  "notes": [...]
}
```

## 🔍 Интерпретация результатов

### Успешное исследование
Если скрипт нашел:
- ✅ Селекторы для курсов, разделов и уроков
- ✅ Примеры элементов с ID, названиями и URL
- ✅ Паттерны навигации

→ Можно переходить к Фазе 2: создание `course-parser.ts`

### Частичное исследование
Если скрипт нашел только часть информации:
- ⚠️ Проверьте `research-results.md` для деталей
- ⚠️ Возможно, нужно вручную исследовать платформу
- ⚠️ Запустите скрипт с `headless: false` для визуального анализа

### Неуспешное исследование
Если скрипт не нашел селекторы:
- ❌ Проверьте правильность учетных данных в `.env`
- ❌ Проверьте доступность GetCourse платформы
- ❌ Возможно, структура платформы отличается от ожидаемой
- ❌ Требуется ручное исследование

## 🛠️ Ручное исследование

Если автоматическое исследование не дало результатов:

### 1. Запустите с видимым браузером
```bash
# В src/config.ts установите headless: false
npm run research
```

### 2. Исследуйте элементы вручную
- Откройте DevTools (F12) во время работы скрипта
- Найдите элементы курсов/разделов/уроков
- Запишите селекторы и data-атрибуты
- Обновите `research-results.md` вручную

### 3. Используйте отладочные инструменты
```bash
# Интерактивный режим для ручного тестирования
npm run debug

# Инспектор кликов для анализа элементов
npm run inspect
```

## 📝 Следующие шаги после исследования

### Фаза 2: Создание парсера курсов

На основе результатов исследования создайте `src/course-parser.ts`:

```typescript
import { Page } from 'playwright';

export interface Course {
  id: string;
  title: string;
  description?: string;
  url: string;
}

export interface Section {
  id: string;
  title: string;
  order?: number;
  url: string;
  courseId: string;
}

export interface LessonInfo {
  id: string;
  title: string;
  order?: number;
  url: string;
  sectionId: string;
}

/**
 * Get all courses from GetCourse platform
 */
export async function getCourses(page: Page): Promise<Course[]> {
  // TODO: Implement based on research results
  // Use selectors from research-results.json
}

/**
 * Get all sections within a course
 */
export async function getCourseSections(page: Page, courseId: string): Promise<Section[]> {
  // TODO: Implement based on research results
  // Navigate to course and extract sections
}

/**
 * Get all lessons within a section
 */
export async function getSectionLessons(page: Page, sectionId: string): Promise<LessonInfo[]> {
  // TODO: Implement based on research results
  // Navigate to section and extract lessons
}
```

### Интеграция с существующими системами

После создания парсера:
1. Интегрируйте с GraphRAG для хранения структуры курсов
2. Используйте KAG для связывания концепций и уроков
3. Обновите `src/index.ts` для использования нового парсера
4. Добавьте кэширование через Supabase/pgvector

## 🐛 Отладка

### Проблемы с авторизацией
- Проверьте `.env` файл
- Убедитесь, что сессия не истекла
- Удалите `session.json` и попробуйте снова

### Таймауты при загрузке страниц
- Увеличьте таймауты в `research-course-structure.ts`
- Проверьте скорость интернет-соединения
- Попробуйте другие URL паттерны

### Не найдены элементы
- Запустите с `headless: false` для визуального анализа
- Используйте DevTools для поиска правильных селекторов
- Проверьте, что элементы загружаются динамически (JavaScript)

### Ошибки скрипта
- Проверьте логи в консоли
- Просмотрите `research-results.md` для частичных результатов
- Используйте `npm run debug` для интерактивного исследования

## 📚 Дополнительные ресурсы

- [Playwright Documentation](https://playwright.dev/)
- [CSS Selectors Reference](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors)
- [XPath Tutorial](https://www.w3schools.com/xml/xpath_intro.asp)

## 🤝 Вклад в проект

Если вы нашли улучшения для исследовательского скрипта:
1. Обновите `src/research-course-structure.ts`
2. Добавьте новые селекторы или паттерны
3. Улучшите документацию
4. Поделитесь результатами

---

**Удачи в исследовании! 🚀**
