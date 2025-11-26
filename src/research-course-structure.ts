import { initBrowser, closeBrowser, saveSession } from './browser';
import { loginToGetCourse } from './auth';
import { config } from './config';
import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface CourseInfo {
  id: string;
  title: string;
  description?: string;
  url: string;
  htmlExample?: string;
}

interface SectionInfo {
  id: string;
  title: string;
  order?: number;
  url: string;
  htmlExample?: string;
}

interface LessonInfo {
  id: string;
  title: string;
  order?: number;
  url: string;
  htmlExample?: string;
}

interface NavigationInfo {
  menuSelectors: string[];
  breadcrumbSelectors: string[];
  navigationExamples: string[];
}

interface ResearchResults {
  timestamp: string;
  baseUrl: string;
  
  // URL patterns discovered
  urls: {
    coursesListUrl?: string;
    courseUrlPattern?: string;
    sectionUrlPattern?: string;
    lessonUrlPattern?: string;
  };
  
  // Selectors discovered
  selectors: {
    courses: {
      listContainer?: string;
      courseItem?: string;
      courseId?: string;
      courseTitle?: string;
      courseDescription?: string;
      courseLink?: string;
    };
    sections: {
      listContainer?: string;
      sectionItem?: string;
      sectionId?: string;
      sectionTitle?: string;
      sectionOrder?: string;
      sectionLink?: string;
    };
    lessons: {
      listContainer?: string;
      lessonItem?: string;
      lessonId?: string;
      lessonTitle?: string;
      lessonOrder?: string;
      lessonLink?: string;
    };
    navigation: {
      menu?: string[];
      breadcrumbs?: string[];
    };
  };
  
  // Examples found
  examples: {
    courses: CourseInfo[];
    sections: SectionInfo[];
    lessons: LessonInfo[];
  };
  
  navigation: NavigationInfo;
  
  // Additional notes
  notes: string[];
}

/**
 * Wait for page to stabilize (avoid race conditions)
 */
async function waitForStability(page: Page, timeout: number = 2000) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(timeout);
}

/**
 * Extract HTML structure for documentation
 */
function extractHtmlStructure(element: any, maxLength: number = 500): string {
  if (!element) return '';
  const html = element.toString();
  return html.length > maxLength ? html.substring(0, maxLength) + '...' : html;
}

/**
 * Try to find courses on the current page
 */
