import { Page } from 'playwright';
import OpenAI from 'openai';
import { config } from './config';
import { closeAdsAndModals } from './ad-blocker';

/**
  let closedCount = 0;
  
  // Селекторы для кнопок закрытия
  const closeSelectors = [
    // Стандартные кнопки закрытия
    '.close',
    '.modal-close',
    '.popup-close',
    '[aria-label="Close"]',
    '[aria-label="Закрыть"]',
    'button.close',
    'button[data-dismiss="modal"]',
    // Крестики (иконки)
    '.fa-times',
    '.fa-close',
    '.fa-remove',
    '.glyphicon-remove',
    '.icon-close',
    '.icon-times',
    // Текстовые кнопки
    'button:has-text("Закрыть")',
    'button:has-text("Close")',
    'a:has-text("Закрыть")',
    'span:has-text("×")',  // Символ крестика
    'button:has-text("×")',
    // Overlay (фон модального окна)
    '.modal-backdrop',
    '.overlay',
    // Специфичные для рекламы
    '.promo-close',
    '.banner-close',
    '.ad-close',
    '.popup-banner-close',
    '[onclick*="closePromo"]',
    '[onclick*="closeBanner"]',
    '[onclick*="closePopup"]',
    // Фиксированные баннеры (обычно внизу справа)
    '.fixed-banner .close',
    '.sticky-banner .close',
    '[style*="position: fixed"] .close',
    '[style*="position:fixed"] .close'
  ];
  
  for (const selector of closeSelectors) {
    try {
      const elements = await page.locator(selector).all();
      
      for (const element of elements) {
        try {
          const isVisible = await element.isVisible().catch(() => false);
          if (isVisible) {
            await element.click({ force: true, timeout: 1000 });
            closedCount++;
            await page.waitForTimeout(500);
          }
        } catch (e) {
          // Игнорируем ошибки
        }
      }
    } catch (e) {
      // Игнорируем ошибки для селекторов
    }
  }
  
  // JavaScript подход: скрываем модальные окна, оверлеи и фиксированные баннеры
  try {
    const removedInfo = await page.evaluate(() => {
      let removed = {
        modals: 0,
        fixedBanners: 0,
        backdrops: 0
      };
      
      // Скрываем все модальные окна
      const modals = document.querySelectorAll('.modal, .popup, .overlay, [role="dialog"]');
      modals.forEach(modal => {
        if (modal instanceof HTMLElement) {
          modal.style.display = 'none';
          modal.remove();
          removed.modals++;
        }
      });
      
      // Убираем фиксированные баннеры (обычно реклама внизу справа)
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        if (el instanceof HTMLElement) {
          const style = window.getComputedStyle(el);
          // Если элемент фиксированный и содержит рекламные слова
          if (style.position === 'fixed' || style.position === 'sticky') {
            const text = el.innerText || '';
            if (text.includes('BLACK FRIDAY') || 
                text.includes('Скидки') || 
                text.includes('ПОДРОБНЕЕ') ||
                text.includes('ЗАБРАТЬ ВЫГОДУ')) {
              el.remove();
              removed.fixedBanners++;
            }
          }
        }
      });
      
      // Убираем классы, блокирующие прокрутку
      document.body.classList.remove('modal-open', 'no-scroll');
      document.body.style.overflow = '';
      
      // Убираем backdrop
      const backdrops = document.querySelectorAll('.modal-backdrop, .overlay-backdrop');
      backdrops.forEach(backdrop => {
        backdrop.remove();
        removed.backdrops++;
      });
      
      return removed;
    });
    
    if (removedInfo.modals > 0 || removedInfo.fixedBanners > 0 || removedInfo.backdrops > 0) {
      console.log(`   🔧 JavaScript: удалено модальных окон: ${removedInfo.modals}, баннеров: ${removedInfo.fixedBanners}, backdrop: ${removedInfo.backdrops}`);
    }
  } catch (e) {
    // Игнорируем
  }
  
  if (closedCount > 0) {
    console.log(`   ✅ Закрыто рекламных окон: ${closedCount}`);
  }
  
  await page.waitForTimeout(500);
}

/**
 * Раскрывает все скрытые блоки на странице урока
 */
