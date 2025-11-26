/**
 * Knowledge Builder - сбор базы знаний из принятых работ студентов
 * 
 * Этот скрипт:
 * 1. Получает все проверенные работы по уроку
 * 2. Фильтрует только принятые работы
 * 3. Векторизует их
 * 4. Сохраняет в Supabase
 * 5. (Опционально) Извлекает концепции и строит граф
 */

import { Page } from 'playwright';
import { 
  getAcceptedSubmissions,
  saveSubmission,
  getLessonFromCache,
  saveLessonToCache
} from './supabase-client.example';
import { createEmbedding, batchCreateEmbeddings, cosineSimilarity } from './embeddings.example';
import { KnowledgeBuilderOptions, KnowledgeBuilderResult } from './types';

// Импорты из основного проекта (будут добавлены при интеграции)
// import { initBrowser, closeBrowser } from '../src/browser';
// import { loginToGetCourse } from '../src/auth';
// import { getLessonContent } from '../src/lesson-parser';

/**
 * Собрать базу знаний для урока
 */
export async function buildKnowledgeBase(
  options: KnowledgeBuilderOptions
): Promise<KnowledgeBuilderResult> {
  const startTime = Date.now();
  const result: KnowledgeBuilderResult = {
    lessonsProcessed: 0,
    submissionsProcessed: 0,
    conceptsExtracted: 0,
    graphNodesCreated: 0,
    graphEdgesCreated: 0,
    processingTime: 0,
    errors: []
  };

  console.log(`\n🏗️ Начинаю сбор базы знаний для урока ${options.lessonId}...`);

  try {
    // 1. Инициализируем браузер
    // const { browser, context, page } = await initBrowser();
    // await loginToGetCourse(page);

    // 2. Получаем или парсим урок
    let lesson = await getLessonFromCache(options.lessonId);
    
    if (!lesson) {
      console.log(`📚 Парсим урок ${options.lessonId}...`);
      
      // const lessonContent = await getLessonContent(page, options.lessonId);
      // const lessonEmbedding = await createEmbedding(
      //   `${lessonContent.title}\n\n${lessonContent.summary}\n\n${lessonContent.textContent.slice(0, 5000)}`
      // );
      
      // await saveLessonToCache({
      //   id: options.lessonId,
      //   title: lessonContent.title,
      //   url: `https://university.zerocoder.ru/teach/control/lesson/view/id/${options.lessonId}`,
      //   contentText: lessonContent.textContent,
      //   summary: lessonContent.summary,
      //   videoUrls: lessonContent.videoBlocks.map(v => v.videoUrl),
      //   imageUrls: lessonContent.imageUrls,
      //   fileUrls: lessonContent.fileUrls,
      //   instructions: lessonContent.instructions
      // }, lessonEmbedding);

      result.lessonsProcessed++;
    }

    // 3. Получаем все работы по уроку через парсинг
    console.log(`📥 Получаю все работы по уроку...`);
    
    // Здесь будет парсинг всех работ через GetCourse
    // const allSubmissions = await getAllSubmissionsForLesson(page, options.lessonId);
    
    // Временная заглушка
    const allSubmissions: any[] = [];

    console.log(`✅ Найдено ${allSubmissions.length} работ`);

    // 4. Фильтруем только принятые работы
    const acceptedSubmissions = options.includeRejected 
      ? allSubmissions 
      : allSubmissions.filter(s => s.status === 'accepted');

    console.log(`✅ Из них принятых: ${acceptedSubmissions.length}`);

    if (acceptedSubmissions.length === 0) {
      console.log(`⚠️ Нет принятых работ для обработки`);
      return result;
    }

    // 5. Векторизуем все работы батчами
    console.log(`🔄 Векторизую ${acceptedSubmissions.length} работ...`);
    
    const submissionTexts = acceptedSubmissions.map(s => s.submissionText);
    const embeddings = await batchCreateEmbeddings(submissionTexts, 10);

    // 6. Вычисляем similarity с идеальным ответом (если есть)
    let idealEmbedding: number[] | null = null;
    if (acceptedSubmissions[0]?.idealAnswer) {
      idealEmbedding = await createEmbedding(acceptedSubmissions[0].idealAnswer);
    }

    // 7. Сохраняем в БД
    console.log(`💾 Сохраняю работы в БД...`);
    
    for (let i = 0; i < acceptedSubmissions.length; i++) {
      const submission = acceptedSubmissions[i];
      const embedding = embeddings[i];

      if (!embedding || embedding.length === 0) {
        result.errors.push(`Не удалось создать embedding для работы ${submission.id}`);
        continue;
      }

      // Вычисляем similarity
      let similarityToIdeal: number | undefined;
      if (idealEmbedding) {
        similarityToIdeal = cosineSimilarity(embedding, idealEmbedding);
      }

      // Сохраняем
      const saved = await saveSubmission(
        {
          id: submission.id,
          assignmentId: submission.assignmentId,
          lessonId: options.lessonId,
          studentId: submission.studentId,
          studentName: submission.studentName,
          submissionText: submission.submissionText,
          imageUrls: submission.imageUrls || [],
          fileUrls: submission.fileUrls || []
        },
        embedding,
        submission.status,
        submission.aiComment,
        similarityToIdeal
      );

      if (saved) {
        result.submissionsProcessed++;
      } else {
        result.errors.push(`Не удалось сохранить работу ${submission.id}`);
      }

      // Прогресс
      if ((i + 1) % 10 === 0) {
        console.log(`   Обработано ${i + 1}/${acceptedSubmissions.length}`);
      }
    }

    // 8. Извлекаем концепции (если включено)
    if (options.extractConcepts) {
      console.log(`🧠 Извлекаю концепции из урока...`);
      const concepts = await extractConceptsFromLesson(options.lessonId);
      result.conceptsExtracted = concepts.length;
    }

    // 9. Строим граф (если включено)
    if (options.buildGraph) {
      console.log(`🕸️ Строю граф связей...`);
      // const graphResult = await buildKnowledgeGraph(options.lessonId);
      // result.graphNodesCreated = graphResult.nodesCreated;
      // result.graphEdgesCreated = graphResult.edgesCreated;
    }

    result.processingTime = Date.now() - startTime;

    console.log(`\n✅ База знаний собрана!`);
    console.log(`   Уроков обработано: ${result.lessonsProcessed}`);
    console.log(`   Работ сохранено: ${result.submissionsProcessed}`);
    console.log(`   Концепций извлечено: ${result.conceptsExtracted}`);
    console.log(`   Время: ${(result.processingTime / 1000).toFixed(1)}с`);
    
    if (result.errors.length > 0) {
      console.log(`   ⚠️ Ошибок: ${result.errors.length}`);
    }

    // await closeBrowser(browser);

  } catch (error) {
    console.error('❌ Ошибка при сборе базы знаний:', error);
    result.errors.push(String(error));
  }

  return result;
}

