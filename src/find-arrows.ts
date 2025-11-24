import { initBrowser } from './browser';
import { loginToGetCourse } from './auth';
import { config } from './config';
import { closeAdsAndModals } from './ad-blocker';

async function main() {
  console.log('🔍 ПОИСК ВСЕХ ЭЛЕМЕНТОВ СО СТРЕЛКАМИ');

  const { page } = await initBrowser();

  try {
    await loginToGetCourse(page);
    
    console.log('✅ Авторизация выполнена');
    console.log(`📍 Переход в ленту ответов: ${config.gcStreamUrl}`);
    
    await page.goto(config.gcStreamUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    // Закрываем рекламу
    await closeAdsAndModals(page);
    
    // Извлекаем первый lessonId
    const firstAnswer = await page.locator('.answer_wrapper[data-lesson-id]').first();
    const lessonId = await firstAnswer.getAttribute('data-lesson-id');
    console.log(`🎯 Найден урок с ID: ${lessonId}`);
    
    // Переходим к уроку
    const lessonUrl = `https://university.zerocoder.ru/teach/control/lesson/view/id/${lessonId}`;
    console.log(`🔗 Перехожу к уроку: ${lessonUrl}\n`);
    
    await page.goto(lessonUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    // Закрываем рекламу на странице урока
    await closeAdsAndModals(page);
    
    console.log('✅ Урок загружен');
    console.log('\n' + '='.repeat(70));
    console.log('🔍 ИЩЕМ ВСЕ ЭЛЕМЕНТЫ СО СТРЕЛКАМИ НА СТРАНИЦЕ');
    console.log('='.repeat(70) + '\n');
    
    // JavaScript для поиска всех элементов со стрелками
    const arrowElements = await page.evaluate(() => {
      const results: any[] = [];
      
      // Список стрелок для поиска
      const arrows = ['▶', '►', '▼', '↘️', '➤', '▸', '▹', '▻', '▷', '⯈'];
      
      // Ищем все текстовые узлы
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      let node;
      while (node = walker.nextNode()) {
        const text = node.textContent || '';
        
        // Проверяем, содержит ли текст стрелку
        const hasArrow = arrows.some(arrow => text.includes(arrow));
        
        if (hasArrow) {
          const element = node.parentElement;
          if (!element) continue;
          
          // Получаем информацию об элементе
          const rect = element.getBoundingClientRect();
          
          // Только видимые элементы
          if (rect.width === 0 || rect.height === 0) continue;
          
          const style = window.getComputedStyle(element);
          
          results.push({
            text: text.trim().substring(0, 100),
            tagName: element.tagName,
            id: element.id || '(нет)',
            className: element.className || '(нет)',
            position: {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height
            },
            isClickable: style.cursor === 'pointer' || element.onclick !== null,
            parentTag: element.parentElement?.tagName || '(нет)',
            parentClass: element.parentElement?.className || '(нет)',
            // Полный путь
            path: (() => {
              const path: string[] = [];
              let current: HTMLElement | null = element;
              let depth = 0;
              while (current && current !== document.body && depth < 5) {
                let selector = current.tagName.toLowerCase();
                if (current.id) {
                  selector += `#${current.id}`;
                } else if (current.className) {
                  const classes = current.className.toString().split(' ').filter(c => c).slice(0, 2).join('.');
                  if (classes) selector += `.${classes}`;
                }
                path.unshift(selector);
                current = current.parentElement;
                depth++;
              }
              return path.join(' > ');
            })()
          });
        }
      }
      
      return results;
    });
    
    console.log(`✅ Найдено элементов со стрелками: ${arrowElements.length}\n`);
    
    if (arrowElements.length === 0) {
      console.log('⚠️ Не найдено ни одного элемента со стрелкой!');
      console.log('Возможно, стрелки отображаются через CSS или иконки.');
    } else {
      arrowElements.forEach((el, i) => {
        console.log(`${i + 1}. <${el.tagName}> ${el.className}`);
        console.log(`   Текст: ${el.text}`);
        console.log(`   Кликабельный: ${el.isClickable ? 'ДА ✓' : 'НЕТ'}`);
        console.log(`   Позиция: top=${Math.round(el.position.top)}, left=${Math.round(el.position.left)}`);
        console.log(`   Размер: ${Math.round(el.position.width)}x${Math.round(el.position.height)}px`);
        console.log(`   Родитель: <${el.parentTag}> ${el.parentClass}`);
        console.log(`   Путь: ${el.path}`);
        console.log('');
      });
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('🎯 ТЕПЕРЬ ПОПРОБУЕМ КЛИКНУТЬ НА ВСЕ ЭТИ ЭЛЕМЕНТЫ');
    console.log('='.repeat(70) + '\n');
    
    // Пробуем кликнуть на каждый элемент
    let clickedCount = 0;
    
    for (let i = 0; i < arrowElements.length; i++) {
      const el = arrowElements[i];
      
      try {
        // Ищем элемент по тексту и позиции
        const element = await page.evaluateHandle((elInfo) => {
          const elements = Array.from(document.querySelectorAll('*'));
          
          for (const elem of elements) {
            if (elem instanceof HTMLElement) {
              const rect = elem.getBoundingClientRect();
              const text = elem.textContent?.trim().substring(0, 100);
              
              // Сравниваем по тексту и примерной позиции
              if (text === elInfo.text && 
                  Math.abs(rect.top - elInfo.position.top) < 5 &&
                  Math.abs(rect.left - elInfo.position.left) < 5) {
                return elem;
              }
            }
          }
          
          return null;
        }, el);
        
        const locator = page.locator(`xpath=//*[contains(text(), "${el.text.substring(0, 30)}")]`).first();
        
        if (await locator.count() > 0) {
          await locator.click({ force: true, timeout: 1000 });
          clickedCount++;
          console.log(`✅ ${i + 1}. Кликнул на: ${el.text.substring(0, 50)}`);
          await page.waitForTimeout(300);
        } else {
          console.log(`⚠️ ${i + 1}. Не удалось найти элемент: ${el.text.substring(0, 50)}`);
        }
        
      } catch (e) {
        console.log(`❌ ${i + 1}. Ошибка при клике: ${el.text.substring(0, 50)}`);
      }
    }
    
    console.log(`\n✅ Кликнуто элементов: ${clickedCount} из ${arrowElements.length}`);
    
    // Делаем скриншот после кликов
    await page.screenshot({ path: 'debug_after_arrow_clicks.png', fullPage: true });
    console.log('📸 Скриншот после кликов: debug_after_arrow_clicks.png');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    console.log('\n🏁 Работа завершена.');
    
    if (!config.headless) {
      console.log('ℹ️ Браузер оставлен открытым. Нажмите Ctrl+C для выхода.');
    }
  }
}

main();




