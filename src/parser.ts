import { Page } from 'playwright';
import { HomeworkSubmission } from './types';

export async function getUncheckedSubmissions(page: Page): Promise<HomeworkSubmission[]> {
  console.log('👀 Сканируем ленту ответов...');

  console.log('⏳ Ждем 5 секунд для полной подгрузки списков...');
  await page.waitForTimeout(5000);

  console.log('🔍 Ищем задания на странице...');

  // В GetCourse каждое задание — это div.answer_wrapper с data-id
  const answerWrappers = await page.locator('.answer_wrapper[data-id]').all();
  
  // Ограничиваем первыми 2 для теста
  const limitedWrappers = answerWrappers.slice(0, 2);
  
  console.log(`✅ Найдено ${answerWrappers.length} заданий. Обрабатываем первые ${limitedWrappers.length} для теста.`);

  const submissions: HomeworkSubmission[] = [];

  for (const wrapper of limitedWrappers) {
    try {
      // ID задания
      const id = await wrapper.getAttribute('data-id') || '';
      
      // Имя студента
      const studentName = await wrapper.locator('.user-profile-link .text').first().innerText().catch(() => 'Неизвестный студент');
      
      // Текст ответа
      const text = await wrapper.locator('.answer-text').innerText().catch(() => '');
      
      // Комментарии студента (дополнительные сообщения)
      const studentComments = await wrapper.locator('.comment-text').allInnerTexts().catch(() => []);
      const fullText = [text, ...studentComments].filter(t => t.trim()).join('\n\n---\n\n');
      
      // Название урока/задания
      const assignmentTitle = await wrapper.locator('.show-lesson-link').innerText().catch(() => 'Без названия');
      
      // ID урока (из data-lesson-id)
      const lessonId = await wrapper.getAttribute('data-lesson-id') || '';
      
      // Ссылки на файлы и картинки - улучшенный поиск
      const downloadLinks = await wrapper.locator('.answer-files a[href]').evaluateAll(links => 
        links.map(link => link.getAttribute('href') || '').filter(href => href)
      ) as string[];
      
      const imageDownloadLinks = await wrapper.locator('.answer-files img[data-download-link]').evaluateAll(imgs => 
        imgs.map(img => img.getAttribute('data-download-link') || '').filter(href => href)
      ) as string[];
      
      const allLinks = [...downloadLinks, ...imageDownloadLinks].filter(url => url);
      
      const imageUrls = allLinks.filter(url => /\.(jpg|jpeg|png|gif|webp)$/i.test(url));
      const otherFiles = allLinks.filter(url => !/\.(jpg|jpeg|png|gif|webp)$/i.test(url));

      // Проверяем, что задание действительно требует проверки (есть кнопки)
      const hasAcceptButton = await wrapper.locator('button.btn-success, .btn-success').count() > 0;
      
      if (hasAcceptButton && id) {
        submissions.push({
          id,
          studentName,
          text: fullText, // Сохраняем полный текст с комментариями
          imageUrls,
          fileUrls: otherFiles,
          assignmentTitle: assignmentTitle.trim(),
          lessonId: lessonId, // ID урока для загрузки содержимого
          idealAnswer: '', // Заполним позже
          taskDescription: '' // Заполним позже
        });
      }
    } catch (error) {
      console.warn('⚠️ Ошибка при первичном парсинге задания:', error);
    }
  }

  return submissions;
}