async function expandAllHiddenBlocks(page: Page): Promise<void> {
  // ПРОСТОЙ ПОДХОД: только JavaScript, без Playwright селекторов
  console.log(`   🔍 Ищу все <details> элементы со стрелками через JavaScript...`);
  
  const result = await page.evaluate(() => {
    let clicked = 0;
    let found = 0;
    let alreadyOpen = 0;
    const arrows = ['▶', '►', '▼', '↘️', '➤', '▸'];
    
    // Ищем все <summary> элементы
    const summaries = document.querySelectorAll('details > summary');
    
    summaries.forEach(summary => {
      const text = summary.textContent || '';
      const hasArrow = arrows.some(arrow => text.includes(arrow));
      
      if (hasArrow) {
        found++;
        
        if (summary instanceof HTMLElement) {
          // Проверяем, не раскрыт ли уже
          const details = summary.parentElement as HTMLDetailsElement;
          if (details) {
            if (details.open) {
              alreadyOpen++;
            } else {
              summary.click();
              clicked++;
            }
          }
        }
      }
    });
    
    return { clicked, found, alreadyOpen, total: summaries.length };
  });
  
  console.log(`   📊 Всего <summary>: ${result.total}, со стрелками: ${result.found}, уже открыто: ${result.alreadyOpen}, кликнуто: ${result.clicked}`);
  
  // Даем время на все анимации
  await page.waitForTimeout(1000);
  
}

// === КОНЕЦ ФУНКЦИИ expandAllHiddenBlocks ===

