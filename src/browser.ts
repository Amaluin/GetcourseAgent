import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { config } from './config';
import { setupAutoAdBlocker, closeAdsAndModals } from './ad-blocker';
import fs from 'fs';
import path from 'path';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

const SESSION_FILE = path.join(process.cwd(), 'session.json');

export async function initBrowser(): Promise<{ browser: Browser; page: Page }> {
  if (browser) {
    return { browser, page: page! };
  }

  console.log('🚀 Запускаем браузер...');
  browser = await chromium.launch({
    headless: config.headless,
    args: ['--start-maximized']
  });

  // Проверяем, есть ли сохраненная сессия
  if (fs.existsSync(SESSION_FILE)) {
      console.log('🍪 Загружаем сохраненную сессию...');
      context = await browser.newContext({
          viewport: null,
          storageState: SESSION_FILE // Загружаем куки и локал сторадж
      });
  } else {
      console.log('🆕 Сессия не найдена, начинаем новую...');
      context = await browser.newContext({
          viewport: null
      });
  }

  page = await context.newPage();
  
  // НЕ активируем автоматический блокировщик - он кликает по меню!
  // await setupAutoAdBlocker(page);
  // Вместо этого будем закрывать рекламу вручную в нужных местах
  
  // Перехватываем закрытие страницы, чтобы сохранить сессию
  context.on('close', async () => {
      // Это событие может не сработать при принудительном закрытии, поэтому лучше сохранять явно
  });

  return { browser, page };
}

// Экспортируем функцию для ручного закрытия рекламы
export { closeAdsAndModals };

export async function saveSession() {
    if (context) {
        console.log('💾 Сохраняем сессию в session.json...');
        await context.storageState({ path: SESSION_FILE });
    }
}

export async function closeBrowser() {
  if (browser) {
    // Сохраняем сессию перед закрытием
    await saveSession();

    await browser.close();
    browser = null;
    context = null;
    page = null;
  }
}


