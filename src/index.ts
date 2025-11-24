import { initBrowser, closeBrowser, saveSession } from './browser';
import { loginToGetCourse } from './auth';
import { config } from './config';
import { getUncheckedSubmissions, enrichSubmissionWithTaskDetails, postCommentAndVerdict } from './parser';
import { checkHomework } from './ai';
import { getLessonContent } from './lesson-parser';
import * as GraphRAG from './graphrag/neo4j-client';

const DRY_RUN = true; // ⚠️ Если true — мы только читаем и логируем, но не отправляем комментарии
const USE_GRAPHRAG = process.env.GRAPHRAG_ENABLED === 'true'; // Включить GraphRAG

async function main() {
  console.log('🤖 Запуск AI-агента GetCourse...');
  console.log(`🛠 Режим: ${DRY_RUN ? 'TEST (Без действий)' : 'LIVE (Боевой)'}`);
  
  // Инициализация GraphRAG (если включено)
  let graphRAGActive = false;
  if (USE_GRAPHRAG) {
    console.log('🔮 Инициализация GraphRAG...');
    graphRAGActive = await GraphRAG.initGraphRAG();
  }

  const { page } = await initBrowser();

  try {
    // 1. Авторизация
    await loginToGetCourse(page);

    // Сохраняем сессию сразу после успешного входа
    await saveSession();

    // 2. Переход в ленту ответов
    console.log(`navigating to stream: ${config.gcStreamUrl}`);
    await page.goto(config.gcStreamUrl);
    // Используем domcontentloaded, так как networkidle на GC часто вызывает таймаут
    await page.waitForLoadState('domcontentloaded');

    // 3. Поиск заданий
    const submissions = await getUncheckedSubmissions(page);

    if (submissions.length === 0) {
      console.log('📭 Новых ответов не найдено.');
    } else {
      console.log(`found ${submissions.length} submissions`);
    }

    // 4. Обработка каждого задания
    for (const submission of submissions) {
      console.log('--------------------------------------------------');
      console.log(`🎓 Студент: ${submission.studentName}`);
      console.log(`📝 Задание: ${submission.assignmentTitle}`);
      if (submission.text) {
          console.log(`💬 Ответ студента:\n${submission.text}`);
      } else {
          console.log(`💬 Ответ студента: [Текст отсутствует]`);
      }
      
      // ШАГ 1: Загружаем содержимое урока (выжимка)
      if (submission.lessonId) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📚 ШАГ 1: Анализ урока (ID: ${submission.lessonId})`);
        console.log(`${'='.repeat(60)}`);
        
        try {
          // Проверяем, есть ли урок уже в GraphRAG
          let lessonInGraph = false;
          if (graphRAGActive) {
            lessonInGraph = await GraphRAG.lessonExists(submission.lessonId);
            if (lessonInGraph) {
              console.log(`✅ Урок найден в GraphRAG (пропускаю повторный парсинг)`);
            }
          }
          
          // Парсим урок только если его нет в GraphRAG
          if (!lessonInGraph) {
            submission.lessonContent = await getLessonContent(page, submission.lessonId);
            console.log(`✅ Урок успешно проанализирован!`);
            
            // Сохраняем урок в GraphRAG
            if (graphRAGActive && submission.lessonContent) {
              await GraphRAG.addLesson({
                id: submission.lessonId,
                title: submission.lessonContent.title,
                content: submission.lessonContent.fullText,
                summary: submission.lessonContent.summary,
                videoUrls: submission.lessonContent.videoSections.map((v: any) => v.videoUrl),
                imageUrls: submission.lessonContent.imageUrls,
                detailedSections: submission.lessonContent.detailedSections
              });
              
              // Извлекаем и добавляем концепции
              await GraphRAG.extractAndAddConcepts(
                submission.lessonId,
                submission.lessonContent.fullText + ' ' + submission.lessonContent.summary
              );
            }
          }
          
          // Возвращаемся в ленту ответов после просмотра урока
          console.log(`🔙 Возвращаюсь в ленту ответов...`);
          await page.goto(config.gcStreamUrl);
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(1000);
        } catch (error) {
          console.error(`❌ Ошибка при загрузке урока:`, error);
          console.log(`⚠️ Продолжаю проверку без контекста урока...`);
        }
        
        console.log(`${'='.repeat(60)}\n`);
      } else {
        console.log(`⚠️ Урок ID не найден, пропускаю анализ урока`);
      }
      
      // ШАГ 2: Загружаем детали задания (идеальный ответ)
      await enrichSubmissionWithTaskDetails(submission, page);

      // ШАГ 3: Получаем контекст из GraphRAG (если включено)
      let graphRAGContext = '';
      if (graphRAGActive && submission.lessonId) {
        console.log(`🔮 Получаю контекст из базы знаний...`);
        graphRAGContext = await GraphRAG.getLessonContext(
          submission.lessonId,
          submission.text || ''
        );
        
        // Получаем персональные рекомендации для студента
        const recommendations = await GraphRAG.getStudentRecommendations(
          submission.studentName,
          submission.lessonId
        );
        if (recommendations) {
          graphRAGContext += recommendations;
        }
      }

      // ШАГ 4: Спрашиваем AI (теперь с контекстом из базы знаний)
      const feedback = await checkHomework(submission, graphRAGContext);
      
      console.log(`🤖 Вердикт AI: ${feedback.status.toUpperCase()}`);
      console.log(`💬 Комментарий: "${feedback.comment}"`);

      // Сохраняем работу студента в GraphRAG
      if (graphRAGActive && submission.lessonId) {
        await GraphRAG.addSubmission({
          id: submission.id,
          lessonId: submission.lessonId,
          assignmentId: submission.assignmentTitle || 'unknown',
          studentId: '', // Будет сгенерирован автоматически
          studentName: submission.studentName,
          text: submission.text || '',
          status: feedback.status === 'accept' ? 'accepted' : 'rejected',
          imageUrls: submission.imageUrls || []
        });
        
        // Связываем работу с концепциями
        await GraphRAG.linkSubmissionToConcepts(
          submission.id,
          submission.text || ''
        );
        
        // Показываем статистику студента
        const stats = await GraphRAG.getStudentStats(submission.studentName);
        if (stats) {
          console.log(`📊 Статистика студента: ${stats.accepted}/${stats.total} работ принято`);
        }
      }

      if (!DRY_RUN) {
        await postCommentAndVerdict(page, submission.id, feedback.comment, feedback.status);
        console.log('🚀 Отправлено в GetCourse!');
      } else {
        // В режиме DRY_RUN просто заполняем поле, но не жмем кнопки
        await postCommentAndVerdict(page, submission.id, feedback.comment, 'draft'); 
        console.log('✋ Пропуск отправки (DRY_RUN включен, комментарий вписан в поле)');
      }
    }

  } catch (error) {
    console.error('🔥 Критическая ошибка:', error);
  } finally {
    // Закрываем GraphRAG соединение
    if (graphRAGActive) {
      await GraphRAG.closeGraphRAG();
    }
    
    console.log('🏁 Работа завершена.');
    // В режиме отладки можно не закрывать браузер сразу, чтобы посмотреть результат
    if (config.headless) {
        await closeBrowser();
    } else {
        console.log('ℹ️ Браузер оставлен открытым для отладки. Нажмите Ctrl+C в терминале для выхода.');
    }
  }
}

main();