async function researchCourses(page: Page, results: ResearchResults): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('📚 ИССЛЕДОВАНИЕ СТРУКТУРЫ КУРСОВ');
  console.log('='.repeat(80));
  
  const currentUrl = page.url();
  console.log(`📍 Текущий URL: ${currentUrl}`);
  results.urls.coursesListUrl = currentUrl;
  
  // Common selectors to try for course listings
  const possibleCourseSelectors = [
    '.course-item',
    '.course-card',
    '.training-item',
    '.training-card',
    '[data-course-id]',
    '[data-training-id]',
    '.offer-item',
    '.offer-card',
    '.product-item',
    '.product-card',
    'div[class*="course"]',
    'div[class*="training"]',
    'li[class*="course"]',
    'li[class*="training"]',
  ];
  
  console.log('\n🔍 Пробуем различные селекторы для списка курсов...');
  
  for (const selector of possibleCourseSelectors) {
    try {
      const elements = await page.locator(selector).all();
      if (elements.length > 0) {
        console.log(`✅ Найдено ${elements.length} элементов с селектором: ${selector}`);
        results.selectors.courses.courseItem = selector;
        
        // Try to extract information from first few courses
        const sampleSize = Math.min(3, elements.length);
        for (let i = 0; i < sampleSize; i++) {
          const element = elements[i];
          
          const courseInfo: CourseInfo = {
            id: '',
            title: '',
            url: ''
          };
          
          // Try to get ID
          const idAttributes = ['data-course-id', 'data-training-id', 'data-id', 'id'];
          for (const attr of idAttributes) {
            const id = await element.getAttribute(attr).catch(() => null);
            if (id) {
              courseInfo.id = id;
              results.selectors.courses.courseId = attr;
              break;
            }
          }
          
          // Try to get title
          const titleSelectors = [
            '.course-title', '.training-title', '.title', 'h2', 'h3', 'h4',
            '.name', '.course-name', '[class*="title"]'
          ];
          for (const titleSel of titleSelectors) {
            try {
              const titleEl = element.locator(titleSel).first();
              const count = await titleEl.count();
              if (count > 0) {
                const title = await titleEl.innerText().catch(() => '');
                if (title && title.trim()) {
                  courseInfo.title = title.trim();
                  results.selectors.courses.courseTitle = titleSel;
                  break;
                }
              }
            } catch (e) {
              // Continue trying other selectors
            }
          }
          
          // Try to get description
          const descSelectors = [
            '.course-description', '.description', '.desc', 'p',
            '[class*="description"]', '[class*="desc"]'
          ];
          for (const descSel of descSelectors) {
            try {
              const descEl = element.locator(descSel).first();
              const count = await descEl.count();
              if (count > 0) {
                const desc = await descEl.innerText().catch(() => '');
                if (desc && desc.trim() && desc.length < 500) {
                  courseInfo.description = desc.trim();
                  results.selectors.courses.courseDescription = descSel;
                  break;
                }
              }
            } catch (e) {
              // Continue trying other selectors
            }
          }
          
          // Try to get link
          const linkSelectors = ['a', '[href]'];
          for (const linkSel of linkSelectors) {
            try {
              const linkEl = element.locator(linkSel).first();
              const count = await linkEl.count();
              if (count > 0) {
                const href = await linkEl.getAttribute('href').catch(() => null);
                if (href) {
                  courseInfo.url = href.startsWith('http') ? href : 
                                  href.startsWith('/') ? `${config.gcUrl}${href}` : 
                                  `${config.gcUrl}/${href}`;
                  results.selectors.courses.courseLink = linkSel;
                  break;
                }
              }
            } catch (e) {
              // Continue
            }
          }
          
          // Get HTML example
          try {
            const html = await element.evaluate(el => el.outerHTML);
            courseInfo.htmlExample = html.substring(0, 1000);
          } catch (e) {
            // Skip
          }
          
          if (courseInfo.id || courseInfo.title) {
            console.log(`\n   📋 Курс ${i + 1}:`);
            console.log(`      ID: ${courseInfo.id || 'не найден'}`);
            console.log(`      Название: ${courseInfo.title || 'не найдено'}`);
            console.log(`      Описание: ${courseInfo.description ? courseInfo.description.substring(0, 100) + '...' : 'не найдено'}`);
            console.log(`      URL: ${courseInfo.url || 'не найден'}`);
            
            results.examples.courses.push(courseInfo);
          }
        }
        
        break; // Found working selector, stop trying others
      }
    } catch (e) {
      // Continue trying other selectors
    }
  }
  
  if (results.examples.courses.length === 0) {
    console.log('\n⚠️ Курсы не найдены с помощью стандартных селекторов');
    console.log('💡 Попробуем альтернативный подход - анализ структуры страницы...');
    
    // Try to analyze the page structure
    try {
      const pageStructure = await page.evaluate(() => {
        const body = document.body;
        const mainContent = document.querySelector('main, #main, .main-content, .content, [role="main"]');
        const container = mainContent || body;
        
        // Find all elements that might be course containers
        const possibleContainers = container.querySelectorAll('div, li, article, section');
        const results: any[] = [];
        
        possibleContainers.forEach((el) => {
          const text = el.textContent || '';
          const html = el.outerHTML;
          
          // Look for elements that have reasonable amount of text (100-5000 chars)
          // and might contain course information
          if (text.length > 100 && text.length < 5000 && 
              (html.includes('href') || html.includes('data-'))) {
            
            const links = el.querySelectorAll('a');
            const dataAttrs: string[] = [];
            
            // Collect data attributes
            Array.from(el.attributes || []).forEach(attr => {
              if (attr.name.startsWith('data-')) {
                dataAttrs.push(`${attr.name}="${attr.value}"`);
              }
            });
            
            results.push({
              tagName: el.tagName,
              className: el.className,
              dataAttributes: dataAttrs,
              linksCount: links.length,
              textLength: text.length,
              htmlPreview: html.substring(0, 500)
            });
          }
        });
        
        return results;
      });
      
      console.log(`\n📊 Найдено ${pageStructure.length} потенциальных контейнеров на странице`);
      if (pageStructure.length > 0) {
        console.log('\n🔍 Примеры структур:');
        pageStructure.slice(0, 3).forEach((struct, i) => {
          console.log(`\n   Структура ${i + 1}:`);
          console.log(`      Тег: ${struct.tagName}`);
          console.log(`      Класс: ${struct.className}`);
          console.log(`      Data атрибуты: ${struct.dataAttributes.join(', ')}`);
          console.log(`      Количество ссылок: ${struct.linksCount}`);
          console.log(`      Длина текста: ${struct.textLength}`);
        });
        
        results.notes.push(`Найдено ${pageStructure.length} потенциальных контейнеров курсов на странице`);
      }
    } catch (e) {
      console.log('⚠️ Ошибка при анализе структуры:', e);
    }
  }
  
  // Try to find navigation to courses
  console.log('\n🔍 Ищем навигацию к курсам...');
  const navSelectors = [
    'nav a:has-text("Курсы")',
    'nav a:has-text("Тренинги")',
    'a[href*="course"]',
    'a[href*="training"]',
    'a[href*="teach"]',
    '.menu a', '.nav a', 'header a'
  ];
  
  for (const navSel of navSelectors) {
    try {
      const navLinks = await page.locator(navSel).all();
      if (navLinks.length > 0) {
        console.log(`✅ Найдено ${navLinks.length} навигационных ссылок с селектором: ${navSel}`);
        for (let i = 0; i < Math.min(5, navLinks.length); i++) {
          const text = await navLinks[i].innerText().catch(() => '');
          const href = await navLinks[i].getAttribute('href').catch(() => '');
          if (text && href) {
            console.log(`   - ${text}: ${href}`);
          }
        }
      }
    } catch (e) {
      // Continue
    }
  }
}

/**
 * Try to find sections within a course
 */
