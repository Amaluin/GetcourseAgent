/**
 * Интеграция RAG в процесс проверки домашних заданий
 * 
 * Основной workflow:
 * 1. Получить контекст урока (из кэша или парсить)
 * 2. Найти похожие принятые работы
 * 3. Передать все в AI для проверки
 * 4. Сохранить результат в БД
 */

import { 
  getLessonFromCache, 
  saveLessonToCache,
  findSimilarSubmissions,
  saveSubmission,
  getAssignment,
  saveAssignment
} from './supabase-client.example';
import { createEmbedding, cosineSimilarity } from './embeddings.example';
import { 
  Lesson, 
  Assignment, 
  StudentSubmission,
  RAGContext,
  SubmissionMatch 
} from './types';

// Импорты из основного проекта (будут добавлены при интеграции)
// import { getLessonContent } from '../src/lesson-parser';
// import { checkHomework } from '../src/ai';

// ============================================
// RAG Orchestrator
// ============================================

/**
 * Получить полный контекст для проверки работы с использованием RAG
 */
export async function getRAGContext(
  lessonId: string,
  assignmentId: string,
  submissionText: string
): Promise<RAGContext> {
  const startTime = Date.now();
  let cacheHit = false;

  // 1. Получаем урок (из кэша или парсим)
  let lesson = await getLessonFromCache(lessonId);
  
  if (lesson) {
    console.log(`✅ Урок ${lessonId} найден в кэше`);
    cacheHit = true;
  } else {
    console.log(`📚 Урок ${lessonId} не в кэше, парсим...`);
    
    // Здесь будет вызов getLessonContent из lesson-parser.ts
    // const lessonContent = await getLessonContent(page, lessonId);
    
    // Временная заглушка
    const lessonContent = {
      lessonId,
      title: 'Урок (временная заглушка)',
      textContent: 'Содержимое урока...',
      summary: 'Краткое содержание...',
      videoBlocks: [],
      imageUrls: [],
      fileUrls: [],
      instructions: []
    };

    // Создаем embedding для урока
    const lessonEmbedding = await createEmbedding(
      `${lessonContent.title}\n\n${lessonContent.summary}\n\n${lessonContent.textContent.slice(0, 5000)}`
    );

    // Сохраняем в кэш
    await saveLessonToCache({
      id: lessonId,
      title: lessonContent.title,
      url: `https://university.zerocoder.ru/teach/control/lesson/view/id/${lessonId}`,
      contentText: lessonContent.textContent,
      summary: lessonContent.summary,
      videoUrls: lessonContent.videoBlocks.map(v => v.videoUrl),
      imageUrls: lessonContent.imageUrls,
      fileUrls: lessonContent.fileUrls,
      instructions: lessonContent.instructions
    }, lessonEmbedding);

    // Получаем сохраненный урок
    lesson = await getLessonFromCache(lessonId);
  }

  if (!lesson) {
    throw new Error(`Не удалось получить урок ${lessonId}`);
  }

  // 2. Получаем задание
  let assignment = await getAssignment(assignmentId);
  
  if (!assignment) {
    console.log(`📝 Задание ${assignmentId} не в кэше, создаем...`);
    
    // Здесь будет извлечение данных задания из submission
    // Временная заглушка
    const assignmentData = {
      id: assignmentId,
      lessonId: lessonId,
      title: 'Задание (временная заглушка)',
      description: 'Описание задания...',
      idealAnswer: 'Идеальный ответ...',
      requirements: []
    };

    const assignmentEmbedding = await createEmbedding(
      `${assignmentData.description}\n\n${assignmentData.idealAnswer}`
    );

    await saveAssignment(assignmentData, assignmentEmbedding);
    assignment = await getAssignment(assignmentId);
  }

  if (!assignment) {
    throw new Error(`Не удалось получить задание ${assignmentId}`);
  }

  // 3. Создаем embedding для работы студента
  const submissionEmbedding = await createEmbedding(submissionText);

  // 4. Ищем похожие принятые работы
  const maxSimilarSubmissions = parseInt(process.env.MAX_SIMILAR_SUBMISSIONS || '5');
  const similarSubmissions = await findSimilarSubmissions(
    submissionEmbedding,
    assignmentId,
    maxSimilarSubmissions
  );

  console.log(`🔍 Найдено ${similarSubmissions.length} похожих работ`);

  // 5. Ищем связанные концепции (опционально)
  // const relatedConcepts = await findRelatedConcepts(submissionEmbedding, 10);

  const searchTime = Date.now() - startTime;

  return {
    lesson,
    assignment,
    similarSubmissions,
    relatedConcepts: [], // Пока пусто
    metadata: {
      cacheHit,
      similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.7'),
      searchTime
    }
  };
}

/**
 * Проверить работу студента с использованием RAG
 */
