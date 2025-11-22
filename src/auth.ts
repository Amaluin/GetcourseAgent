import { Page } from 'playwright';
import { config } from './config';

export async function loginToGetCourse(page: Page) {
  console.log('🔑 Авторизация в GetCourse...');
  
  await page.goto(config.gcUrl);
  
  // Ждем загрузки страницы
  await page.waitForLoadState('domcontentloaded');
  
  // Ждем немного, чтобы страница отрисовалась
  await page.waitForTimeout(2000);
  
  try {
    // Проверяем, может мы уже залогинены (по URL или наличию элементов админки)
    const currentUrl = page.url();
    console.log(`📍 Текущий URL: ${currentUrl}`);
    
    // Если мы уже на странице /teach/ (админка), значит залогинены
    if (currentUrl.includes('/teach/')) {
        console.log('✅ Уже авторизованы (по URL)');
        return;
    }
    
    // Проверяем наличие элементов профиля/админки
    const isAlreadyLoggedIn = await page.locator('.user-profile-box, .gc-account-leftbar, header.gc-header').first().isVisible({ timeout: 3000 }).catch(() => false);
    if (isAlreadyLoggedIn) {
        console.log('✅ Уже авторизованы (найден элемент профиля)');
        return;
    }

    console.log('🔐 Требуется вход. Ищем форму логина...');

    // Ищем поле логина (с увеличенным таймаутом)
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(config.gcLogin);

    // Ищем поле пароля
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    await passwordInput.fill(config.gcPassword);

    // Кнопка входа
    const loginButton = page.locator('button[type="submit"], .btn-login, input[type="submit"]').first();
    await loginButton.click();

    console.log('⏳ Ждем завершения входа (введите код подтверждения, если требуется)...');
    
    // Увеличиваем таймаут и ждем появления признака успешного входа (например, аватарки или изменения URL)
    // Либо просто даем пользователю время (например, 60 секунд), если он вводит код вручную
    try {
        // Пытаемся дождаться элемента профиля (признак успеха) в течение 2 минут
        await page.locator('.user-profile-box, .gc-account-leftbar, .gc-user-logined, header.gc-header').first().waitFor({ state: 'visible', timeout: 120000 });
        console.log('✅ Успешно вошли в систему!');
    } catch (e) {
        console.warn('⚠️ Не удалось автоматически подтвердить вход за 2 минуты. Проверьте браузер.');
    }

    // Ждем навигации после входа (на случай редиректов)
    // Заменяем строгий networkidle на domcontentloaded, так как GC может постоянно подгружать что-то в фоне
    await page.waitForLoadState('domcontentloaded');
  } catch (error) {
    console.error('❌ Ошибка при авторизации:', error);
    throw error;
  }
}