async function researchSections(page: Page, results: ResearchResults, courseUrl?: string): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('📂 ИССЛЕДОВАНИЕ СТРУКТУРЫ РАЗДЕЛОВ');
  console.log('='.repeat(80));
  
  // If we have a course URL, navigate to it
  if (courseUrl) {
    console.log(`📍 Переход к курсу: ${courseUrl}`);
    try {
      await page.goto(courseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitForStability(page);
    } catch (e) {
      console.log('⚠️ Не удалось перейти к курсу:', e);
      return;
    }
  }
  
  const currentUrl = page.url();
  console.log(`📍 Текущий URL: ${currentUrl}`);
  
  // Common selectors for sections
  const possibleSectionSelectors = [
    '.section-item',
    '.section-card',
    '.module-item',
    '.module-card',
    '[data-section-id]',
    '[data-module-id]',
    'div[class*="section"]',
    'div[class*="module"]',
    'li[class*="section"]',
    'li[class*="module"]',
    '.folder-item',
    '.folder-card',
  ];
  
  console.log('\n🔍 Пробуем различные селекторы для списка разделов...');
  
  for (const selector of possibleSectionSelectors) {
    try {
      const elements = await page.locator(selector).all();
      if (elements.length > 0) {
        console.log(`✅ Найдено ${elements.length} элементов с селектором: ${selector}`);
        results.selectors.sections.sectionItem = selector;
        
        // Extract information from first few sections
        const sampleSize = Math.min(3, elements.length);
        for (let i = 0; i < sampleSize; i++) {
          const element = elements[i];
          
          const sectionInfo: SectionInfo = {
            id: '',
            title: '',
            url: ''
          };
          
          // Try to get ID
          const idAttributes = ['data-section-id', 'data-module-id', 'data-id', 'id'];
          for (const attr of idAttributes) {
            const id = await element.getAttribute(attr).catch(() => null);
            if (id) {
              sectionInfo.id = id;
              results.selectors.sections.sectionId = attr;
              break;
            }
          }
          
          // Try to get title
          const titleSelectors = [
            '.section-title', '.module-title', '.title', 'h2', 'h3', 'h4',
            '.name', '[class*="title"]'
          ];
          for (const titleSel of titleSelectors) {
            try {
              const titleEl = element.locator(titleSel).first();
              const count = await titleEl.count();
              if (count > 0) {
                const title = await titleEl.innerText().catch(() => '');
                if (title && title.trim()) {
                  sectionInfo.title = title.trim();
                  results.selectors.sections.sectionTitle = titleSel;
                  break;
                }
              }
            } catch (e) {
              // Continue
            }
          }
          
          // Try to get order
          const orderAttributes = ['data-order', 'data-position', 'data-index'];
          for (const attr of orderAttributes) {
            const order = await element.getAttribute(attr).catch(() => null);
            if (order) {
              sectionInfo.order = parseInt(order);
              results.selectors.sections.sectionOrder = attr;
              break;
            }
          }
          
          // Try to get link
          const linkSelectors = ['a', '[href]'];
          for (const linkSel of linkSelectors) {
            try {
              const linkEl = element.locator(linkSel).first();
              const count = await linkEl.count();
              if (count > 0) {
                const href = await linkEl.getAttribute('href').catch(() => null);
                if (href) {
                  sectionInfo.url = href.startsWith('http') ? href : 
                                   href.startsWith('/') ? `${config.gcUrl}${href}` : 
                                   `${config.gcUrl}/${href}`;
                  results.selectors.sections.sectionLink = linkSel;
                  break;
                }
              }
            } catch (e) {
              // Continue
            }
          }
          
          // Get HTML example
          try {
            const html = await element.evaluate(el => el.outerHTML);
            sectionInfo.htmlExample = html.substring(0, 1000);
          } catch (e) {
            // Skip
          }
          
          if (sectionInfo.id || sectionInfo.title) {
            console.log(`\n   📋 Раздел ${i + 1}:`);
            console.log(`      ID: ${sectionInfo.id || 'не найден'}`);
            console.log(`      Название: ${sectionInfo.title || 'не найдено'}`);
            console.log(`      Порядок: ${sectionInfo.order || 'не найден'}`);
            console.log(`      URL: ${sectionInfo.url || 'не найден'}`);
            
            results.examples.sections.push(sectionInfo);
          }
        }
        
        break; // Found working selector
      }
    } catch (e) {
      // Continue trying
    }
  }
  
  if (results.examples.sections.length === 0) {
    console.log('\n⚠️ Разделы не найдены с помощью стандартных селекторов');
    console.log('💡 Возможно, на этой странице нет разделов или используется другая структура');
    
    results.notes.push('Разделы не найдены на текущей странице. Возможно, нужно перейти в конкретный курс.');
  }
}

/**
 * Try to find lessons within a section
 */