// Старая версия функции (удалена):
/*
  // НЕ ищем contentArea - селекторы виснут!
  // Вместо этого работаем через JavaScript напрямую
  
  // 1. Ищем стрелочки-триггеры (▶, ►, ▼, и т.д.) ТОЛЬКО внутри контента
  const arrowSelectors = [
    // HTML5 details/summary элементы
    'details summary',
    'summary:has-text("↘️")',  // Специфично для "Что мы умеем ↘️"
    // Классы для раскрывающихся элементов
    '.spoiler-title',
    '.spoiler-header',
    '.accordion-header',
    '.expandable-header',
    '.toggle-header',
    '.collapsible-header',
    // Bootstrap collapse
    '[data-toggle="collapse"]',
    '.collapsed'
  ];
  
  for (const selector of arrowSelectors) {
    try {
      // Ищем ТОЛЬКО внутри области контента!
      const elements = await contentArea.locator(selector).all();
      
      if (elements.length > 0) {
        console.log(`   🔍 Найдено ${elements.length} элементов по селектору: ${selector}`);
      }
      
      for (const element of elements) {
        try {
          // Проверяем, виден ли элемент
          const isVisible = await element.isVisible().catch(() => false);
          if (!isVisible) continue;
          
          // Проверяем, не раскрыт ли уже (по классам active, open, expanded)
          const className = await element.getAttribute('class').catch(() => '') || '';
          const isAlreadyExpanded = className.includes('active') || 
                                   className.includes('open') || 
                                   className.includes('expanded') ||
                                   className.includes('in'); // Bootstrap класс для открытых collapse
          
          if (!isAlreadyExpanded) {
            await element.click({ force: true, timeout: 1000 });
            expandedCount++;
            console.log(`   👆 Кликнул на элемент (всего кликов: ${expandedCount})`);
            await page.waitForTimeout(300); // Даем время на анимацию
          }
        } catch (e) {
          // Игнорируем ошибки для отдельных элементов
        }
      }
    } catch (e) {
      // Игнорируем ошибки для селекторов
    }
  }
  
  // 2. Дополнительно: ищем элементы с aria-expanded="false"
  try {
    const ariaCollapsed = await page.locator('[aria-expanded="false"]').all();
    for (const element of ariaCollapsed) {
      try {
        const isVisible = await element.isVisible().catch(() => false);
        if (isVisible) {
          await element.click({ force: true, timeout: 1000 });
          expandedCount++;
          await page.waitForTimeout(300);
        }
      } catch (e) {
        // Игнорируем
      }
    }
  } catch (e) {
    // Игнорируем
  }
  
  console.log(`   ✅ Раскрыто элементов: ${expandedCount}`);
  
  // 3. JavaScript подход: принудительно показываем все скрытые элементы ТОЛЬКО в контенте
  try {
    const jsResult = await page.evaluate(() => {
      // Находим область контента (не трогаем меню и навигацию!)
      const contentSelectors = ['main', '.lesson-content', '.training-content', '.page-content', 'article'];
      let contentArea: Element | null = null;
      
      for (const selector of contentSelectors) {
        contentArea = document.querySelector(selector);
        if (contentArea) break;
      }
      
      if (!contentArea) {
        return { detailsCount: 0, hiddenCount: 0, collapsedCount: 0 };
      }
      
      // Раскрываем все <details> элементы ТОЛЬКО в контенте
      // Фокусируемся на details с summary, которые содержат стрелки
      const detailsElements = contentArea.querySelectorAll('details');
      let detailsCount = 0;
      detailsElements.forEach(details => {
        if (details instanceof HTMLDetailsElement) {
          // Проверяем, есть ли summary со стрелкой внутри
          const summary = details.querySelector('summary');
          if (summary) {
            const text = summary.textContent || '';
            if (text.includes('↘️') || text.includes('▶') || text.includes('►')) {
              details.open = true;
              details.setAttribute('open', '');
              detailsCount++;
            }
          }
        }
      });
      
      // Находим все элементы с display: none ТОЛЬКО в контенте
      const hiddenElements = contentArea.querySelectorAll('[style*="display: none"], [style*="display:none"]');
      let hiddenCount = 0;
      hiddenElements.forEach(el => {
        if (el instanceof HTMLElement) {
          el.style.display = 'block';
          el.style.visibility = 'visible';
          hiddenCount++;
        }
      });
      
      // Раскрываем все элементы с классами collapsed, hidden ТОЛЬКО в контенте
      const collapsedElements = contentArea.querySelectorAll('.collapsed, .hidden, .hide');
      let collapsedCount = 0;
      collapsedElements.forEach(el => {
        if (el instanceof HTMLElement) {
          el.classList.remove('collapsed', 'hidden', 'hide');
          el.classList.add('expanded', 'show', 'in');
          collapsedCount++;
        }
      });
      
      // Устанавливаем aria-expanded="true" ТОЛЬКО в контенте
      const ariaElements = contentArea.querySelectorAll('[aria-expanded="false"]');
      ariaElements.forEach(el => {
        el.setAttribute('aria-expanded', 'true');
      });
      
      return { detailsCount, hiddenCount, collapsedCount };
    });
    console.log(`   🔧 JS: раскрыто details: ${jsResult.detailsCount}, hidden: ${jsResult.hiddenCount}, collapsed: ${jsResult.collapsedCount}`);
  } catch (e) {
    console.warn(`   ⚠️ Не удалось применить JavaScript манипуляции:`, e);
  }
*/

// === НОВАЯ ФУНКЦИЯ (используется сейчас) ===
// Код выше в строках 141-173

// Старая версия с Playwright селекторами закомментирована выше
// Теперь используется только JavaScript подход без селекторов

export interface VideoSection {
  videoUrl: string;
  videoTitle: string;
  descriptionBefore: string;  // Текст ДО видео
  descriptionAfter: string;   // Текст ПОСЛЕ видео
}

export interface DetailedSection {
  sectionNumber: number;
  title: string;
  content: string;
  videoUrl?: string;
  videoTitle?: string;
  beforeVideo: string;
  afterVideo: string;
  timestamp?: string;
}

export interface LessonContent {
  lessonId: string;
  title: string;
  fullText: string;           // Весь текст урока (для запасного варианта)
  videoSections: VideoSection[]; // Структурированные блоки видео + описания
  detailedSections?: DetailedSection[]; // Детальные секции для базы знаний
  summary: string;            // Выжимка от AI
  imageUrls: string[];
  fileUrls: string[];
}

/**
 * Создает детальные секции урока для базы знаний
 */
