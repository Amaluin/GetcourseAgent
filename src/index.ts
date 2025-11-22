import { initBrowser, closeBrowser, saveSession } from './browser';
import { loginToGetCourse } from './auth';
import { config } from './config';
import { getUncheckedSubmissions, enrichSubmissionWithTaskDetails, postCommentAndVerdict } from './parser';
import { checkHomework } from './ai';

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
      
      // ПОДГРУЖАЕМ ДЕТАЛИ (Текст задания и идеальный ответ) ПЕРЕД ПРОВЕРКОЙ
      // Теперь это происходит последовательно для каждого студента
      await enrichSubmissionWithTaskDetails(submission, page);

      // Спрашиваем AI
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


