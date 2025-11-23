import { initBrowser, closeBrowser, saveSession } from './browser';
import { loginToGetCourse } from './auth';
import { config } from './config';
import { getUncheckedSubmissions, enrichSubmissionWithTaskDetails, postCommentAndVerdict } from './parser';
import { checkHomework } from './ai';
import { getLessonContent } from './lesson-parser';

const DRY_RUN = true; // ⚠️ Если true — мы только читаем и логируем, но не отправляем комментарии

async function main() {
  console.log('🤖 Запуск AI-агента GetCourse...');
  console.log(`🛠 Режим: ${DRY_RUN ? 'TEST (Без действий)' : 'LIVE (Боевой)'}`);

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
          submission.lessonContent = await getLessonContent(page, submission.lessonId);
          console.log(`✅ Урок успешно проанализирован!`);
          
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

      // ШАГ 3: Спрашиваем AI (теперь с контекстом урока)
      const feedback = await checkHomework(submission);
      
      console.log(`🤖 Вердикт AI: ${feedback.status.toUpperCase()}`);
      console.log(`💬 Комментарий: "${feedback.comment}"`);

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