function createDetailedSections(
  videoSections: VideoSection[],
  fullText: string
): DetailedSection[] {
  const sections: DetailedSection[] = [];
  
  // Если есть видео, создаем секции по видео
  if (videoSections.length > 0) {
    videoSections.forEach((videoSection, index) => {
      const content = `${videoSection.descriptionBefore}\n\n${videoSection.descriptionAfter}`.trim();
      
      sections.push({
        sectionNumber: index + 1,
        title: videoSection.videoTitle || `Видео ${index + 1}`,
        content: content || videoSection.videoTitle || 'Видео без описания',
        videoUrl: videoSection.videoUrl,
        videoTitle: videoSection.videoTitle,
        beforeVideo: videoSection.descriptionBefore,
        afterVideo: videoSection.descriptionAfter,
        timestamp: new Date().toISOString()
      });
    });
  }
  
  // Если нет видео или видео без описаний, разбиваем текст на логические секции
  if (sections.length === 0 || sections.every(s => s.content.length < 100)) {
    if (fullText.length > 0) {
      // Стратегия 1: Разбиваем по заголовкам (если есть структура)
      const headingPattern = /^(#{1,3}\s+.+|[А-ЯЁ][^\n]{5,100})$/gm;
      const matches = [...fullText.matchAll(headingPattern)];
      
      if (matches.length > 2) {
        // Есть заголовки, разбиваем по ним
        let currentSection = '';
        let currentTitle = 'Введение';
        let sectionNum = 1;
        
        const lines = fullText.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Проверяем, это заголовок?
          const isHeading = /^(#{1,3}\s+|[А-ЯЁ][^\n]{5,100}$)/.test(line) && 
                           line.length < 100 && 
                           !line.endsWith('.') &&
                           !line.endsWith(',');
          
          if (isHeading && currentSection.length > 200) {
            // Сохраняем предыдущую секцию
            sections.push({
              sectionNumber: sectionNum++,
              title: currentTitle,
              content: currentSection.trim(),
              beforeVideo: currentSection.trim(),
              afterVideo: '',
              timestamp: new Date().toISOString()
            });
            
            currentTitle = line.replace(/^#+\s*/, '');
            currentSection = '';
          } else {
            currentSection += line + '\n';
          }
        }
        
        // Добавляем последнюю секцию
        if (currentSection.trim().length > 200) {
          sections.push({
            sectionNumber: sectionNum,
            title: currentTitle,
            content: currentSection.trim(),
            beforeVideo: currentSection.trim(),
            afterVideo: '',
            timestamp: new Date().toISOString()
          });
        }
      } else {
        // Стратегия 2: Разбиваем на равные части по ~2000 символов
        const chunkSize = 2000;
        const chunks: string[] = [];
        
        for (let i = 0; i < fullText.length; i += chunkSize) {
          const chunk = fullText.slice(i, i + chunkSize);
          if (chunk.trim().length > 100) {
            chunks.push(chunk.trim());
          }
        }
        
        chunks.forEach((chunk, index) => {
          // Извлекаем первую строку как заголовок
          const firstLine = chunk.split('\n')[0].slice(0, 80);
          const title = firstLine || `Часть ${index + 1}`;
          
          sections.push({
            sectionNumber: index + 1,
            title: title,
            content: chunk,
            beforeVideo: chunk,
            afterVideo: '',
            timestamp: new Date().toISOString()
          });
        });
      }
    }
  }
  
  // Если все еще пусто, создаем одну секцию со всем текстом
  if (sections.length === 0 && fullText.length > 100) {
    sections.push({
      sectionNumber: 1,
      title: 'Содержание урока',
      content: fullText,
      beforeVideo: fullText,
      afterVideo: '',
      timestamp: new Date().toISOString()
    });
  }
  
  return sections;
}

/**
 * Извлекает содержимое урока: текстовые описания к видео, файлы, изображения
 */
export async function getLessonContent(page: Page, lessonId: string): Promise<LessonContent> {
  console.log(`📚 Загружаю содержимое урока ID: ${lessonId}...`);
  
  // Переход к уроку
  const lessonUrl = `https://university.zerocoder.ru/teach/control/lesson/view/id/${lessonId}`;
  console.log(`   🔗 Перехожу к: ${lessonUrl}`);
  
  await page.goto(lessonUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // Проверяем, куда мы попали
  const currentUrl = page.url();
  console.log(`   ✅ Текущий URL: ${currentUrl}`);
  
  // GetCourse может делать редирект и менять формат URL:
  // /teach/control/lesson/view/id/345069174 → /pl/teach/control/lesson/view?id=345069174
  if (!currentUrl.includes(`/lesson/view`) || !currentUrl.includes(lessonId)) {
    console.warn(`   ⚠️ ВНИМАНИЕ: Мы НЕ на странице урока! Возможно, редирект или ошибка.`);
  }
  
  // ЗАКРЫВАЕМ РЕКЛАМУ И МОДАЛЬНЫЕ ОКНА
  console.log(`   🚫 Закрываю рекламу и модальные окна...`);
  await closeAdsAndModals(page);
  
  // Скриншоты отключены для экономии времени
  
  // Извлекаем заголовок урока (пробуем разные селекторы)
  let title = 'Без названия';
  const titleSelectors = [
    'h2.lesson-title-value', // Основной селектор для GetCourse
    'h1.lesson-title',
    'h1',
    '.lesson-title',
    '.training-title',
    'title', // Заголовок страницы
    '.page-title',
    '.lesson-name',
    '[data-lesson-title]'
  ];
  
  for (const selector of titleSelectors) {
    try {
      const element = page.locator(selector).first();
      const text = await element.innerText({ timeout: 1000 });
      if (text && text.trim()) {
        title = text.trim();
        break;
      }
    } catch (e) {
      // Пробуем следующий селектор
    }
  }
  
  // Если не нашли, берем из <title>
  if (title === 'Без названия') {
    try {
      title = await page.title();
    } catch (e) {
      // Оставляем "Без названия"
    }
  }
  
  console.log(`   📖 Урок: "${title}"`);
  console.log(`   🔗 URL: ${lessonUrl}`);
  
  // Измеряем объем текста ДО раскрытия через JavaScript (селекторы виснут!)
  console.log(`   🔍 Получаю текст страницы через JavaScript...`);
  
  const textBefore = await page.evaluate(() => {
    // Ищем контент через JavaScript
    const selectors = [
      '.lesson-content',
      '.training-content', 
      'main',
      'article',
      '.page-content'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent || '';
        // Фильтруем рекламу
        const isAd = text.includes('BLACK FRIDAY') || text.includes('Скидки до');
        if (!isAd && text.length > 1000) {
          return text;
        }
      }
    }
    
    // Если не нашли, берем весь body
    return document.body.textContent || '';
  });
  
  console.log(`   📄 Объем текста ДО раскрытия: ${textBefore.length} символов`);
  
  // РАСКРЫВАЕМ ВСЕ СКРЫТЫЕ БЛОКИ (спойлеры, аккордеоны)
  console.log(`   🔓 Раскрываю скрытые блоки...`);
  await expandAllHiddenBlocks(page);
  
  // Скриншоты отключены
  
  // Измеряем объем текста ПОСЛЕ раскрытия через JavaScript
  const fullText = await page.evaluate(() => {
    // Приоритетные селекторы для контента урока
    const contentSelectors = [
      '.lesson-content',
      '.training-content',
      '.lesson-tab-content',
      '.gc-page-content',
      'main .content',
      'article',
      '.page-content'
    ];
    
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        // Клонируем, чтобы не модифицировать реальный DOM
        const clone = element.cloneNode(true) as HTMLElement;
        
        // Удаляем технические и навигационные элементы
        const techSelectors = [
          'script', 'style', 'noscript', 'iframe',
          '.code-block', 'code', 'pre',
          '[class*="ad-"]', '[class*="promo"]',
          'header', 'nav', 'footer',
          '.header', '.navigation', '.footer', '.sidebar', '.menu',
          '.breadcrumbs', '.lesson-navigation', '.course-menu',
          '[class*="button"]', '[class*="btn"]',
          '.comment', '.comments', '[class*="social"]',
          'form', 'input', 'textarea', 'select',
          '[class*="support"]', '[class*="help"]',
          '[data-lesson-navigation]', '[data-menu]'
        ];
        
        techSelectors.forEach(sel => {
          clone.querySelectorAll(sel).forEach(el => el.remove());
        });
        
        // Получаем текст
        let text = clone.textContent || '';
        
        // Удаляем навигационные фразы
        const navPhrases = [
          'Открыть в приложении',
          'Действия',
          'Написать в тех. поддержку',
          'Список тренингов',
          'Предыдущий урок',
          'Следующий урок',
          'Редактировать урок',
          'Копировать урок',
          'Удалить урок',
          'Экспорт урока',
          'Импорт урока',
          'Перенести урок',
          'Проверка заданий',
          'Добавить файлы',
          'Отправить ответ',
          'Сохранить черновик',
          'Показать все поля',
          'максимальный размер файла'
        ];
        
        navPhrases.forEach(phrase => {
          text = text.replace(new RegExp(phrase, 'gi'), '');
        });
        
        // Удаляем числа вида "35658", "1230" (ID элементов)
        text = text.replace(/\b\d{4,6}\b/g, '');
        
        // Очистка от лишних пробелов и переносов
        const cleaned = text
          .replace(/\s+/g, ' ')  // Множественные пробелы → один
          .replace(/\n{3,}/g, '\n\n')  // Множественные переносы → два
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n')
          .trim();
        
        // Фильтруем очень короткий контент
        if (cleaned.length > 500) {
          return cleaned;
        }
      }
    }
    
    // Если не нашли, берем весь body, но убираем навигацию и футер
    const body = document.body.cloneNode(true) as HTMLElement;
    const elementsToRemove = [
      'script', 'style', 'noscript', 'iframe',
      'header', 'nav', 'footer', '.header', '.navigation', 
      '.footer', '.sidebar', '.menu', '[class*="ad-"]',
      'code', 'pre', '.code-block', 'form', 'input'
    ];
    
    elementsToRemove.forEach(sel => {
      body.querySelectorAll(sel).forEach(el => el.remove());
    });
    
    const text = body.textContent || '';
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  });
  
  const textIncrease = fullText.length - textBefore.length;
  console.log(`   📄 Объем текста ПОСЛЕ раскрытия: ${fullText.length} символов (+${textIncrease})`);
  
  // Сохранение HTML отключено
  
  // Ищем все видео на странице
  const videoIframes = await page.locator('iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="rutube"], video').all();
  console.log(`   🎥 Найдено видео: ${videoIframes.length}`);
  
  const videoSections: VideoSection[] = [];
  
  for (let i = 0; i < videoIframes.length; i++) {
    const iframe = videoIframes[i];
    const videoUrl = await iframe.getAttribute('src').catch(() => '') || '';
    
    // Пытаемся найти заголовок видео (обычно в h2, h3 или strong перед видео)
    const videoTitle = await iframe.locator('xpath=preceding::*[self::h2 or self::h3 or self::h4 or self::strong][1]')
      .innerText()
      .catch(() => `Видео ${i + 1}`);
    
    // Извлекаем текст ДО видео (ищем ближайший текстовый блок выше)
    const descriptionBefore = await iframe.locator('xpath=preceding::div[contains(@class, "text") or contains(@class, "content")][1]')
      .innerText()
      .catch(() => '');
    
    // Извлекаем текст ПОСЛЕ видео (ищем следующий текстовый блок)
    const descriptionAfter = await iframe.locator('xpath=following::div[contains(@class, "text") or contains(@class, "content")][1]')
      .innerText()
      .catch(() => '');
    
    const totalDescLength = descriptionBefore.length + descriptionAfter.length;
    
    videoSections.push({
      videoUrl,
      videoTitle: videoTitle.trim(),
      descriptionBefore: descriptionBefore.trim(),
      descriptionAfter: descriptionAfter.trim()
    });
    
    console.log(`   ✅ Видео ${i + 1}: "${videoTitle}"`);
    console.log(`      └─ Описание: ${totalDescLength} символов (до: ${descriptionBefore.length}, после: ${descriptionAfter.length})`);
  }
  
  // Если видео не найдены, парсим весь текст как один блок
  if (videoSections.length === 0) {
    console.log(`   ℹ️ Видео не найдены, парсим весь текст урока...`);
    videoSections.push({
      videoUrl: '',
      videoTitle: 'Текстовый урок',
      descriptionBefore: '',
      descriptionAfter: fullText
    });
  }
  
  // Ищем изображения (примеры из урока)
  const imageUrls = await page.locator('.lesson-content img[src], .training-content img[src]').evaluateAll(imgs => 
    imgs.map(img => img.getAttribute('src') || '').filter(src => src && !src.includes('default') && !src.includes('profile'))
  ) as string[];
  
  // Ищем прикрепленные файлы
  const fileUrls = await page.locator('.lesson-content a[href*="fileservice"], .training-content a[href*="fileservice"]').evaluateAll(links => 
    links.map(link => link.getAttribute('href') || '')
  ) as string[];
  
  console.log(`   🖼️ Изображений в уроке: ${imageUrls.length}`);
  console.log(`   📎 Прикрепленных файлов: ${fileUrls.length}`);
  
  // Итоговая статистика
  console.log(`\n   📊 ИТОГО извлечено из урока:`);
  console.log(`      • Видео блоков: ${videoSections.length}`);
  console.log(`      • Текстовых описаний: ${videoSections.filter(v => v.descriptionBefore || v.descriptionAfter).length}`);
  console.log(`      • Общий объем описаний: ${videoSections.reduce((sum, v) => sum + v.descriptionBefore.length + v.descriptionAfter.length, 0)} символов`);
  console.log(`      • Изображений: ${imageUrls.length}`);
  console.log(`      • Файлов: ${fileUrls.length}`);
  
  // Создаем выжимку через AI
  const summary = await summarizeLessonContent(videoSections, title);
  
  console.log(`   ✅ Выжимка урока создана (${summary.length} символов)`);
  console.log(`   📝 Первые 150 символов: "${summary.substring(0, 150)}..."\n`);
  
  // Создаем детальные секции для базы знаний
  const detailedSections = createDetailedSections(videoSections, fullText);
  console.log(`   📊 Создано ${detailedSections.length} детальных секций для базы знаний`);
  
  return {
    lessonId,
    title,
    fullText,
    videoSections,
    detailedSections,
    summary,
    imageUrls,
    fileUrls
  };
}