async function researchLessons(page: Page, results: ResearchResults, sectionUrl?: string): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('📝 ИССЛЕДОВАНИЕ СТРУКТУРЫ УРОКОВ');
  console.log('='.repeat(80));
  
  // If we have a section URL, navigate to it
  if (sectionUrl) {
    console.log(`📍 Переход к разделу: ${sectionUrl}`);
    try {
      await page.goto(sectionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitForStability(page);
    } catch (e) {
      console.log('⚠️ Не удалось перейти к разделу:', e);
      return;
    }
  }
  
  const currentUrl = page.url();
  console.log(`📍 Текущий URL: ${currentUrl}`);
  
  // Common selectors for lessons
  const possibleLessonSelectors = [
    '.lesson-item',
    '.lesson-card',
    '[data-lesson-id]',
    'div[class*="lesson"]',
    'li[class*="lesson"]',
    '.training-item',
    '[data-training-id]',
  ];
  
  console.log('\n🔍 Пробуем различные селекторы для списка уроков...');
  
  for (const selector of possibleLessonSelectors) {
    try {
      const elements = await page.locator(selector).all();
      if (elements.length > 0) {
        console.log(`✅ Найдено ${elements.length} элементов с селектором: ${selector}`);
        results.selectors.lessons.lessonItem = selector;
        
        // Extract information from first few lessons
        const sampleSize = Math.min(5, elements.length);
        for (let i = 0; i < sampleSize; i++) {
          const element = elements[i];
          
          const lessonInfo: LessonInfo = {
            id: '',
            title: '',
            url: ''
          };
          
          // Try to get ID
          const idAttributes = ['data-lesson-id', 'data-training-id', 'data-id', 'id'];
          for (const attr of idAttributes) {
            const id = await element.getAttribute(attr).catch(() => null);
            if (id) {
              lessonInfo.id = id;
              results.selectors.lessons.lessonId = attr;
              break;
            }
          }
          
          // Try to get title
          const titleSelectors = [
            '.lesson-title', '.training-title', '.title', 'h2', 'h3', 'h4',
            '.name', '.lesson-name', '[class*="title"]'
          ];
          for (const titleSel of titleSelectors) {
            try {
              const titleEl = element.locator(titleSel).first();
              const count = await titleEl.count();
              if (count > 0) {
                const title = await titleEl.innerText().catch(() => '');
                if (title && title.trim()) {
                  lessonInfo.title = title.trim();
                  results.selectors.lessons.lessonTitle = titleSel;
                  break;
                }
              }
            } catch (e) {
              // Continue
            }
          }
          
          // Try to get order
          const orderAttributes = ['data-order', 'data-position', 'data-index'];
          for (const attr of orderAttributes) {
            const order = await element.getAttribute(attr).catch(() => null);
            if (order) {
              lessonInfo.order = parseInt(order);
              results.selectors.lessons.lessonOrder = attr;
              break;
            }
          }
          
          // Try to get link
          const linkSelectors = ['a', '[href]'];
          for (const linkSel of linkSelectors) {
            try {
              const linkEl = element.locator(linkSel).first();
              const count = await linkEl.count();
              if (count > 0) {
                const href = await linkEl.getAttribute('href').catch(() => null);
                if (href) {
                  lessonInfo.url = href.startsWith('http') ? href : 
                                  href.startsWith('/') ? `${config.gcUrl}${href}` : 
                                  `${config.gcUrl}/${href}`;
                  results.selectors.lessons.lessonLink = linkSel;
                  break;
                }
              }
            } catch (e) {
              // Continue
            }
          }
          
          // Get HTML example
          try {
            const html = await element.evaluate(el => el.outerHTML);
            lessonInfo.htmlExample = html.substring(0, 1000);
          } catch (e) {
            // Skip
          }
          
          if (lessonInfo.id || lessonInfo.title) {
            console.log(`\n   📋 Урок ${i + 1}:`);
            console.log(`      ID: ${lessonInfo.id || 'не найден'}`);
            console.log(`      Название: ${lessonInfo.title || 'не найдено'}`);
            console.log(`      Порядок: ${lessonInfo.order || 'не найден'}`);
            console.log(`      URL: ${lessonInfo.url || 'не найден'}`);
            
            results.examples.lessons.push(lessonInfo);
          }
        }
        
        break; // Found working selector
      }
    } catch (e) {
      // Continue trying
    }
  }
  
  if (results.examples.lessons.length === 0) {
    console.log('\n⚠️ Уроки не найдены с помощью стандартных селекторов');
    console.log('💡 Возможно, на этой странице нет уроков или используется другая структура');
    
    results.notes.push('Уроки не найдены на текущей странице. Возможно, нужно перейти в конкретный раздел.');
  }
}

/**
 * Research navigation patterns
 */
async function researchNavigation(page: Page, results: ResearchResults): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('🧭 ИССЛЕДОВАНИЕ НАВИГАЦИИ');
  console.log('='.repeat(80));
  
  // Research main menu
  console.log('\n🔍 Анализируем главное меню...');
  const menuSelectors = [
    'nav', '.navbar', '.menu', '.main-menu', '.navigation',
    'header nav', '[role="navigation"]', '.nav-menu'
  ];
  
  for (const selector of menuSelectors) {
    try {
      const menu = page.locator(selector).first();
      const count = await menu.count();
      if (count > 0) {
        console.log(`✅ Найдено меню с селектором: ${selector}`);
        results.selectors.navigation.menu = results.selectors.navigation.menu || [];
        results.selectors.navigation.menu.push(selector);
        
        // Get menu items
        const links = await menu.locator('a').all();
        console.log(`   Найдено ${links.length} ссылок в меню`);
        
        for (let i = 0; i < Math.min(10, links.length); i++) {
          const text = await links[i].innerText().catch(() => '');
          const href = await links[i].getAttribute('href').catch(() => '');
          if (text && href) {
            console.log(`   - ${text}: ${href}`);
            results.navigation.menuSelectors.push(`${selector} -> ${text}: ${href}`);
          }
        }
        
        break;
      }
    } catch (e) {
      // Continue
    }
  }
  
  // Research breadcrumbs
  console.log('\n🔍 Анализируем хлебные крошки (breadcrumbs)...');
  const breadcrumbSelectors = [
    '.breadcrumb', '.breadcrumbs', '[aria-label="breadcrumb"]',
    '.navigation-path', '.path', 'nav.breadcrumb', 'ol.breadcrumb'
  ];
  
  for (const selector of breadcrumbSelectors) {
    try {
      const breadcrumb = page.locator(selector).first();
      const count = await breadcrumb.count();
      if (count > 0) {
        console.log(`✅ Найдены breadcrumbs с селектором: ${selector}`);
        results.selectors.navigation.breadcrumbs = results.selectors.navigation.breadcrumbs || [];
        results.selectors.navigation.breadcrumbs.push(selector);
        
        // Get breadcrumb items
        const items = await breadcrumb.locator('a, li').all();
        console.log(`   Найдено ${items.length} элементов в breadcrumbs`);
        
        for (let i = 0; i < items.length; i++) {
          const text = await items[i].innerText().catch(() => '');
          const href = await items[i].getAttribute('href').catch(() => null);
          if (text) {
            console.log(`   ${i + 1}. ${text}${href ? ` (${href})` : ''}`);
            results.navigation.breadcrumbSelectors.push(`${text}${href ? ` -> ${href}` : ''}`);
          }
        }
        
        break;
      }
    } catch (e) {
      // Continue
    }
  }
  
  // Try to understand navigation hierarchy
  console.log('\n🔍 Анализируем иерархию навигации...');
  try {
    const navStructure = await page.evaluate(() => {
      // Look for common patterns
      const patterns = [];
      
      // Check if there's a courses -> sections -> lessons hierarchy visible
      const allLinks = document.querySelectorAll('a[href]');
      const urls: string[] = [];
      
      allLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
          urls.push(href);
        }
      });
      
      // Analyze URL patterns
      const coursePatterns = urls.filter(url => 
        url.includes('course') || url.includes('training') || url.includes('/teach/')
      );
      
      return {
        totalLinks: allLinks.length,
        courseRelatedLinks: coursePatterns.slice(0, 10)
      };
    });
    
    console.log(`📊 Найдено ${navStructure.totalLinks} ссылок на странице`);
    console.log(`📚 Из них ${navStructure.courseRelatedLinks.length} связаны с курсами/тренингами`);
    
    if (navStructure.courseRelatedLinks.length > 0) {
      console.log('\nПримеры URL связанных с курсами:');
      navStructure.courseRelatedLinks.forEach(url => {
        console.log(`   - ${url}`);
      });
    }
    
    results.navigation.navigationExamples.push(`Total links: ${navStructure.totalLinks}`);
    results.navigation.navigationExamples.push(...navStructure.courseRelatedLinks);
    
  } catch (e) {
    console.log('⚠️ Ошибка при анализе навигации:', e);
  }
}

