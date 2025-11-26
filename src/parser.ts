import { Page } from 'playwright';
import { HomeworkSubmission } from './types';
import { config } from './config';

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

  for (let i = 0; i < limitedWrappers.length; i++) {
    const wrapper = limitedWrappers[i];
    console.log(`\n   📝 Обработка задания ${i + 1}/${limitedWrappers.length}...`);
    console.log(`      ⏱️  Начало: ${new Date().toLocaleTimeString()}`);
    
    try {
      // ID задания
      console.log(`      🔍 ШАГ 1: Получаю ID задания...`);
      console.log(`         ⏳ Ожидание атрибута data-id (таймаут 5 сек)...`);
      const idStartTime = Date.now();
      let id = '';
      try {
        id = await Promise.race([
          wrapper.getAttribute('data-id'),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]) || '';
      } catch (error) {
        console.log(`         ⚠️  Таймаут при получении data-id, пробую без таймаута...`);
        id = await wrapper.getAttribute('data-id').catch(() => '') || '';
      }
      const idTime = Date.now() - idStartTime;
      console.log(`         ✅ ID получен за ${idTime}ms: ${id || 'не найден'}`);
      
      // Имя студента и ссылка на профиль
      console.log(`      👤 ШАГ 2: Получаю имя студента...`);
      console.log(`         ⏳ Ожидание элемента .user-profile-link .text (таймаут 5 сек)...`);
      const nameStartTime = Date.now();
      let studentName = 'Неизвестный студент';
      try {
        studentName = await Promise.race([
          wrapper.locator('.user-profile-link .text').first().innerText(),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
      } catch (error) {
        console.log(`         ⚠️  Таймаут при получении имени, пробую без таймаута...`);
        studentName = await wrapper.locator('.user-profile-link .text').first().innerText().catch(() => 'Неизвестный студент');
      }
      const nameTime = Date.now() - nameStartTime;
      console.log(`         ✅ Имя получено за ${nameTime}ms: ${studentName}`);
      
      console.log(`      🔗 ШАГ 3: Получаю ссылку на профиль студента...`);
      console.log(`         ⏳ Ищу ссылку через JavaScript...`);
      const linkStartTime = Date.now();
      let studentUrl: string | undefined = undefined;
      
      try {
        // Используем JavaScript для поиска ссылки внутри wrapper
        // Структура: .user-profile-link содержит <a> или сам является ссылкой
        const linkInfo = await wrapper.evaluate((element) => {
          // Вариант 1: Ищем <a> внутри .user-profile-link
          const linkElement = element.querySelector('.user-profile-link a');
          if (linkElement) {
            const href = linkElement.getAttribute('href');
            const text = linkElement.textContent || '';
            return { href, text, type: 'a_inside' };
          }
          
          // Вариант 2: Сам .user-profile-link является ссылкой
          const profileLink = element.querySelector('.user-profile-link');
          if (profileLink) {
            const href = profileLink.getAttribute('href');
            const text = profileLink.textContent || '';
            // Проверяем, является ли элемент <a>
            if (profileLink.tagName === 'A' && href) {
              return { href, text, type: 'a_element' };
            }
            // Или имеет data-атрибут
            const dataHref = (profileLink as HTMLElement).getAttribute('data-href') || 
                           (profileLink as HTMLElement).getAttribute('data-url');
            if (dataHref) {
              return { href: dataHref, text, type: 'data_attr' };
            }
            if (href) {
              return { href, text, type: 'href_attr' };
            }
          }
          
          // Вариант 3: Ищем родительский <a> для .user-profile-link
          // Структура может быть: <a class="user-profile-link"><span class="text">Имя</span></a>
          if (profileLink) {
            let parent = profileLink.parentElement;
            // Поднимаемся по дереву до 3 уровней
            for (let i = 0; i < 3 && parent; i++) {
              if (parent.tagName === 'A') {
                const parentHref = parent.getAttribute('href');
                if (parentHref) {
                  return { href: parentHref, text: profileLink.textContent || '', type: 'parent_a' };
                }
              }
              parent = parent.parentElement;
            }
          }
          
          // Вариант 4: Ищем любой <a> в wrapper, который содержит "user" в href
          const allLinks = element.querySelectorAll('a');
          for (const link of allLinks) {
            const href = link.getAttribute('href');
            if (href && (href.includes('user') || href.includes('profile'))) {
              return { href, text: link.textContent || '', type: 'user_link' };
            }
          }
          
          return { href: null, text: '', type: 'not_found' };
        });
        
        console.log(`         🔍 Результат поиска:`);
        console.log(`            Тип: ${linkInfo.type}`);
        console.log(`            Href: ${linkInfo.href || 'не найден'}`);
        console.log(`            Текст: ${linkInfo.text.substring(0, 50)}`);
        
        if (linkInfo.href) {
          // Формируем полный URL
          if (linkInfo.href.startsWith('http://') || linkInfo.href.startsWith('https://')) {
            studentUrl = linkInfo.href;
          } else if (linkInfo.href.startsWith('/')) {
            studentUrl = `${config.gcUrl}${linkInfo.href}`;
          } else {
            const currentUrl = page.url();
            const baseUrl = currentUrl.split('/').slice(0, 3).join('/');
            studentUrl = `${baseUrl}/${linkInfo.href}`;
          }
          console.log(`         ✅ URL сформирован: ${studentUrl}`);
        }
        
        // Если не получили через JS, пробуем через Playwright
        if (!studentUrl) {
          console.log(`         ⚠️  JavaScript не нашел href, пробую через Playwright...`);
          
          // Пробуем найти <a> внутри .user-profile-link
          const linkInside = wrapper.locator('.user-profile-link a').first();
          const countInside = await linkInside.count().catch(() => 0);
          
          if (countInside > 0) {
            const href = await linkInside.getAttribute('href').catch(() => null);
            if (href) {
              studentUrl = href.startsWith('http') ? href : (href.startsWith('/') ? `${config.gcUrl}${href}` : `${config.gcUrl}/${href}`);
              console.log(`         ✅ URL из <a> внутри .user-profile-link: ${studentUrl}`);
            }
          }
          
          // Если не нашли, пробуем сам .user-profile-link
          if (!studentUrl) {
            const profileLink = wrapper.locator('.user-profile-link').first();
            const href = await profileLink.getAttribute('href').catch(() => null);
            
            if (href) {
              studentUrl = href.startsWith('http') ? href : (href.startsWith('/') ? `${config.gcUrl}${href}` : `${config.gcUrl}/${href}`);
              console.log(`         ✅ URL из .user-profile-link: ${studentUrl}`);
            }
          }
        }
        
        // Если все еще нет URL, пробуем кликнуть на элемент с именем
        if (!studentUrl) {
          console.log(`         ⚠️  Href не найден, пробую кликнуть на элемент с именем...`);
          const currentUrl = page.url();
          console.log(`         📍 Текущий URL: ${currentUrl}`);
          
          // Пробуем кликнуть на .user-profile-link или на span.text внутри него
          const nameElement = wrapper.locator('.user-profile-link .text').first();
          const profileLink = wrapper.locator('.user-profile-link').first();
          
          const isNameVisible = await nameElement.isVisible({ timeout: 2000 }).catch(() => false);
          const isLinkVisible = await profileLink.isVisible({ timeout: 2000 }).catch(() => false);
          
          if (isNameVisible || isLinkVisible) {
            console.log(`         👆 Кликаю на элемент профиля...`);
            try {
              // Пробуем кликнуть на родительский элемент (ссылку)
              const elementToClick = isLinkVisible ? profileLink : nameElement;
              
              // Кликаем и ждем навигации
              await Promise.race([
                page.waitForURL(url => {
                  const newUrl = url.toString();
                  return newUrl !== currentUrl && !newUrl.includes('unanswered');
                }, { timeout: 5000 }).catch(() => null),
                elementToClick.click({ timeout: 5000 })
              ]);
              
              await page.waitForTimeout(2000);
              
              const newUrl = page.url();
              console.log(`         📍 URL после клика: ${newUrl}`);
              
              if (newUrl !== currentUrl && !newUrl.includes('unanswered')) {
                // Проверяем, что это профиль
                if (newUrl.includes('/user/') || 
                    newUrl.includes('/profile/') || 
                    newUrl.includes('user_id') || 
                    newUrl.includes('user=') ||
                    newUrl.includes('/pl/teach/control/user') ||
                    newUrl.includes('/teach/control/user')) {
                  studentUrl = newUrl;
                  console.log(`         ✅ URL профиля получен через клик: ${studentUrl}`);
                  
                  // Возвращаемся назад
                  console.log(`         🔙 Возвращаюсь назад...`);
                  await page.goBack({ waitUntil: 'domcontentloaded' });
                  await page.waitForTimeout(1500);
                  console.log(`         ✅ Вернулся на страницу с заданиями`);
                } else {
                  console.log(`         ⚠️  URL изменился, но это не профиль: ${newUrl}`);
                  // Возвращаемся назад
                  await page.goBack({ waitUntil: 'domcontentloaded' });
                  await page.waitForTimeout(1000);
                }
              } else {
                console.log(`         ⚠️  URL не изменился или вернулся на ленту ответов`);
              }
            } catch (clickError: any) {
              console.log(`         ⚠️  Ошибка при клике: ${clickError.message || clickError}`);
            }
          } else {
            console.log(`         ⚠️  Элемент профиля не виден`);
          }
        }
      } catch (error: any) {
        console.log(`         ⚠️  Ошибка при получении ссылки: ${error.message || error}`);
        console.log(`         📋 Stack: ${error.stack}`);
      }
      
      const linkTime = Date.now() - linkStartTime;
      console.log(`         ⏱️  Время получения ссылки: ${linkTime}ms`);
      if (studentUrl) {
        // Финальная проверка, что это не лента ответов
        if (studentUrl.includes('/answers/') || studentUrl.includes('/stream/') || studentUrl.includes('unanswered')) {
          console.log(`         ⚠️  ВНИМАНИЕ: Получен URL ленты ответов вместо профиля!`);
          studentUrl = undefined;
        } else {
          console.log(`         🔗 Финальный URL профиля: ${studentUrl}`);
          
          // Пробуем извлечь ID для проверки
          const idPatterns = [
            /(?:user[\/=]|id[=:]|user_id[=:])(\d+)/i,
            /\/user\/(\d+)/i,
            /user_id=(\d+)/i,
            /user=(\d+)/i,
            /\/pl\/teach\/control\/user\/view\?id=(\d+)/i,
            /\/teach\/control\/user\/view\?id=(\d+)/i
          ];
          
          for (const pattern of idPatterns) {
            const match = studentUrl.match(pattern);
            if (match && match[1]) {
              console.log(`         🆔 GetCourse ID извлечен: ${match[1]}`);
              break;
            }
          }
        }
      } else {
        console.log(`         ❌ Ссылка на профиль не найдена`);
        console.log(`         💡 Попробую получить через дополнительный поиск...`);
        
        // Последняя попытка: ищем все ссылки в wrapper
        try {
          const allLinks = await wrapper.locator('a').all();
          for (const link of allLinks) {
            const href = await link.getAttribute('href').catch(() => null);
            const text = await link.innerText().catch(() => '');
            if (href && (href.includes('user') || href.includes('profile'))) {
              studentUrl = href.startsWith('http') ? href : (href.startsWith('/') ? `${config.gcUrl}${href}` : `${config.gcUrl}/${href}`);
              console.log(`         ✅ Найдена ссылка через поиск всех <a>: ${studentUrl}`);
              break;
            }
          }
        } catch (e) {
          console.log(`         ❌ Дополнительный поиск не дал результатов`);
        }
      }
      
      // Текст ответа - быстрая проверка через JavaScript
      console.log(`      💬 ШАГ 4: Получаю текст ответа...`);
      console.log(`         ⏳ Быстрая проверка наличия текста через JavaScript...`);
      const textStartTime = Date.now();
      let text = '';
      
      try {
        // Используем JavaScript для быстрого получения текста без ожидания загрузки
        text = await wrapper.evaluate((element) => {
          // Ищем элемент .answer-text внутри wrapper
          const answerText = element.querySelector('.answer-text');
          if (answerText) {
            return (answerText as HTMLElement).textContent || (answerText as HTMLElement).innerText || '';
          }
          // Если не нашли, пробуем другие селекторы
          const textSelectors = [
            '.answer-content',
            '.answer-body',
            '.text-content',
            '[class*="answer"]',
            '[class*="text"]'
          ];
          for (const selector of textSelectors) {
            const el = element.querySelector(selector);
            if (el) {
              const htmlEl = el as HTMLElement;
              const content = htmlEl.textContent || htmlEl.innerText || '';
              if (content.trim().length > 0) {
                return content.trim();
              }
            }
          }
          return '';
        });
        
        // Если через JavaScript не получили, пробуем через Playwright (но с коротким таймаутом)
        if (!text || text.trim().length === 0) {
          console.log(`         ⚠️  JavaScript не нашел текст, пробую через Playwright (таймаут 2 сек)...`);
          try {
            text = await Promise.race([
              wrapper.locator('.answer-text').innerText({ timeout: 2000 }),
              new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
            ]);
          } catch (error) {
            console.log(`         ⚠️  Playwright тоже не нашел текст, оставляю пустым`);
            text = '';
          }
        }
      } catch (error) {
        console.log(`         ⚠️  Ошибка при получении текста: ${error}`);
        text = '';
      }
      
      const textTime = Date.now() - textStartTime;
      console.log(`         ✅ Текст получен за ${textTime}ms: ${text.length} символов`);
      if (text.length > 0) {
        console.log(`         📄 Первые 100 символов: "${text.slice(0, 100).replace(/\n/g, ' ')}..."`);
      } else {
        console.log(`         ⚠️  Текст ответа пустой или не найден`);
      }
      
      // Комментарии студента (дополнительные сообщения)
      console.log(`      💭 ШАГ 5: Получаю комментарии студента...`);
      console.log(`         ⏳ Ожидание элементов .comment-text (таймаут 5 сек)...`);
      const commentsStartTime = Date.now();
      let studentComments: string[] = [];
      try {
        studentComments = await Promise.race([
          wrapper.locator('.comment-text').allInnerTexts(),
          new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
      } catch (error) {
        console.log(`         ⚠️  Таймаут при получении комментариев, пробую без таймаута...`);
        studentComments = await wrapper.locator('.comment-text').allInnerTexts().catch(() => []);
      }
      const commentsTime = Date.now() - commentsStartTime;
      const fullText = [text, ...studentComments].filter(t => t.trim()).join('\n\n---\n\n');
      console.log(`         ✅ Комментарии получены за ${commentsTime}ms: ${studentComments.length} шт., общий текст: ${fullText.length} символов`);
      
      // Название урока/задания
      console.log(`      📚 ШАГ 6: Получаю название урока...`);
      console.log(`         ⏳ Ожидание элемента .show-lesson-link (таймаут 5 сек)...`);
      const titleStartTime = Date.now();
      let assignmentTitle = 'Без названия';
      try {
        assignmentTitle = await Promise.race([
          wrapper.locator('.show-lesson-link').innerText(),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
      } catch (error) {
        console.log(`         ⚠️  Таймаут при получении названия, пробую без таймаута...`);
        assignmentTitle = await wrapper.locator('.show-lesson-link').innerText().catch(() => 'Без названия');
      }
      const titleTime = Date.now() - titleStartTime;
      console.log(`         ✅ Название получено за ${titleTime}ms: ${assignmentTitle}`);
      
      // ID урока (из data-lesson-id)
      console.log(`      🆔 ШАГ 7: Получаю ID урока...`);
      console.log(`         ⏳ Ожидание атрибута data-lesson-id (таймаут 5 сек)...`);
      const lessonIdStartTime = Date.now();
      let lessonId = '';
      try {
        lessonId = await Promise.race([
          wrapper.getAttribute('data-lesson-id'),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]) || '';
      } catch (error) {
        console.log(`         ⚠️  Таймаут при получении data-lesson-id, пробую без таймаута...`);
        lessonId = await wrapper.getAttribute('data-lesson-id').catch(() => '') || '';
      }
      const lessonIdTime = Date.now() - lessonIdStartTime;
      console.log(`         ✅ ID урока получен за ${lessonIdTime}ms: ${lessonId || 'не найден'}`);
      
      // Ссылки на файлы и картинки - улучшенный поиск
      console.log(`      📎 ШАГ 8: Получаю ссылки на файлы...`);
      console.log(`         ⏳ Ожидание элементов .answer-files (таймаут 5 сек)...`);
      const filesStartTime = Date.now();
      let downloadLinks: string[] = [];
      let imageDownloadLinks: string[] = [];
      try {
        downloadLinks = await Promise.race([
          wrapper.locator('.answer-files a[href]').evaluateAll(links => 
            links.map(link => link.getAttribute('href') || '').filter(href => href)
          ),
          new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]) as string[];
      } catch (error) {
        console.log(`         ⚠️  Таймаут при получении файлов, пробую без таймаута...`);
        downloadLinks = await wrapper.locator('.answer-files a[href]').evaluateAll(links => 
          links.map(link => link.getAttribute('href') || '').filter(href => href)
        ).catch(() => []) as string[];
      }
      
      try {
        imageDownloadLinks = await Promise.race([
          wrapper.locator('.answer-files img[data-download-link]').evaluateAll(imgs => 
            imgs.map(img => img.getAttribute('data-download-link') || '').filter(href => href)
          ),
          new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]) as string[];
      } catch (error) {
        imageDownloadLinks = await wrapper.locator('.answer-files img[data-download-link]').evaluateAll(imgs => 
          imgs.map(img => img.getAttribute('data-download-link') || '').filter(href => href)
        ).catch(() => []) as string[];
      }
      
      const filesTime = Date.now() - filesStartTime;
      const allLinks = [...downloadLinks, ...imageDownloadLinks].filter(url => url);
      
      const imageUrls = allLinks.filter(url => /\.(jpg|jpeg|png|gif|webp)$/i.test(url));
      const otherFiles = allLinks.filter(url => !/\.(jpg|jpeg|png|gif|webp)$/i.test(url));
      console.log(`         ✅ Файлы получены за ${filesTime}ms: файлов ${otherFiles.length}, изображений ${imageUrls.length}`);

      // Проверяем, что задание действительно требует проверки (есть кнопки)
      console.log(`      🔘 ШАГ 9: Проверяю наличие кнопок проверки...`);
      console.log(`         ⏳ Ожидание кнопок (таймаут 5 сек)...`);
      const buttonStartTime = Date.now();
      let hasAcceptButton = false;
      try {
        const count = await Promise.race([
          wrapper.locator('button.btn-success, .btn-success').count(),
          new Promise<number>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        hasAcceptButton = count > 0;
      } catch (error) {
        console.log(`         ⚠️  Таймаут при проверке кнопок, пробую без таймаута...`);
        const count = await wrapper.locator('button.btn-success, .btn-success').count().catch(() => 0);
        hasAcceptButton = count > 0;
      }
      const buttonTime = Date.now() - buttonStartTime;
      console.log(`         ✅ Проверка завершена за ${buttonTime}ms: кнопки ${hasAcceptButton ? 'найдены' : 'не найдены'}`);
      
      const totalTime = Date.now() - idStartTime;
      console.log(`      ⏱️  Общее время обработки задания: ${totalTime}ms (${(totalTime / 1000).toFixed(1)} сек)`);
      
      if (hasAcceptButton && id) {
        console.log(`      ✅ Задание добавлено в список для проверки`);
        submissions.push({
          id,
          studentName,
          studentUrl: studentUrl, // Ссылка на профиль студента
          text: fullText, // Сохраняем полный текст с комментариями
          imageUrls,
          fileUrls: otherFiles,
          assignmentTitle: assignmentTitle.trim(),
          lessonId: lessonId, // ID урока для загрузки содержимого
          idealAnswer: '', // Заполним позже
          taskDescription: '' // Заполним позже
        });
      } else {
        console.log(`      ⚠️  Задание пропущено (нет ID или кнопок проверки)`);
      }
    } catch (error) {
      console.error(`      ❌ Ошибка при обработке задания ${i + 1}:`, error);
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