/**
 * Создает выжимку содержимого урока через AI
 */
async function summarizeLessonContent(videoSections: VideoSection[], lessonTitle: string): Promise<string> {
  console.log(`   🧠 Создаю выжимку урока через AI...`);
  
  // Собираем весь текст из описаний
  let allText = `Урок: ${lessonTitle}\n\n`;
  
  videoSections.forEach((section, i) => {
    allText += `=== ${section.videoTitle} ===\n`;
    if (section.descriptionBefore) {
      allText += `${section.descriptionBefore}\n\n`;
    }
    if (section.descriptionAfter) {
      allText += `${section.descriptionAfter}\n\n`;
    }
  });
  
  // Если текста слишком много, обрезаем (ограничение токенов)
  const maxLength = 8000;
  if (allText.length > maxLength) {
    console.log(`   ⚠️ Текст урока слишком длинный (${allText.length} симв.), обрезаю до ${maxLength}...`);
    allText = allText.substring(0, maxLength) + '\n\n[... текст обрезан ...]';
  }
  
  try {
    const openai = new OpenAI({
      apiKey: config.groqApiKey || config.openaiApiKey,
      baseURL: config.groqApiKey ? "https://api.groq.com/openai/v1" : undefined
    });
    
    const completion = await openai.chat.completions.create({
      model: config.groqApiKey ? "llama-3.3-70b-versatile" : "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Ты — ассистент преподавателя. Твоя задача — сделать краткую выжимку урока для проверки домашних заданий."
        },
        {
          role: "user",
          content: `Прочитай содержимое урока и сделай КРАТКУЮ выжимку (200-300 слов):

${allText}

ВЫЖИМКА должна содержать:
1. Какие темы рассматривались в уроке
2. Какие инструменты/платформы использовались
3. Какие КОНКРЕТНЫЕ действия показывались (шаги, настройки, блоки)
4. Какой результат должен получиться у студента

Пиши КРАТКО, только суть. Это нужно для проверки домашних заданий.`
        }
      ],
      temperature: 0.3
    });
    
    const summary = completion.choices[0].message.content || '';
    
    return summary;
    
  } catch (error) {
    console.warn(`   ⚠️ Ошибка при создании выжимки:`, error);
    // Fallback: возвращаем первые 500 символов текста
    return allText.substring(0, 500) + '...';
  }
}