/**
 * Try to explore different pages to discover structure
 */
async function explorePages(page: Page, results: ResearchResults): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('🗺️  ИССЛЕДОВАНИЕ РАЗЛИЧНЫХ СТРАНИЦ');
  console.log('='.repeat(80));
  
  // List of potential pages to explore
  const pagesToTry = [
    { name: 'Главная админки', url: `${config.gcUrl}/teach/control` },
    { name: 'Тренинги', url: `${config.gcUrl}/teach/control/stream` },
    { name: 'Курсы', url: `${config.gcUrl}/pl/teach/control/stream` },
    { name: 'Мои курсы', url: `${config.gcUrl}/teach/control/my-courses` },
    { name: 'Мои тренинги', url: `${config.gcUrl}/teach/control/trainings` },
  ];
  
  for (const pageInfo of pagesToTry) {
    console.log(`\n📍 Пробую страницу: ${pageInfo.name}`);
    console.log(`   URL: ${pageInfo.url}`);
    
    try {
      await page.goto(pageInfo.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await waitForStability(page, 2000);
      
      const finalUrl = page.url();
      console.log(`   ✅ Успешно загружена: ${finalUrl}`);
      
      // Quick check for interesting elements
      const hasElements = await page.evaluate(() => {
        const body = document.body;
        return {
          hasCourseElements: body.innerHTML.includes('course') || body.innerHTML.includes('курс'),
          hasSectionElements: body.innerHTML.includes('section') || body.innerHTML.includes('раздел') || body.innerHTML.includes('module'),
          hasLessonElements: body.innerHTML.includes('lesson') || body.innerHTML.includes('урок'),
          hasDataIds: body.innerHTML.includes('data-id') || body.innerHTML.includes('data-course-id'),
        };
      });
      
      console.log(`   📊 Анализ содержимого:`);
      console.log(`      Элементы курсов: ${hasElements.hasCourseElements ? '✅' : '❌'}`);
      console.log(`      Элементы разделов: ${hasElements.hasSectionElements ? '✅' : '❌'}`);
      console.log(`      Элементы уроков: ${hasElements.hasLessonElements ? '✅' : '❌'}`);
      console.log(`      Data-ID атрибуты: ${hasElements.hasDataIds ? '✅' : '❌'}`);
      
      // If this page looks promising, do detailed research
      if (hasElements.hasCourseElements || hasElements.hasDataIds) {
        console.log(`   💡 Эта страница выглядит перспективно! Проводим детальное исследование...`);
        
        await researchCourses(page, results);
        await researchSections(page, results);
        await researchLessons(page, results);
        await researchNavigation(page, results);
        
        // If we found something, no need to continue
        if (results.examples.courses.length > 0 || 
            results.examples.sections.length > 0 || 
            results.examples.lessons.length > 0) {
          console.log(`   🎉 Найдена полезная информация, останавливаем дальнейший поиск`);
          break;
        }
      }
      
    } catch (e: any) {
      console.log(`   ❌ Не удалось загрузить страницу: ${e.message}`);
      results.notes.push(`Failed to load ${pageInfo.name}: ${e.message}`);
    }
  }
}

/**
 * Save results to markdown file
 */