export async function checkHomeworkWithRAG(
  submission: {
    id: string;
    lessonId: string;
    assignmentId: string;
    studentId: string;
    studentName: string;
    submissionText: string;
    imageUrls: string[];
    fileUrls: string[];
  }
): Promise<{ comment: string; status: 'accept' | 'reject' }> {
  console.log(`\n🤖 Проверка работы студента ${submission.studentName} с RAG...`);

  // 1. Получаем полный контекст через RAG
  const context = await getRAGContext(
    submission.lessonId,
    submission.assignmentId,
    submission.submissionText
  );

  console.log(`📊 Контекст получен за ${context.metadata.searchTime}мс (кэш: ${context.metadata.cacheHit ? 'да' : 'нет'})`);

  // 2. Формируем расширенный промпт для AI
  const prompt = buildEnhancedPrompt(
    context,
    submission.studentName,
    submission.submissionText,
    submission.imageUrls
  );

  // 3. Отправляем в AI (здесь будет вызов checkHomework из ai.ts)
  // const result = await checkHomework(submissionWithContext);
  
  // Временная заглушка
  const result = {
    comment: `Здравствуйте, ${submission.studentName}! Работа проверена с использованием RAG.`,
    status: 'accept' as const
  };

  // 4. Создаем embedding для работы
  const submissionEmbedding = await createEmbedding(submission.submissionText);

  // 5. Вычисляем similarity с идеальным ответом
  const idealEmbedding = await createEmbedding(context.assignment.idealAnswer);
  const similarityToIdeal = cosineSimilarity(submissionEmbedding, idealEmbedding);

  console.log(`📈 Similarity с идеальным ответом: ${(similarityToIdeal * 100).toFixed(1)}%`);

  // 6. Сохраняем результат в БД (только если принято)
  if (result.status === 'accept') {
    await saveSubmission(
      {
        id: submission.id,
        assignmentId: submission.assignmentId,
        lessonId: submission.lessonId,
        studentId: submission.studentId,
        studentName: submission.studentName,
        submissionText: submission.submissionText,
        imageUrls: submission.imageUrls,
        fileUrls: submission.fileUrls
      },
      submissionEmbedding,
      'accepted',
      result.comment,
      similarityToIdeal
    );

    console.log(`✅ Принятая работа сохранена в базу знаний`);
  }

  return result;
}

/**
 * Построить расширенный промпт с контекстом RAG
 */
function buildEnhancedPrompt(
  context: RAGContext,
  studentName: string,
  submissionText: string,
  imageUrls: string[]
): string {
  const firstName = studentName.split(' ')[0];

  let prompt = `Ты — опытный преподаватель No-Code автоматизации. Проверь домашнее задание студента.

📚 КОНТЕКСТ УРОКА:
Название: ${context.lesson.title}
Краткое содержание: ${context.lesson.summary}

📝 ЗАДАНИЕ:
${context.assignment.description}

✅ ИДЕАЛЬНЫЙ ОТВЕТ:
${context.assignment.idealAnswer}

`;

  // Добавляем примеры успешных работ
  if (context.similarSubmissions.length > 0) {
    prompt += `\n🎓 ПРИМЕРЫ УСПЕШНЫХ РАБОТ ДРУГИХ СТУДЕНТОВ:\n\n`;
    
    context.similarSubmissions.forEach((example, index) => {
      prompt += `Пример ${index + 1} (схожесть: ${(example.similarity * 100).toFixed(0)}%):\n`;
      prompt += `Работа: ${example.submissionText.slice(0, 500)}${example.submissionText.length > 500 ? '...' : ''}\n`;
      prompt += `Комментарий преподавателя: ${example.aiComment}\n\n`;
    });
  }

  prompt += `\n👨‍🎓 РАБОТА СТУДЕНТА ${studentName.toUpperCase()}:\n`;
  prompt += `${submissionText}\n`;

  if (imageUrls.length > 0) {
    prompt += `\nПрикреплено скриншотов: ${imageUrls.length}\n`;
  }

  prompt += `\n📋 ИНСТРУКЦИИ ПО ПРОВЕРКЕ:
1. Сравни работу студента с идеальным ответом и требованиями задания
2. Обрати внимание на примеры успешных работ других студентов
3. Проверь, выполнены ли все требования
4. Оцени качество выполнения и понимание материала
5. Напиши развернутый комментарий с конкретными замечаниями или похвалой
6. Обращайся к студенту по имени (${firstName})
7. Будь мотивирующим и конструктивным
8. Пиши ТОЛЬКО на русском языке

Верни ответ строго в формате JSON:
{
  "comment": "Здравствуйте, ${firstName}! [твой комментарий]",
  "status": "accept" или "reject"
}
`;

  return prompt;
}

/**
 * Пример использования
 */
async function example() {
  const testSubmission = {
    id: 'sub-123',
    lessonId: '345069174',
    assignmentId: 'assign-456',
    studentId: 'student-789',
    studentName: 'Иван Петров',
    submissionText: 'Я настроил GitHub Actions для автоматической сборки проекта...',
    imageUrls: ['https://example.com/screenshot1.png'],
    fileUrls: []
  };

  const result = await checkHomeworkWithRAG(testSubmission);
  
  console.log('\n📝 РЕЗУЛЬТАТ ПРОВЕРКИ:');
  console.log(`Статус: ${result.status}`);
  console.log(`Комментарий: ${result.comment}`);
}

// Раскомментируйте для тестирования
// example();

// ============================================
// Экспорты для интеграции в основной проект
// ============================================

export {
  getRAGContext,
  checkHomeworkWithRAG,
  buildEnhancedPrompt
};





