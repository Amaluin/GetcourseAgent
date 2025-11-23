import { Page } from 'playwright';

/**
 * Закрывает рекламу, модальные окна и всплывающие баннеры
 * Вызывается автоматически после каждой загрузки страницы
 */
export async function closeAdsAndModals(page: Page): Promise<void> {
  // НЕ КЛИКАЕМ по кнопкам - это опасно, можем кликнуть по меню!
  // Вместо этого используем только JavaScript для удаления рекламы
  
  // JavaScript подход: скрываем модальные окна, оверлеи и фиксированные баннеры
  try {
    const removedInfo = await page.evaluate(() => {
      let removed = {
        modals: 0,
        fixedBanners: 0,
        backdrops: 0
      };
      
      // СНАЧАЛА удаляем рекламные баннеры GetCourse
      const adBanners = document.querySelectorAll('.gl-ad-banner, [class*="ad-banner"], [class*="promo-banner"]');
      adBanners.forEach(banner => {
        banner.remove();
        removed.fixedBanners++;
      });
      
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
                text.includes('ЗАБРАТЬ ВЫГОДУ') ||
                text.includes('подарки')) {
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
      console.log(`   ✅ Удалено рекламы: модальных окон: ${removedInfo.modals}, баннеров: ${removedInfo.fixedBanners}, backdrop: ${removedInfo.backdrops}`);
    } else {
      console.log(`   ℹ️ Реклама не найдена или уже закрыта`);
    }
  } catch (e) {
    console.warn(`   ⚠️ Ошибка при удалении рекламы:`, e);
  }
  
  await page.waitForTimeout(500);
}

/**
 * Автоматически закрывает рекламу после каждой навигации
 */
export async function setupAutoAdBlocker(page: Page): Promise<void> {
  // Слушаем событие загрузки страницы
  page.on('load', async () => {
    console.log('   🚫 Автоматическое закрытие рекламы...');
    await closeAdsAndModals(page);
  });
  
  console.log('✅ Автоматический блокировщик рекламы активирован');
}

