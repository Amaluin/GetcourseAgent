import { initBrowser } from './browser';
import { loginToGetCourse } from './auth';
import { config } from './config';
import { closeAdsAndModals } from './ad-blocker';
import * as fs from 'fs';

async function main() {
  console.log('🔍 РЕЖИМ ИНСПЕКТОРА КЛИКОВ');
  console.log('Этот режим поможет найти правильные селекторы для раскрытия блоков\n');

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
    
    console.log('✅ Урок загружен');
    
    // СНАЧАЛА внедряем JavaScript для отслеживания кликов (ДО закрытия рекламы!)
    console.log('👂 Активирую отслеживание кликов...');
    
    // Внедряем JavaScript для отслеживания кликов
    await page.evaluate(() => {
      let clickCount = 0;
      
      // Показываем уведомление на странице
      const notification = document.createElement('div');
      notification.id = 'click-tracker-notification';
      notification.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: #4CAF50;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        z-index: 999999;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      `;
      notification.innerHTML = '🖱️ Отслеживание кликов активно! Кликов: 0';
      document.body.appendChild(notification);
      
      document.addEventListener('click', (event) => {
        clickCount++;
        
        // Обновляем уведомление
        notification.innerHTML = `🖱️ Отслеживание кликов активно! Кликов: ${clickCount}`;
        notification.style.background = '#2196F3';
        setTimeout(() => {
          notification.style.background = '#4CAF50';
        }, 200);
        
        const target = event.target as HTMLElement;
        
        // Собираем информацию об элементе
        const info = {
          clickNumber: clickCount,
          tagName: target.tagName,
          id: target.id || '(нет id)',
          className: target.className || '(нет классов)',
          textContent: target.textContent?.trim().substring(0, 100) || '(нет текста)',
          outerHTML: target.outerHTML.substring(0, 500),
          parentTagName: target.parentElement?.tagName || 'нет родителя',
          parentClassName: target.parentElement?.className || '(нет классов у родителя)',
          // Путь от корня
          path: [] as string[]
        };
        
        // Строим путь от корня до элемента
        let current: HTMLElement | null = target;
        while (current && current !== document.body) {
          let selector = current.tagName.toLowerCase();
          if (current.id) {
            selector += `#${current.id}`;
          } else if (current.className) {
            const classes = current.className.split(' ').filter(c => c).slice(0, 2).join('.');
            if (classes) selector += `.${classes}`;
          }
          info.path.unshift(selector);
          current = current.parentElement;
        }
        
        // Сохраняем в window для доступа из Node.js
        (window as any).lastClickInfo = info;
        
        console.log(`\n🖱️ КЛИК #${clickCount}:`, target.tagName, target.className);
      }, true);
    });
    
    console.log('✅ Отслеживание кликов активировано!');
    
    // Делаем скриншот с рекламой
    await page.screenshot({ path: 'debug_with_ads.png', fullPage: true });
    console.log('📸 Скриншот с рекламой: debug_with_ads.png');
    
    // Сохраняем HTML
    const htmlWithAds = await page.content();
    fs.writeFileSync('debug_with_ads.html', htmlWithAds, 'utf-8');
    console.log('💾 HTML с рекламой: debug_with_ads.html');
    
    // Ищем все фиксированные элементы (обычно реклама)
    const fixedElements = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const fixed: any[] = [];
      
      elements.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'absolute') {
          const rect = el.getBoundingClientRect();
          // Только видимые элементы
          if (rect.width > 0 && rect.height > 0) {
            fixed.push({
              tag: el.tagName,
              id: el.id || '(нет)',
              className: el.className || '(нет)',
              text: (el.textContent || '').substring(0, 50),
              position: style.position,
              zIndex: style.zIndex,
              width: rect.width,
              height: rect.height,
              top: rect.top,
              left: rect.left
            });
          }
        }
      });
      
      return fixed;
    });
    
    console.log('\n📌 Найдено фиксированных элементов (возможно реклама):');
    fixedElements.forEach((el, i) => {
      console.log(`\n${i + 1}. <${el.tag}> ${el.className}`);
      console.log(`   Позиция: ${el.position}, z-index: ${el.zIndex}`);
      console.log(`   Размер: ${el.width}x${el.height}px`);
      console.log(`   Координаты: top=${el.top}, left=${el.left}`);
      console.log(`   Текст: ${el.text}`);
    });
    
    // ТЕПЕРЬ НЕ закрываем рекламу автоматически - пусть пользователь сам кликнет
    console.log('\nℹ️ Реклама НЕ закрыта автоматически - кликните на крестики сами!');
    
    console.log('\n' + '='.repeat(70));
    console.log('📋 ИНСТРУКЦИЯ:');
    console.log('1. СНАЧАЛА закройте рекламу (кликните на крестики)');
    console.log('2. ПОСЛЕ закрытия рекламы кликните ОДИН РАЗ на пустое место страницы');
    console.log('3. Скрипт сделает второй слепок и покажет разницу');
    console.log('4. Для выхода нажмите Ctrl+C');
    console.log('='.repeat(70) + '\n');
    
    console.log('👂 Жду первого клика (после закрытия рекламы)...\n');
    
    // Ждем ПЕРВОГО клика (после закрытия рекламы)
    let lastClickNumber = 0;
    let secondSnapshotTaken = false;
    const checkInterval = 500; // Проверяем каждые 500мс
    const maxWaitTime = 120000; // Максимум 2 минуты
    let elapsedTime = 0;
    
    while (elapsedTime < maxWaitTime) {
      await page.waitForTimeout(checkInterval);
      elapsedTime += checkInterval;
      
      // Проверяем, был ли новый клик
      const clickInfo = await page.evaluate(() => (window as any).lastClickInfo);
      
      if (clickInfo && clickInfo.clickNumber > lastClickNumber) {
        lastClickNumber = clickInfo.clickNumber;
        
        // Если это ПЕРВЫЙ клик и мы еще не делали второй слепок
        if (!secondSnapshotTaken) {
          console.log('\n' + '='.repeat(70));
          console.log('🔄 ПЕРВЫЙ КЛИК ОБНАРУЖЕН! Делаю второй слепок...');
          console.log('='.repeat(70));
          
          await page.screenshot({ path: 'debug_without_ads.png', fullPage: true });
          console.log('📸 Скриншот БЕЗ рекламы: debug_without_ads.png');
          
          const htmlWithoutAds = await page.content();
          fs.writeFileSync('debug_without_ads.html', htmlWithoutAds, 'utf-8');
          console.log('💾 HTML БЕЗ рекламы: debug_without_ads.html');
          
          // Ищем фиксированные элементы снова
          const fixedElementsAfter = await page.evaluate(() => {
            const elements = document.querySelectorAll('*');
            const fixed: any[] = [];
            
            elements.forEach((el) => {
              const style = window.getComputedStyle(el);
              if (style.position === 'fixed' || style.position === 'absolute') {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  fixed.push({
                    tag: el.tagName,
                    id: el.id || '(нет)',
                    className: el.className || '(нет)',
                    text: (el.textContent || '').substring(0, 50),
                    position: style.position,
                    zIndex: style.zIndex,
                    width: rect.width,
                    height: rect.height
                  });
                }
              }
            });
            
            return fixed;
          });
          
          console.log('\n📌 Фиксированных элементов ПОСЛЕ закрытия рекламы:');
          fixedElementsAfter.forEach((el, i) => {
            console.log(`\n${i + 1}. <${el.tag}> ${el.className}`);
            console.log(`   Позиция: ${el.position}, z-index: ${el.zIndex}`);
            console.log(`   Размер: ${el.width}x${el.height}px`);
            console.log(`   Текст: ${el.text}`);
          });
          
          console.log('\n✅ Второй слепок готов!');
          console.log('📊 Сравните файлы:');
          console.log('   - debug_with_ads.png vs debug_without_ads.png');
          console.log('   - debug_with_ads.html vs debug_without_ads.html');
          console.log('\n🏁 Работа завершена! Нажмите Ctrl+C для выхода.\n');
          
          secondSnapshotTaken = true;
          break; // Выходим из цикла
        }
      }
    }
    
    console.log('\n⏱️ Время истекло. Завершаю работу...');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    console.log('\n🏁 Инспектор завершил работу.');
    console.log('Проверьте файлы click_*.txt для деталей о кликах.');
    
    if (!config.headless) {
      console.log('ℹ️ Браузер оставлен открытым. Нажмите Ctrl+C для выхода.');
    }
  }
}

main();