export async function enrichSubmissionWithTaskDetails(submission: HomeworkSubmission, page: Page): Promise<void> {
    console.log(`   🔍 Загружаем детали задания для: ${submission.studentName} (ID: ${submission.id})...`);
    
    // Находим wrapper заново
    const wrapper = page.locator(`.answer_wrapper[data-id="${submission.id}"]`).first();
    
    if (await wrapper.count() === 0) {
        console.warn(`   ⚠️ Не удалось найти wrapper для ID ${submission.id}`);
        return;
    }

    try {
        // Открываем "Задание и идеальный ответ"
        const actionsButton = wrapper.locator('button.dropdown-toggle').filter({ hasText: 'Действия' }).first();
        
        // Проверяем видимость кнопки действий
        if (!await actionsButton.isVisible()) {
            console.log('   ⚠️ Кнопка "Действия" не видна, пробуем найти альтернативный путь...');
            // Иногда кнопки скрыты или имеют другой класс
        }
        
        await actionsButton.click({ force: true });
        await page.waitForTimeout(500);
        
        const idealAnswerLink = wrapper.locator('a.show-lesson-mission-modal').first();
        if (await idealAnswerLink.isVisible()) {
            await idealAnswerLink.click();
        } else {
             console.warn('   ⚠️ Ссылка "Задание и идеальный ответ" не найдена в меню!');
             return;
        }
        
        await page.waitForTimeout(2000);
        
        const modal = page.locator('.modal.fade.in:visible, .modal.show:visible, .modal-dialog:visible').last();
        
        if (await modal.isVisible()) {
            console.log('   ✅ Модальное окно открыто');
            
             // Раскрываем спойлеры (аккордеоны)
             const spoilers = modal.locator('.spoiler-title, .ui-accordion-header, .expandable-header, div[onclick*="toggle"], a.spoiler-link');
             const spoilerCount = await spoilers.count();
             if (spoilerCount > 0) {
                 console.log(`   👉 Раскрываем ${spoilerCount} спойлеров...`);
                 for (let i = 0; i < spoilerCount; i++) {
                     const isExpanded = await spoilers.nth(i).evaluate(el => el.classList.contains('active') || el.classList.contains('open'));
                     if (!isExpanded) {
                         await spoilers.nth(i).click({ force: true }).catch(() => {});
                         await page.waitForTimeout(300);
                     }
                 }
             }

             // Раскрываем "Задание X" (специфично для этого случая)
             const taskHeaders = modal.locator('li, div, p, strong, b, span').filter({ hasText: /^Задание \d+\.|^Дополнительное задание/i });
             const taskHeaderCount = await taskHeaders.count();
             if (taskHeaderCount > 0) {
                 console.log(`   👉 Найдено ${taskHeaderCount} заголовков заданий. Кликаем для раскрытия...`);
                 for (let i = 0; i < taskHeaderCount; i++) {
                     await taskHeaders.nth(i).click({ force: true }).catch(() => {});
                     await page.waitForTimeout(300);
                 }
             }

             // Раскрываем "Показать полностью" и стрелочки
             const showMoreButtons = modal.locator('span, a, div, i, strong, b').filter({ hasText: /^Показать полностью$|^Читать далее$|^Развернуть$|↘️|⬇️|👇/i });
             const iconButtons = modal.locator('.glyphicon-share-alt, .fa-angle-down, .fa-caret-down, .fa-chevron-down');
             
             const allExpandButtons = [showMoreButtons, iconButtons];
             for (const buttons of allExpandButtons) {
                 const count = await buttons.count();
                 if (count > 0) {
                     console.log(`   👉 Кликаем на ${count} элементов раскрытия...`);
                     for (let i = 0; i < count; i++) {
                         if (await buttons.nth(i).isVisible()) {
                             await buttons.nth(i).click({ force: true }).catch(() => {});
                             await page.waitForTimeout(200);
                         }
                     }
                 }
             }
             
             await page.waitForTimeout(1000);

             const modalText = await modal.innerText();
             
             // Парсим текст
             const lines = modalText.split('\n');
             let currentSection = '';
             let taskLines: string[] = [];
             let idealLines: string[] = [];
             
             for (const line of lines) {
                 if (line.match(/задание[:\s]/i)) {
                     currentSection = 'task';
                 } else if (line.match(/идеальный ответ[:\s]/i)) {
                     currentSection = 'ideal';
                 } else if (currentSection === 'task') {
                     taskLines.push(line);
                 } else if (currentSection === 'ideal') {
                     idealLines.push(line);
                 }
             }
             
             submission.taskDescription = taskLines.join('\n').trim() || modalText;
             submission.idealAnswer = idealLines.join('\n').trim();
             
             console.log(`   ✅ Данные загружены: Задание (${submission.taskDescription.length} симв.), Ответ (${submission.idealAnswer.length} симв.)`);
             
             // Закрываем
             const closeButton = modal.locator('button.close, .modal-header .close, [data-dismiss="modal"]').first();
             await closeButton.click().catch(() => {});
             await page.waitForTimeout(500);
             
        } else {
            console.warn('   ⚠️ Модальное окно не открылось');
        }

    } catch (error) {
        console.warn('   ⚠️ Ошибка при чтении деталей задания:', error);
    }
}

export async function postCommentAndVerdict(page: Page, submissionId: string, comment: string, status: 'accept' | 'reject' | 'draft') {
    console.log(`📝 Публикуем вердикт для задания ${submissionId}: ${status}`);
    const item = page.locator(`.answer_wrapper[data-id="${submissionId}"]`).first(); // Используем .first() для надежности
    
    // Прокручиваем к элементу, чтобы он был виден
    if (await item.count() > 0) {
        await item.scrollIntoViewIfNeeded();
    } else {
        console.warn(`⚠️ Не найден элемент ответа с ID ${submissionId} для ввода комментария`);
        return;
    }

    console.log(`   🔍 Пытаемся найти поле ввода для ID ${submissionId}...`);

    // 1. Ищем поле по плейсхолдеру "добавить комментарий к ответу" (как подсказал пользователь)
    const placeholderField = item.getByPlaceholder('добавить комментарий к ответу').first();

    if (await placeholderField.count() > 0) {
        console.log('   👉 Нашли поле по placeholder. Кликаем для активации...');
        await placeholderField.click({ force: true });
        await page.waitForTimeout(500);
        
        console.log('   ⌨️ Печатаем комментарий...');
        await placeholderField.fill(comment);
        
        // Проверяем, вписалось ли
        const val = await placeholderField.inputValue();
        if (!val) {
            console.log('   ⚠️ fill() не сработал, пробуем pressSequentially...');
            await placeholderField.pressSequentially(comment, { delay: 5 });
        }
    } else {
        // Fallback: старая логика
        console.warn('   ⚠️ Поле с placeholder "добавить комментарий к ответу" не найдено. Пробуем старый метод...');
        
        const textarea = item.locator('textarea[name="GetCourseComment[comment_text]"]').first();
        // ... (остальной код поиска, если нужно, но скорее всего сработает первый вариант)
        if (await textarea.count() > 0) {
             await textarea.click({ force: true });
             await textarea.fill(comment);
        } else {
             console.error('   ❌ Не удалось найти поле для ввода комментария ни одним способом.');
             return;
        }
    }
    
    if (status === 'accept') {
        await item.locator('.btn-success').click();
    } else if (status === 'reject') {
        await item.locator('.btn-danger').click();
    } else if (status === 'draft') {
        console.log('   ✏️ Комментарий введен, кнопки не нажаты (Draft mode)');
    }
    
    await page.waitForTimeout(1000);
}