/**
 * Извлечь концепции из урока с помощью AI
 */
async function extractConceptsFromLesson(lessonId: string): Promise<string[]> {
  const lesson = await getLessonFromCache(lessonId);
  
  if (!lesson) {
    console.warn(`⚠️ Урок ${lessonId} не найден в кэше`);
    return [];
  }

  // Здесь будет вызов AI для извлечения концепций
  // Промпт: "Извлеки из этого урока ключевые концепции, инструменты, платформы..."
  
  // Временная заглушка
  const concepts = [
    'GitHub Actions',
    'CI/CD',
    'Docker',
    'Автоматизация'
  ];

  console.log(`   Найдено концепций: ${concepts.length}`);
  
  return concepts;
}

/**
 * Получить все работы по уроку (парсинг GetCourse)
 */
async function getAllSubmissionsForLesson(
  page: Page,
  lessonId: string
): Promise<any[]> {
  // Здесь будет логика парсинга всех работ по уроку
  // Нужно:
  // 1. Перейти на страницу проверки заданий
  // 2. Отфильтровать по lessonId
  // 3. Пройтись по всем страницам пагинации
  // 4. Собрать все работы

  console.log(`   Парсинг работ для урока ${lessonId}...`);
  
  // Временная заглушка
  return [];
}

/**
 * Построить граф знаний
 */
async function buildKnowledgeGraph(lessonId: string): Promise<{
  nodesCreated: number;
  edgesCreated: number;
}> {
  // Здесь будет логика построения графа:
  // 1. Создать узлы: Урок, Задания, Работы, Концепции
  // 2. Создать связи:
  //    - Урок -> Задание (CONTAINS)
  //    - Задание -> Работа (HAS_SUBMISSION)
  //    - Урок -> Концепция (TEACHES)
  //    - Работа -> Концепция (USES)
  //    - Работа -> Работа (SIMILAR_TO)

  return {
    nodesCreated: 0,
    edgesCreated: 0
  };
}

/**
 * CLI для запуска сбора базы знаний
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
📚 Knowledge Builder для GetCourse Agent

Использование:
  npm run build-knowledge -- --lesson-id=<ID> [опции]

Опции:
  --lesson-id=<ID>        ID урока (обязательно)
  --include-rejected      Включить отклоненные работы
  --extract-concepts      Извлечь концепции из урока
  --build-graph           Построить граф знаний
  --min-similarity=<N>    Минимальная схожесть (0.0-1.0)

Примеры:
  npm run build-knowledge -- --lesson-id=345069174
  npm run build-knowledge -- --lesson-id=345069174 --extract-concepts --build-graph
    `);
    return;
  }

  // Парсим аргументы
  const options: KnowledgeBuilderOptions = {
    lessonId: '',
    includeRejected: false,
    extractConcepts: false,
    buildGraph: false,
    minSimilarity: 0.7
  };

  args.forEach(arg => {
    if (arg.startsWith('--lesson-id=')) {
      options.lessonId = arg.split('=')[1];
    } else if (arg === '--include-rejected') {
      options.includeRejected = true;
    } else if (arg === '--extract-concepts') {
      options.extractConcepts = true;
    } else if (arg === '--build-graph') {
      options.buildGraph = true;
    } else if (arg.startsWith('--min-similarity=')) {
      options.minSimilarity = parseFloat(arg.split('=')[1]);
    }
  });

  if (!options.lessonId) {
    console.error('❌ Не указан lesson-id');
    process.exit(1);
  }

  // Запускаем сбор
  const result = await buildKnowledgeBase(options);

  // Выводим результат
  console.log('\n📊 ИТОГОВАЯ СТАТИСТИКА:');
  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length > 0) {
    console.log('\n⚠️ ОШИБКИ:');
    result.errors.forEach((error, i) => {
      console.log(`${i + 1}. ${error}`);
    });
  }
}

// Запуск CLI
if (require.main === module) {
  main().catch(console.error);
}

export {
  buildKnowledgeBase,
  extractConceptsFromLesson,
  getAllSubmissionsForLesson,
  buildKnowledgeGraph
};