function saveResultsToMarkdown(results: ResearchResults): void {
  const outputPath = path.join(process.cwd(), 'research-results.md');
  
  let markdown = `# Результаты исследования структуры GetCourse\n\n`;
  markdown += `**Дата исследования:** ${results.timestamp}\n\n`;
  markdown += `**Базовый URL:** ${results.baseUrl}\n\n`;
  
  markdown += `---\n\n`;
  
  // URL Patterns
  markdown += `## 🔗 URL Структура\n\n`;
  if (results.urls.coursesListUrl) {
    markdown += `### Список курсов\n\`\`\`\n${results.urls.coursesListUrl}\n\`\`\`\n\n`;
  }
  if (results.urls.courseUrlPattern) {
    markdown += `### Паттерн URL курса\n\`\`\`\n${results.urls.courseUrlPattern}\n\`\`\`\n\n`;
  }
  if (results.urls.sectionUrlPattern) {
    markdown += `### Паттерн URL раздела\n\`\`\`\n${results.urls.sectionUrlPattern}\n\`\`\`\n\n`;
  }
  if (results.urls.lessonUrlPattern) {
    markdown += `### Паттерн URL урока\n\`\`\`\n${results.urls.lessonUrlPattern}\n\`\`\`\n\n`;
  }
  
  // Selectors
  markdown += `---\n\n## 🎯 Найденные селекторы\n\n`;
  
  // Course selectors
  markdown += `### Курсы\n\n`;
  if (results.selectors.courses.courseItem) {
    markdown += `- **Элемент курса:** \`${results.selectors.courses.courseItem}\`\n`;
  }
  if (results.selectors.courses.courseId) {
    markdown += `- **ID курса:** \`${results.selectors.courses.courseId}\`\n`;
  }
  if (results.selectors.courses.courseTitle) {
    markdown += `- **Название курса:** \`${results.selectors.courses.courseTitle}\`\n`;
  }
  if (results.selectors.courses.courseDescription) {
    markdown += `- **Описание курса:** \`${results.selectors.courses.courseDescription}\`\n`;
  }
  if (results.selectors.courses.courseLink) {
    markdown += `- **Ссылка на курс:** \`${results.selectors.courses.courseLink}\`\n`;
  }
  markdown += `\n`;
  
  // Section selectors
  markdown += `### Разделы\n\n`;
  if (results.selectors.sections.sectionItem) {
    markdown += `- **Элемент раздела:** \`${results.selectors.sections.sectionItem}\`\n`;
  }
  if (results.selectors.sections.sectionId) {
    markdown += `- **ID раздела:** \`${results.selectors.sections.sectionId}\`\n`;
  }
  if (results.selectors.sections.sectionTitle) {
    markdown += `- **Название раздела:** \`${results.selectors.sections.sectionTitle}\`\n`;
  }
  if (results.selectors.sections.sectionOrder) {
    markdown += `- **Порядок раздела:** \`${results.selectors.sections.sectionOrder}\`\n`;
  }
  if (results.selectors.sections.sectionLink) {
    markdown += `- **Ссылка на раздел:** \`${results.selectors.sections.sectionLink}\`\n`;
  }
  markdown += `\n`;
  
  // Lesson selectors
  markdown += `### Уроки\n\n`;
  if (results.selectors.lessons.lessonItem) {
    markdown += `- **Элемент урока:** \`${results.selectors.lessons.lessonItem}\`\n`;
  }
  if (results.selectors.lessons.lessonId) {
    markdown += `- **ID урока:** \`${results.selectors.lessons.lessonId}\`\n`;
  }
  if (results.selectors.lessons.lessonTitle) {
    markdown += `- **Название урока:** \`${results.selectors.lessons.lessonTitle}\`\n`;
  }
  if (results.selectors.lessons.lessonOrder) {
    markdown += `- **Порядок урока:** \`${results.selectors.lessons.lessonOrder}\`\n`;
  }
  if (results.selectors.lessons.lessonLink) {
    markdown += `- **Ссылка на урок:** \`${results.selectors.lessons.lessonLink}\`\n`;
  }
  markdown += `\n`;
  
  // Navigation selectors
  markdown += `### Навигация\n\n`;
  if (results.selectors.navigation.menu && results.selectors.navigation.menu.length > 0) {
    markdown += `**Меню:**\n`;
    results.selectors.navigation.menu.forEach(sel => {
      markdown += `- \`${sel}\`\n`;
    });
    markdown += `\n`;
  }
  if (results.selectors.navigation.breadcrumbs && results.selectors.navigation.breadcrumbs.length > 0) {
    markdown += `**Breadcrumbs:**\n`;
    results.selectors.navigation.breadcrumbs.forEach(sel => {
      markdown += `- \`${sel}\`\n`;
    });
    markdown += `\n`;
  }
  
  // Examples
  markdown += `---\n\n## 📋 Найденные примеры\n\n`;
  
  // Course examples
  if (results.examples.courses.length > 0) {
    markdown += `### Курсы (${results.examples.courses.length} найдено)\n\n`;
    results.examples.courses.forEach((course, i) => {
      markdown += `#### Курс ${i + 1}\n\n`;
      markdown += `- **ID:** ${course.id || 'не найден'}\n`;
      markdown += `- **Название:** ${course.title || 'не найдено'}\n`;
      if (course.description) {
        markdown += `- **Описание:** ${course.description.substring(0, 200)}...\n`;
      }
      markdown += `- **URL:** ${course.url || 'не найден'}\n`;
      if (course.htmlExample) {
        markdown += `\n**HTML пример:**\n\`\`\`html\n${course.htmlExample.substring(0, 500)}...\n\`\`\`\n`;
      }
      markdown += `\n`;
    });
  }
  
  // Section examples
  if (results.examples.sections.length > 0) {
    markdown += `### Разделы (${results.examples.sections.length} найдено)\n\n`;
    results.examples.sections.forEach((section, i) => {
      markdown += `#### Раздел ${i + 1}\n\n`;
      markdown += `- **ID:** ${section.id || 'не найден'}\n`;
      markdown += `- **Название:** ${section.title || 'не найдено'}\n`;
      if (section.order !== undefined) {
        markdown += `- **Порядок:** ${section.order}\n`;
      }
      markdown += `- **URL:** ${section.url || 'не найден'}\n`;
      if (section.htmlExample) {
        markdown += `\n**HTML пример:**\n\`\`\`html\n${section.htmlExample.substring(0, 500)}...\n\`\`\`\n`;
      }
      markdown += `\n`;
    });
  }
  
  // Lesson examples
  if (results.examples.lessons.length > 0) {
    markdown += `### Уроки (${results.examples.lessons.length} найдено)\n\n`;
    results.examples.lessons.forEach((lesson, i) => {
      markdown += `#### Урок ${i + 1}\n\n`;
      markdown += `- **ID:** ${lesson.id || 'не найден'}\n`;
      markdown += `- **Название:** ${lesson.title || 'не найдено'}\n`;
      if (lesson.order !== undefined) {
        markdown += `- **Порядок:** ${lesson.order}\n`;
      }
      markdown += `- **URL:** ${lesson.url || 'не найден'}\n`;
      if (lesson.htmlExample) {
        markdown += `\n**HTML пример:**\n\`\`\`html\n${lesson.htmlExample.substring(0, 500)}...\n\`\`\`\n`;
      }
      markdown += `\n`;
    });
  }
  
  // Navigation examples
  if (results.navigation.navigationExamples.length > 0 || 
      results.navigation.menuSelectors.length > 0 || 
      results.navigation.breadcrumbSelectors.length > 0) {
    markdown += `### Навигация\n\n`;
    
    if (results.navigation.menuSelectors.length > 0) {
      markdown += `**Элементы меню:**\n`;
      results.navigation.menuSelectors.forEach(item => {
        markdown += `- ${item}\n`;
      });
      markdown += `\n`;
    }
    
    if (results.navigation.breadcrumbSelectors.length > 0) {
      markdown += `**Breadcrumb элементы:**\n`;
      results.navigation.breadcrumbSelectors.forEach(item => {
        markdown += `- ${item}\n`;
      });
      markdown += `\n`;
    }
    
    if (results.navigation.navigationExamples.length > 0) {
      markdown += `**Примеры навигационных URL:**\n`;
      results.navigation.navigationExamples.forEach(item => {
        markdown += `- ${item}\n`;
      });
      markdown += `\n`;
    }
  }
  
  // Notes
  if (results.notes.length > 0) {
    markdown += `---\n\n## 📝 Примечания\n\n`;
    results.notes.forEach(note => {
      markdown += `- ${note}\n`;
    });
    markdown += `\n`;
  }
  
  // Conclusions for Phase 2
  markdown += `---\n\n## 🎯 Выводы для Фазы 2\n\n`;
  markdown += `### Готовность к созданию парсера\n\n`;
  
  const hasCourseSelectors = results.selectors.courses.courseItem && results.examples.courses.length > 0;
  const hasSectionSelectors = results.selectors.sections.sectionItem && results.examples.sections.length > 0;
  const hasLessonSelectors = results.selectors.lessons.lessonItem && results.examples.lessons.length > 0;
  
  markdown += `- **Парсер курсов:** ${hasCourseSelectors ? '✅ Готов' : '❌ Требует дополнительного исследования'}\n`;
  markdown += `- **Парсер разделов:** ${hasSectionSelectors ? '✅ Готов' : '❌ Требует дополнительного исследования'}\n`;
  markdown += `- **Парсер уроков:** ${hasLessonSelectors ? '✅ Готов' : '❌ Требует дополнительного исследования'}\n`;
  markdown += `\n`;
  
  if (hasCourseSelectors || hasSectionSelectors || hasLessonSelectors) {
    markdown += `### Рекомендуемая структура модуля course-parser.ts\n\n`;
    markdown += `\`\`\`typescript\n`;
    markdown += `export interface Course {\n`;
    markdown += `  id: string;\n`;
    markdown += `  title: string;\n`;
    markdown += `  description?: string;\n`;
    markdown += `  url: string;\n`;
    markdown += `}\n\n`;
    markdown += `export interface Section {\n`;
    markdown += `  id: string;\n`;
    markdown += `  title: string;\n`;
    markdown += `  order?: number;\n`;
    markdown += `  url: string;\n`;
    markdown += `  courseId: string;\n`;
    markdown += `}\n\n`;
    markdown += `export interface LessonInfo {\n`;
    markdown += `  id: string;\n`;
    markdown += `  title: string;\n`;
    markdown += `  order?: number;\n`;
    markdown += `  url: string;\n`;
    markdown += `  sectionId: string;\n`;
    markdown += `}\n\n`;
    markdown += `export async function getCourses(page: Page): Promise<Course[]> {\n`;
    markdown += `  // Implementation based on selectors found\n`;
    markdown += `}\n\n`;
    markdown += `export async function getCourseSections(page: Page, courseId: string): Promise<Section[]> {\n`;
    markdown += `  // Implementation based on selectors found\n`;
    markdown += `}\n\n`;
    markdown += `export async function getSectionLessons(page: Page, sectionId: string): Promise<LessonInfo[]> {\n`;
    markdown += `  // Implementation based on selectors found\n`;
    markdown += `}\n`;
    markdown += `\`\`\`\n\n`;
  }
  
  markdown += `### Следующие шаги\n\n`;
  
  if (!hasCourseSelectors) {
    markdown += `1. ❗ Дополнительное исследование для поиска селекторов курсов\n`;
  }
  if (!hasSectionSelectors) {
    markdown += `1. ❗ Дополнительное исследование для поиска селекторов разделов\n`;
  }
  if (!hasLessonSelectors) {
    markdown += `1. ❗ Дополнительное исследование для поиска селекторов уроков\n`;
  }
  
  if (hasCourseSelectors && hasSectionSelectors && hasLessonSelectors) {
    markdown += `1. ✅ Создать модуль \`src/course-parser.ts\` с функциями парсинга\n`;
    markdown += `2. ✅ Реализовать функции \`getCourses()\`, \`getCourseSections()\`, \`getSectionLessons()\`\n`;
    markdown += `3. ✅ Добавить обработку ошибок и логирование\n`;
    markdown += `4. ✅ Протестировать на реальных данных\n`;
    markdown += `5. ✅ Интегрировать с существующей системой (GraphRAG, KAG)\n`;
  } else {
    markdown += `1. 🔍 Провести ручное исследование в браузере (headless: false)\n`;
    markdown += `2. 🔍 Найти недостающие селекторы\n`;
    markdown += `3. 🔄 Повторно запустить исследовательский скрипт\n`;
  }
  
  fs.writeFileSync(outputPath, markdown);
  console.log(`\n✅ Результаты сохранены в файл: ${outputPath}`);
}

