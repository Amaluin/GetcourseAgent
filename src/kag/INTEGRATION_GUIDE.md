# Руководство по интеграции KAG в основной workflow

Это руководство описывает, как интегрировать KAG систему в основной workflow GetcourseAgent (`src/index.ts`).

## 📋 Шаги интеграции

### 1. Добавить импорты

В начале файла `src/index.ts` добавьте:

```typescript
import { EducationKAGAdapterImpl } from './kag/client/EducationKAGAdapter';
import { logger as kagLogger } from './kag/utils/logger';
```

### 2. Инициализация KAG адаптера

В функции `main()` перед основным циклом добавьте:

```typescript
async function main() {
  // Существующая инициализация...
  await initializeBrowser();
  await loginToGetcourse();

  // Инициализация KAG (новое)
  let kagAdapter: EducationKAGAdapterImpl | null = null;
  const useKAG = process.env.USE_KAG === 'true';

  if (useKAG) {
    try {
      console.log('🔧 Initializing KAG system...');
      kagAdapter = new EducationKAGAdapterImpl();
      await kagAdapter.initialize();
      console.log('✅ KAG system initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize KAG:', error);
      console.log('⚠️  Continuing without KAG...');
    }
  }

  // Основной workflow...
}
```

### 3. Сохранение урока в KAG

После парсинга урока добавьте:

```typescript
// Существующий код парсинга урока
const lessonContent = await getLessonContent(lessonUrl);

// Сохранение в KAG (новое)
if (kagAdapter && lessonContent) {
  try {
    await kagAdapter.addLesson({
      id: lessonId,
      title: lessonContent.title,
      content: lessonContent.fullText,
      summary: lessonContent.summary,
      difficulty: 'intermediate', // Можно определять автоматически
      videoUrls: lessonContent.videoSections.map(v => v.videoUrl)
    });
    kagLogger.success(`Lesson ${lessonId} saved to KAG`);
  } catch (error) {
    kagLogger.error('Failed to save lesson to KAG', error);
  }
}
```

### 4. Сохранение студента в KAG

При первой встрече со студентом:

```typescript
// Проверка, существует ли студент в KAG
if (kagAdapter) {
  const existingStudent = await kagAdapter.getStudent(studentId);
  
  if (!existingStudent) {
    try {
      await kagAdapter.addStudent({
        id: studentId,
        name: studentName,
        level: 'beginner' // Можно определять на основе истории
      });
      kagLogger.success(`Student ${studentId} added to KAG`);
    } catch (error) {
      kagLogger.error('Failed to add student to KAG', error);
    }
  }
}
```

### 5. Сохранение работы в KAG

После получения работы студента:

```typescript
// Существующий код получения работы
const submission = await getSubmission(submissionId);

// Сохранение в KAG (новое)
if (kagAdapter && submission) {
  try {
    await kagAdapter.addSubmission({
      id: submissionId,
      assignment_id: assignmentId,
      student_id: studentId,
      content: submission.text,
      imageUrls: submission.imageUrls,
      status: 'pending'
    });
    kagLogger.success(`Submission ${submissionId} saved to KAG`);
  } catch (error) {
    kagLogger.error('Failed to save submission to KAG', error);
  }
}
```

### 6. Использование контекста из KAG при проверке

Перед проверкой работы получите контекст:

```typescript
// Получение контекста из KAG (новое)
let kagContext = null;
if (kagAdapter) {
  try {
    kagContext = await kagAdapter.getContextForSubmission(submissionId);
    kagLogger.info('KAG context retrieved', {
      concepts: kagContext.relatedConcepts.length,
      resources: kagContext.recommendedResources.length
    });
  } catch (error) {
    kagLogger.warn('Failed to get KAG context', error);
  }
}

// Проверка работы с контекстом
const aiResponse = await checkHomework(
  submission,
  lessonContent,
  kagContext // Передаем контекст в AI
);
```

### 7. Обновление работы после проверки

После получения результата от AI:

```typescript
// Существующий код проверки
const aiResponse = await checkHomework(...);

// Обновление в KAG (новое)
if (kagAdapter && aiResponse) {
  try {
    await kagAdapter.updateSubmission(submissionId, {
      status: aiResponse.status === 'accept' ? 'accepted' : 'rejected',
      feedback: aiResponse.comment,
      score: aiResponse.score,
      checked_at: new Date()
    });
    kagLogger.success(`Submission ${submissionId} updated in KAG`);
  } catch (error) {
    kagLogger.error('Failed to update submission in KAG', error);
  }
}
```

### 8. Закрытие соединения

В конце функции `main()` или в `finally` блоке:

```typescript
try {
  // Основной workflow...
} catch (error) {
  console.error('Error in main workflow:', error);
} finally {
  // Закрытие KAG соединения (новое)
  if (kagAdapter) {
    await kagAdapter.close();
    console.log('🔌 KAG connection closed');
  }
  
  // Существующая очистка...
  await browser.close();
}
```

