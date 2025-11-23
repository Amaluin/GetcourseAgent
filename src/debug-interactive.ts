import { initBrowser } from './browser';
import { loginToGetCourse } from './auth';
import { config } from './config';
import { closeAdsAndModals } from './ad-blocker';

function waitForSeconds(seconds: number, message: string): Promise<void> {
  console.log(`\n⏳ ${message}`);
  console.log(`⏱️  У вас есть ${seconds} секунд...`);
  let countdown = seconds;
  const interval = setInterval(() => {
    countdown--;
    if (countdown > 0 && countdown % 5 === 0) {
      console.log(`   ⏱️  Осталось ${countdown} секунд...`);
    }
  }, 1000);
  
  return new Promise((resolve) => {
    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, seconds * 1000);
  });
}

async function main() {
  console.log('🔍 ИНТЕРАКТИВНЫЙ РЕЖИМ ОТЛАДКИ');
  console.log('=' .repeat(60));
  
  const { page } = await initBrowser();
  
  try {
    // 1. Авторизация
    await loginToGetCourse(page);
    await page.goto(config.gcStreamUrl);
    await page.waitForLoadState('domcontentloaded');
    
    console.log('\n✅ Мы на странице ленты ответов');
    console.log(`   URL: ${page.url()}`);
    
    // Закрываем рекламу
    await closeAdsAndModals(page);
    
    await page.screenshot({ path: 'debug_step_1_stream.png', fullPage: true });
    console.log('📸 Сохранен: debug_step_1_stream.png');
    
    // Извлекаем первый lessonId из ленты
    const firstAnswer = await page.locator('.answer_wrapper[data-lesson-id]').first();
    const lessonId = await firstAnswer.getAttribute('data-lesson-id');
    console.log(`\n🎯 Найден первый урок с ID: ${lessonId}`);
    
    // Переходим к уроку напрямую (как делает агент)
    const lessonUrl = `https://university.zerocoder.ru/teach/control/lesson/view/id/${lessonId}`;
    console.log(`🔗 Перехожу к уроку: ${lessonUrl}`);
    
    await page.goto(lessonUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    console.log(`\n✅ Текущий URL: ${currentUrl}`);
    
    // Закрываем рекламу на странице урока
    await closeAdsAndModals(page);
    
    await page.screenshot({ path: 'debug_step_2_lesson_loaded.png', fullPage: true });
    console.log('📸 Сохранен: debug_step_2_lesson_loaded.png (урок загружен, реклама закрыта)');
    
    await waitForSeconds(20, 'ШАГ 3: Сейчас раскройте ОДИН блок вручную (например, "Что мы умеем")');
    
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'debug_step_3_one_block_expanded.png', fullPage: true });
    console.log('📸 Сохранен: debug_step_3_one_block_expanded.png');
    
    console.log('\n🔍 Анализирую HTML структуру раскрытого блока...');
    
    // Сохраняем HTML
    const html = await page.content();
    const fs = await import('fs');
    fs.writeFileSync('debug_step_4_full.html', html);
    console.log('💾 Сохранен: debug_step_4_full.html');
    
    // Пытаемся найти текст
    console.log('\n🔍 Пробую разные селекторы для поиска текста...');
    
    const selectors = [
      'body',
      'main',
      '.lesson-content',
      '.training-content',
      '.lesson-tab-content',
      '.content-wrapper',
      '.lesson-wrapper',
      '#content',
      '.page-content',
      '[role="main"]'
    ];
    
    for (const selector of selectors) {
      const text = await page.locator(selector).innerText().catch(() => '');
      if (text.length > 0) {
        console.log(`✅ Селектор "${selector}": ${text.length} символов`);
        console.log(`   Первые 100 символов: "${text.substring(0, 100)}..."`);
      } else {
        console.log(`❌ Селектор "${selector}": не найден или пустой`);
      }
    }
    
    await waitForSeconds(20, 'ШАГ 4: Раскройте ВСЕ остальные блоки');
    
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'debug_step_4_all_expanded.png', fullPage: true });
    console.log('📸 Сохранен: debug_step_4_all_expanded.png');
    
    const htmlFinal = await page.content();
    fs.writeFileSync('debug_step_4_full.html', htmlFinal);
    console.log('💾 Сохранен: debug_step_4_full.html');
    
    // Финальный анализ
    console.log('\n📊 ФИНАЛЬНЫЙ АНАЛИЗ:');
    for (const selector of selectors) {
      const text = await page.locator(selector).innerText().catch(() => '');
      if (text.length > 0) {
        console.log(`✅ Селектор "${selector}": ${text.length} символов`);
      }
    }
    
    console.log('\n✅ ОТЛАДКА ЗАВЕРШЕНА!');
    console.log('\nПроверьте файлы:');
    console.log('  - debug_step_1_stream.png (лента ответов)');
    console.log('  - debug_step_2_lesson_loaded.png (страница урока загружена)');
    console.log('  - debug_step_3_one_block_expanded.png (один блок раскрыт)');
    console.log('  - debug_step_4_all_expanded.png (все блоки раскрыты)');
    console.log('  - debug_step_4_full.html (финальный HTML)');
    
    console.log('\n⏳ Браузер останется открытым еще 60 секунд для проверки...');
    await waitForSeconds(60, 'Проверьте результаты');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    console.log('\n👋 До свидания!');
    process.exit(0);
  }
}

main();