/**
 * Save results to JSON file
 */
function saveResultsToJson(results: ResearchResults): void {
  const outputPath = path.join(process.cwd(), 'research-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`✅ Результаты сохранены в JSON файл: ${outputPath}`);
}

/**
 * Main research function
 */
async function main() {
  console.log('🔬 ЗАПУСК ИССЛЕДОВАНИЯ СТРУКТУРЫ GETCOURSE');
  console.log('='.repeat(80));
  console.log('');
  console.log('Цель: Определить селекторы и URL структуру для создания парсера курсов');
  console.log('');
  
  const results: ResearchResults = {
    timestamp: new Date().toISOString(),
    baseUrl: config.gcUrl,
    urls: {},
    selectors: {
      courses: {},
      sections: {},
      lessons: {},
      navigation: {}
    },
    examples: {
      courses: [],
      sections: [],
      lessons: []
    },
    navigation: {
      menuSelectors: [],
      breadcrumbSelectors: [],
      navigationExamples: []
    },
    notes: []
  };
  
  const { page } = await initBrowser();
  
  try {
    // 1. Login
    await loginToGetCourse(page);
    await saveSession();
    
    console.log('\n✅ Авторизация успешна\n');
    
    // 2. Try to go to stream URL (might have courses/sections/lessons)
    if (config.gcStreamUrl) {
      console.log(`📍 Переход к stream: ${config.gcStreamUrl}`);
      await page.goto(config.gcStreamUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitForStability(page);
    }
    
    // 3. Research current page first
    console.log('\n🔍 Исследуем текущую страницу...');
    await researchCourses(page, results);
    await researchSections(page, results);
    await researchLessons(page, results);
    await researchNavigation(page, results);
    
    // 4. If we didn't find much, explore other pages
    if (results.examples.courses.length === 0 && 
        results.examples.sections.length === 0 && 
        results.examples.lessons.length === 0) {
      console.log('\n💡 На текущей странице мало информации, исследуем другие страницы...');
      await explorePages(page, results);
    }
    
    // 5. Try to navigate through found courses/sections/lessons
    if (results.examples.courses.length > 0 && results.examples.sections.length === 0) {
      console.log('\n🔗 Пробуем перейти в первый курс для поиска разделов...');
      const firstCourse = results.examples.courses[0];
      if (firstCourse.url) {
        await researchSections(page, results, firstCourse.url);
      }
    }
    
    if (results.examples.sections.length > 0 && results.examples.lessons.length === 0) {
      console.log('\n🔗 Пробуем перейти в первый раздел для поиска уроков...');
      const firstSection = results.examples.sections[0];
      if (firstSection.url) {
        await researchLessons(page, results, firstSection.url);
      }
    }
    
    // 6. Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 ИТОГОВАЯ СТАТИСТИКА');
    console.log('='.repeat(80));
    console.log(`\n✅ Курсов найдено: ${results.examples.courses.length}`);
    console.log(`✅ Разделов найдено: ${results.examples.sections.length}`);
    console.log(`✅ Уроков найдено: ${results.examples.lessons.length}`);
    console.log(`✅ Селекторов курсов: ${Object.keys(results.selectors.courses).filter(k => results.selectors.courses[k as keyof typeof results.selectors.courses]).length}`);
    console.log(`✅ Селекторов разделов: ${Object.keys(results.selectors.sections).filter(k => results.selectors.sections[k as keyof typeof results.selectors.sections]).length}`);
    console.log(`✅ Селекторов уроков: ${Object.keys(results.selectors.lessons).filter(k => results.selectors.lessons[k as keyof typeof results.selectors.lessons]).length}`);
    console.log(`✅ Примечаний: ${results.notes.length}`);
    
    // 7. Save results
    console.log('\n💾 Сохраняем результаты...');
    saveResultsToMarkdown(results);
    saveResultsToJson(results);
    
    console.log('\n' + '='.repeat(80));
    console.log('🎉 ИССЛЕДОВАНИЕ ЗАВЕРШЕНО');
    console.log('='.repeat(80));
    console.log('\nРезультаты сохранены в:');
    console.log('  - research-results.md (документация)');
    console.log('  - research-results.json (данные)');
    console.log('\nПроверьте файлы для деталей и продолжайте с Фазой 2! 🚀');
    
  } catch (error) {
    console.error('❌ Ошибка при исследовании:', error);
    results.notes.push(`Error occurred: ${error}`);
    
    // Still save whatever we found
    saveResultsToMarkdown(results);
    saveResultsToJson(results);
    
    throw error;
  } finally {
    await closeBrowser();
  }
}

// Run the research
main().catch(error => {
  console.error('💥 Критическая ошибка:', error);
  process.exit(1);
});