## 🔧 Переменные окружения

Добавьте в `.env`:

```env
# KAG Configuration
USE_KAG=true
OPENSPG_SERVER_URL=http://localhost:8887
OPENSPG_NEO4J_HOST=localhost
OPENSPG_NEO4J_PORT=7688
OPENSPG_NEO4J_USERNAME=neo4j
OPENSPG_NEO4J_PASSWORD=neo4j@openspg

# KAG Settings
KAG_LOG_LEVEL=info
KAG_CACHE_ENABLED=true
OPENSPG_REASONING_ENABLED=true
```

## 📝 Модификация AI проверки

Обновите функцию `checkHomework` в `src/ai.ts`:

```typescript
import { SubmissionContext } from './kag/types/education-entities';

export async function checkHomework(
  submission: any,
  lessonContent: any,
  kagContext?: SubmissionContext | null // Новый параметр
): Promise<AIFeedback> {
  
  // Базовый промпт
  let prompt = buildBasePrompt(submission, lessonContent);
  
  // Обогащение промпта контекстом из KAG (новое)
  if (kagContext) {
    prompt += `\n\nДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ ИЗ ГРАФА ЗНАНИЙ:\n`;
    
    // Информация о студенте
    prompt += `\nСтудент: ${kagContext.student.name}`;
    prompt += `\nУровень: ${kagContext.student.level || 'не определен'}`;
    prompt += `\nПрогресс: ${kagContext.student.progress || 0}%`;
    
    // Связанные концепции
    if (kagContext.relatedConcepts.length > 0) {
      prompt += `\n\nКлючевые концепции урока:`;
      kagContext.relatedConcepts.forEach(concept => {
        prompt += `\n- ${concept.name}: ${concept.description}`;
      });
    }
    
    // Предварительные условия
    if (kagContext.prerequisites.length > 0) {
      prompt += `\n\nПредварительные знания:`;
      kagContext.prerequisites.forEach(prereq => {
        prompt += `\n- ${prereq.name}`;
      });
    }
    
    // Рекомендуемые ресурсы
    if (kagContext.recommendedResources.length > 0) {
      prompt += `\n\nДополнительные ресурсы:`;
      kagContext.recommendedResources.forEach(resource => {
        prompt += `\n- ${resource.title}: ${resource.url}`;
      });
    }
  }
  
  // Отправка в AI
  const response = await openai.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: "Ты - преподаватель..." },
      { role: "user", content: prompt }
    ]
  });
  
  // Обработка ответа...
}
```

## 🧪 Тестирование интеграции

1. **Запустите OpenSPG**:
   ```bash
   cd src/kag/docker
   ./scripts/start-openspg.sh
   ```

2. **Запустите основной агент с KAG**:
   ```bash
   USE_KAG=true npm run start
   ```

3. **Проверьте логи**:
   - Должны появиться сообщения о сохранении в KAG
   - Проверьте Neo4j Browser: http://localhost:7475

4. **Проверьте данные в Neo4j**:
   ```cypher
   // Все уроки
   MATCH (l:Lesson) RETURN l LIMIT 10
   
   // Все студенты
   MATCH (s:Student) RETURN s LIMIT 10
   
   // Все работы
   MATCH (sub:Submission) RETURN sub LIMIT 10
   
   // Граф связей
   MATCH p=()-[r]->() RETURN p LIMIT 25
   ```

## 🐛 Troubleshooting

### KAG не инициализируется

1. Проверьте, что OpenSPG запущен:
   ```bash
   cd src/kag/docker
   ./scripts/status-openspg.sh
   ```

2. Проверьте переменные окружения:
   ```bash
   echo $USE_KAG
   echo $OPENSPG_SERVER_URL
   ```

### Данные не сохраняются

1. Проверьте логи OpenSPG:
   ```bash
   docker logs openspg-education -f
   ```

2. Проверьте Neo4j:
   ```bash
   docker logs neo4j-education -f
   ```

### Ошибки при получении контекста

Это нормально для MVP - некоторые функции могут не работать до полной настройки OpenSPG. Система продолжит работать без контекста.

## 📚 Дополнительные ресурсы

- [KAG README](./README.md) - Основная документация
- [Test Integration](./test-kag-integration.ts) - Пример использования
- [Types](./types/education-entities.ts) - Все типы данных

## ✅ Чеклист интеграции

- [ ] Добавлены импорты KAG в `src/index.ts`
- [ ] Инициализация KAG адаптера в `main()`
- [ ] Сохранение уроков в KAG
- [ ] Сохранение студентов в KAG
- [ ] Сохранение работ в KAG
- [ ] Получение контекста из KAG
- [ ] Передача контекста в AI
- [ ] Обновление работ после проверки
- [ ] Закрытие соединения в `finally`
- [ ] Добавлены переменные окружения
- [ ] Протестирована интеграция

