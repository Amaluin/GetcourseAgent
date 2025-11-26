import OpenAI from 'openai';
import { config } from './config';
import { AIFeedback, HomeworkSubmission } from './types';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { GoogleGenerativeAI } from '@google/generative-ai';

const openai = new OpenAI({
  apiKey: config.groqApiKey || config.openaiApiKey,
  baseURL: "https://api.groq.com/openai/v1"
});

// Инициализация Google Gemini (если есть ключ)
let genAI: GoogleGenerativeAI | null = null;
if (config.geminiApiKey) {
  genAI = new GoogleGenerativeAI(config.geminiApiKey);
}

// Функция для скачивания файла
async function downloadFile(url: string, filename: string): Promise<string> {
  const filepath = path.join(process.cwd(), 'temp', filename);
  
  // Создаем папку temp если её нет
  if (!fs.existsSync(path.join(process.cwd(), 'temp'))) {
    fs.mkdirSync(path.join(process.cwd(), 'temp'));
  }

  const response = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(filepath, response.data);
  return filepath;
}

// Функция для чтения JSON файла
async function readJsonFile(url: string): Promise<string> {
  try {
    const response = await axios.get(url);
    return JSON.stringify(response.data, null, 2);
  } catch (error) {
    console.warn(`   ⚠️ Не удалось прочитать JSON: ${error}`);
    return '';
  }
}

// Функция для чтения ZIP архива
async function readZipFile(url: string): Promise<string> {
  try {
    console.log(`   🤐 Скачиваю и читаю ZIP архив: ${url}`);
    // Скачиваем архив
    const filename = `temp_${Date.now()}.zip`;
    const filepath = await downloadFile(url, filename);
    
    const zip = new AdmZip(filepath);
    const zipEntries = zip.getEntries();
    
    let zipContent = `Структура архива:\n`;
    
    for (const entry of zipEntries) {
        zipContent += `- ${entry.entryName}\n`;
        
        // Читаем содержимое интересных файлов (json, txt, js, html, css)
        if (!entry.isDirectory && /\.(json|txt|js|ts|html|css|md)$/i.test(entry.entryName)) {
            // Ограничиваем размер файла для чтения (например, 10кб)
            if (entry.header.size < 10000) {
                const text = zip.readAsText(entry);
                zipContent += `--- Содержимое файла ${entry.entryName} ---\n${text.substring(0, 2000)}\n--- Конец файла ${entry.entryName} ---\n\n`;
            }
        }
    }
    
    // Удаляем временный файл
    fs.unlinkSync(filepath);
    
    return zipContent;
  } catch (error) {
    console.warn(`   ⚠️ Не удалось прочитать ZIP: ${error}`);
    return '[Ошибка чтения ZIP архива]';
  }
}

// Функция для анализа изображения через Google Gemini Vision API
async function analyzeImageWithGemini(imageUrl: string): Promise<string> {
  if (!genAI) {
    return '[Google Gemini API ключ не настроен]';
  }

  try {
    console.log(`   🖼️ Анализирую изображение через Gemini: ${imageUrl.substring(0, 50)}...`);
    
    // Скачиваем изображение
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const base64Image = Buffer.from(response.data).toString('base64');
    
    // Определяем MIME тип
    let mimeType = 'image/jpeg';
    if (imageUrl.toLowerCase().endsWith('.png')) mimeType = 'image/png';
    if (imageUrl.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
    if (imageUrl.toLowerCase().endsWith('.gif')) mimeType = 'image/gif';
    
    // Используем Gemini 1.5 Flash (стабильная версия)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType
        }
      },
      "Опиши подробно, что изображено на этом скриншоте. Это скриншот выполненного задания студента по No-Code разработке. Обрати внимание на все детали, текст, элементы интерфейса, настройки, блоки кода."
    ]);
    
    const text = result.response.text();
    return text || '[Не удалось получить описание]';
    
  } catch (error: any) {
    console.warn(`   ⚠️ Ошибка при анализе изображения через Gemini: ${error.message || error}`);
    // Если модель не найдена, попробуем вывести список (для отладки) или просто вернем ошибку
    return `[Ошибка анализа изображения: ${error.message || 'Неизвестная ошибка'}. Считай, что скриншот есть, но я его не вижу.]`;
  }
}

// Функция для анализа изображения через vision API (устаревшая, оставлена для совместимости)
async function analyzeImage(imageUrl: string): Promise<string> {
  // Используем Gemini если доступен, иначе возвращаем заглушку
  if (genAI) {
    return await analyzeImageWithGemini(imageUrl);
  }
  
  return '[Vision API не настроен. Добавьте GEMINI_API_KEY в .env]';
}

// Функция для умной обработки имени студента
function processStudentName(fullName: string): string {
  // Словарь транслитерации распространенных русских имен
  const translitMap: Record<string, string> = {
    'andrey': 'Андрей', 'andrew': 'Андрей', 'andrei': 'Андрей',
    'sergey': 'Сергей', 'sergei': 'Сергей', 'serge': 'Сергей',
    'alexander': 'Александр', 'alex': 'Александр', 'sasha': 'Саша',
    'dmitry': 'Дмитрий', 'dmitriy': 'Дмитрий', 'dima': 'Дима',
    'vladimir': 'Владимир', 'vova': 'Вова', 'volodya': 'Володя',
    'nikolay': 'Николай', 'nikolai': 'Николай', 'kolya': 'Коля',
    'mikhail': 'Михаил', 'michael': 'Михаил', 'misha': 'Миша',
    'ivan': 'Иван', 'vanya': 'Ваня',
    'pavel': 'Павел', 'paul': 'Павел', 'pasha': 'Паша',
    'alexey': 'Алексей', 'aleksey': 'Алексей', 'alexei': 'Алексей', 'alyosha': 'Алёша',
    'evgeny': 'Евгений', 'evgeniy': 'Евгений', 'eugene': 'Евгений', 'zhenya': 'Женя',
    'maxim': 'Максим', 'maksim': 'Максим', 'max': 'Макс',
    'roman': 'Роман', 'roma': 'Рома',
    'igor': 'Игорь',
    'oleg': 'Олег',
    'artem': 'Артём', 'artyom': 'Артём',
    'denis': 'Денис', 'denys': 'Денис',
    'konstantin': 'Константин', 'kostya': 'Костя',
    'stanislav': 'Станислав', 'stas': 'Стас',
    'victor': 'Виктор', 'viktor': 'Виктор', 'vitya': 'Витя',
    'yuri': 'Юрий', 'yury': 'Юрий', 'yura': 'Юра',
    'anton': 'Антон', 'tosha': 'Тоша',
    'kirill': 'Кирилл',
    'vadim': 'Вадим',
    'ilya': 'Илья', 'ilia': 'Илья',
    'gleb': 'Глеб',
    'ruslan': 'Руслан',
    'timur': 'Тимур',
    'daniil': 'Даниил', 'daniel': 'Даниил', 'danila': 'Данила',
    'egor': 'Егор', 'yegor': 'Егор',
    'mark': 'Марк',
    'matvey': 'Матвей', 'matvei': 'Матвей',
    'fedor': 'Фёдор', 'fyodor': 'Фёдор', 'fedya': 'Федя',
    // Женские имена
    'anna': 'Анна', 'anya': 'Аня',
    'maria': 'Мария', 'mariya': 'Мария', 'masha': 'Маша',
    'elena': 'Елена', 'lena': 'Лена',
    'olga': 'Ольга', 'olya': 'Оля',
    'tatyana': 'Татьяна', 'tatiana': 'Татьяна', 'tanya': 'Таня',
    'natalia': 'Наталья', 'natalya': 'Наталья', 'natasha': 'Наташа',
    'irina': 'Ирина', 'ira': 'Ира',
    'svetlana': 'Светлана', 'sveta': 'Света',
    'ekaterina': 'Екатерина', 'catherine': 'Екатерина', 'katya': 'Катя',
    'victoria': 'Виктория', 'viktoriya': 'Виктория', 'vika': 'Вика',
    'yulia': 'Юлия', 'julia': 'Юлия', 'yuliya': 'Юлия',
    'daria': 'Дарья', 'darya': 'Дарья', 'dasha': 'Даша',
    'anastasia': 'Анастасия', 'anastasiya': 'Анастасия', 'nastya': 'Настя',
    'oksana': 'Оксана',
    'marina': 'Марина',
    'larisa': 'Лариса',
    'galina': 'Галина', 'galya': 'Галя',
    'valentina': 'Валентина', 'valya': 'Валя',
    'lyudmila': 'Людмила', 'lyuda': 'Люда',
    'vera': 'Вера',
    'nadezhda': 'Надежда', 'nadya': 'Надя',
    'lyubov': 'Любовь', 'lyuba': 'Люба',
    'polina': 'Полина', 'paulina': 'Полина',
    'alina': 'Алина',
    'karina': 'Карина',
    'kristina': 'Кристина',
    'sofia': 'София', 'sofiya': 'София', 'sonya': 'Соня',
    'veronika': 'Вероника',
    'valeria': 'Валерия', 'valeriya': 'Валерия', 'lera': 'Лера',
    'diana': 'Диана',
    'milana': 'Милана',
    'arina': 'Арина'
  };

  const parts = fullName.trim().split(/\s+/);
  
  if (parts.length === 0) return fullName;
  
  // Проверяем, есть ли кириллица в имени
  const hasCyrillic = /[а-яё]/i.test(fullName);
  
  if (hasCyrillic) {
    // Если есть кириллица, берем первое слово (обычно это имя)
    return parts[0];
  }
  
  // Если латиница, пытаемся транслитерировать
  const firstWord = parts[0].toLowerCase();
  const secondWord = parts.length > 1 ? parts[1].toLowerCase() : '';
  
  // Проверяем первое слово
  if (translitMap[firstWord]) {
    return translitMap[firstWord];
  }
  
  // Проверяем второе слово (может быть "Фамилия Имя")
  if (secondWord && translitMap[secondWord]) {
    return translitMap[secondWord];
  }
  
  // Если не нашли в словаре, возвращаем первое слово с заглавной буквы
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
}

export async function checkHomework(submission: HomeworkSubmission, graphRAGContext?: string): Promise<AIFeedback> {
  console.log(`🧠 AI анализирует работу студента: ${submission.studentName}`);
  
  // Debug ключей (скрываем часть ключа)
  console.log(`   🔑 Gemini Key: ${config.geminiApiKey ? 'PRESENT (' + config.geminiApiKey.substring(0, 5) + '...)' : 'MISSING'}`);

  // Обрабатываем имя студента
  const firstName = processStudentName(submission.studentName);
  console.log(`   👤 Обращение к студенту: ${firstName}`);
  console.log(`   📝 ВАЖНО: Обращение строго на "вы" (вежливая форма)`);

  // Формируем промпт с учетом задания и идеального ответа
  let prompt = `
    Ты — опытный преподаватель по No-Code разработке. Твоя задача — проверить домашнее задание студента.
    
    ВАЖНО: Обращайся к студенту СТРОГО на "вы" (вежливая форма). НИКОГДА не используй "ты" или "твой/твоя". Всегда пиши "вы", "ваш/ваша", "ваше".
    
    ВАЖНО: Обращайся к студенту по имени! Имя студента для обращения: ${firstName}
    
    Название урока: ${submission.assignmentTitle}
  `;

  // Ограничения длины для оптимизации токенов (Groq лимит 12000)
  const MAX_TASK_LENGTH = 2000;           // Максимум символов для текста задания
  const MAX_IDEAL_ANSWER_LENGTH = 1500;   // Максимум для идеального ответа
  const MAX_LESSON_SUMMARY_LENGTH = 1000;  // Максимум для выжимки урока
  const MAX_STUDENT_TEXT_LENGTH = 3000;    // Максимум для ответа студента
  const MAX_JSON_CONTENT_LENGTH = 2000;    // Максимум для JSON файла
  const MAX_GRAPHRAG_CONTEXT_LENGTH = 1500; // Максимум для контекста GraphRAG

  // ДОБАВЛЯЕМ: Контекст из GraphRAG (база знаний) - ограниченная длина
  if (graphRAGContext) {
    const limitedContext = graphRAGContext.length > MAX_GRAPHRAG_CONTEXT_LENGTH
      ? graphRAGContext.substring(0, MAX_GRAPHRAG_CONTEXT_LENGTH) + '... [обрезано]'
      : graphRAGContext;
    console.log('\n=== КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ (GraphRAG) ===');
    console.log(limitedContext);
    console.log('==========================================\n');
    prompt += `\n\n${limitedContext}`;
  }

  // ДОБАВЛЯЕМ: Выжимка урока (что объяснялось) - ограниченная длина
  if (submission.lessonContent?.summary) {
    const lessonSummary = submission.lessonContent.summary.length > MAX_LESSON_SUMMARY_LENGTH
      ? submission.lessonContent.summary.substring(0, MAX_LESSON_SUMMARY_LENGTH) + '... [обрезано]'
      : submission.lessonContent.summary;
    console.log('\n=== ВЫЖИМКА УРОКА ===');
    console.log(lessonSummary);
    console.log('=====================\n');
    prompt += `\n\n=== ЧТО ОБЪЯСНЯЛОСЬ В УРОКЕ ===\n${lessonSummary}\n=== КОНЕЦ ВЫЖИМКИ УРОКА ===`;
  }

  if (submission.taskDescription) {
    const taskDesc = submission.taskDescription.length > MAX_TASK_LENGTH
      ? submission.taskDescription.substring(0, MAX_TASK_LENGTH) + '... [обрезано]'
      : submission.taskDescription;
    console.log('\n=== ТЕКСТ ЗАДАНИЯ ===');
    console.log(taskDesc);
    console.log('======================\n');
    prompt += `\n\nТекст задания:\n${taskDesc}`;
  }

  if (submission.idealAnswer) {
    const idealAns = submission.idealAnswer.length > MAX_IDEAL_ANSWER_LENGTH
      ? submission.idealAnswer.substring(0, MAX_IDEAL_ANSWER_LENGTH) + '... [обрезано]'
      : submission.idealAnswer;
    console.log('\n=== ИДЕАЛЬНЫЙ ОТВЕТ ===');
    console.log(idealAns);
    console.log('========================\n');
    prompt += `\n\nИдеальный ответ (эталон):\n${idealAns}`;
  }

  // Ограничиваем длину ответа студента
  const studentText = submission.text.length > MAX_STUDENT_TEXT_LENGTH
    ? submission.text.substring(0, MAX_STUDENT_TEXT_LENGTH) + '... [обрезано]'
    : submission.text;
  
  // Проверяем, есть ли у студента данные (скриншоты, файлы), даже если нет текста
  const hasData = submission.text.trim().length > 0 || submission.imageUrls.length > 0 || submission.fileUrls.length > 0;
  
  if (submission.text.trim().length > 0) {
    prompt += `\n\nОтвет студента (текст):\n"${studentText}"`;
    if (submission.text.length > MAX_STUDENT_TEXT_LENGTH) {
      console.log(`   ⚠️  Ответ студента обрезан с ${submission.text.length} до ${MAX_STUDENT_TEXT_LENGTH} символов`);
    }
  } else {
    prompt += `\n\nОтвет студента (текст): [Текстовый комментарий отсутствует]`;
    console.log(`   ℹ️  Студент не написал текстовый комментарий`);
    
    if (hasData) {
      prompt += `\n\n⚠️ ВАЖНО: Студент НЕ написал текстовый комментарий, но предоставил другие данные (скриншоты, файлы). Это НЕ ошибка - считай, что задание выполнено через предоставленные материалы!`;
      console.log(`   ✅ Но есть другие данные: ${submission.imageUrls.length} скриншотов, ${submission.fileUrls.length} файлов`);
    }
  }

  // Проверяем наличие ссылок в ответе студента
  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/gi;
  const linksInText = submission.text.match(urlPattern) || [];
  const hasLinks = linksInText.length > 0;
  
  // Проверяем наличие файлов и скриншотов
  const hasFiles = submission.fileUrls.length > 0;
  const hasImages = submission.imageUrls.length > 0;
  const hasZip = submission.fileUrls.some(url => url.toLowerCase().endsWith('.zip'));
  
  // Проверяем, требуется ли ссылка/файлы/скриншоты в задании
  const taskText = (submission.taskDescription || '') + (submission.idealAnswer || '');
  const requiresLink = /(ссылка|link|url|http|https|адрес|сайт|страница|проект|приложение|деплой|deploy|github|репозиторий|repository)/i.test(taskText);
  const requiresFiles = /(файл|file|архив|archive|zip|проект|project)/i.test(taskText);
  const requiresScreenshots = /(скриншот|screenshot|скрин|screenshot|изображение|image|фото|photo|картинка)/i.test(taskText);
  
  // Проверяем, есть ли в задании варианты через "ИЛИ" (или, or, либо)
  const hasOrOptions = /(или|or|либо|\||\/)/i.test(taskText);
  
  console.log(`   📋 Проверка формата сдачи:`);
  console.log(`      Требуется ссылка: ${requiresLink ? '✅ Да' : '❌ Нет'}`);
  console.log(`      Требуются файлы: ${requiresFiles ? '✅ Да' : '❌ Нет'}`);
  console.log(`      Требуются скриншоты: ${requiresScreenshots ? '✅ Да' : '❌ Нет'}`);
  console.log(`      Есть варианты через "ИЛИ": ${hasOrOptions ? '✅ Да' : '❌ Нет'}`);
  console.log(`      Студент предоставил:`);
  console.log(`         - Ссылок: ${linksInText.length}`);
  console.log(`         - Файлов: ${submission.fileUrls.length}`);
  console.log(`         - Скриншотов: ${submission.imageUrls.length}`);
  
  // Определяем, выполнил ли студент требование
  const hasProvidedSomething = hasLinks || hasFiles || hasImages;
  const requirementMet = (requiresLink && hasLinks) || 
                         (requiresFiles && hasFiles) || 
                         (requiresScreenshots && hasImages) ||
                         (hasOrOptions && hasProvidedSomething); // Если есть "ИЛИ", достаточно одного варианта
  
  // Добавляем информацию в промпт
  if (requiresLink || requiresFiles || requiresScreenshots) {
    prompt += `\n\n=== ФОРМАТ СДАЧИ ===`;
    prompt += `\nТребования из задания:`;
    if (requiresLink) prompt += `\n- Ссылка (GitHub, репозиторий, проект)`;
    if (requiresFiles) prompt += `\n- Файлы/архив проекта`;
    if (requiresScreenshots) prompt += `\n- Скриншоты`;
    if (hasOrOptions) {
      prompt += `\n\n⚠️ ВАЖНО: В задании указаны варианты через "ИЛИ" - достаточно предоставить ОДИН из вариантов!`;
    }
    
    prompt += `\n\nЧто предоставил студент:`;
    if (hasLinks) {
      prompt += `\n✅ Ссылки (${linksInText.length}):`;
      linksInText.slice(0, 5).forEach((link, i) => {
        prompt += `\n   ${i + 1}. ${link}`;
      });
    }
    if (hasFiles) {
      prompt += `\n✅ Файлы (${submission.fileUrls.length}):`;
      submission.fileUrls.slice(0, 5).forEach((file, i) => {
        const fileName = file.split('/').pop() || file;
        prompt += `\n   ${i + 1}. ${fileName}`;
      });
    }
    if (hasImages) {
      prompt += `\n✅ Скриншоты (${submission.imageUrls.length})`;
    }
    
    if (!hasProvidedSomething) {
      prompt += `\n❌ Студент НЕ предоставил ни одного из требуемых вариантов!`;
    } else if (hasOrOptions && hasProvidedSomething) {
      prompt += `\n✅ Студент предоставил хотя бы один вариант - требование выполнено!`;
    } else if (!requirementMet) {
      prompt += `\n⚠️ Студент предоставил не то, что требовалось в задании.`;
    }
    
    prompt += `\n=== КОНЕЦ ПРОВЕРКИ ФОРМАТА СДАЧИ ===`;
  }

  // Анализируем JSON и ZIP файлы
  if (submission.fileUrls.length > 0) {
    console.log(`   📄 Обрабатываю ${submission.fileUrls.length} файл(ов)...`);
    for (const fileUrl of submission.fileUrls) {
      const fileName = fileUrl.split('/').pop() || '';

      if (fileName.endsWith('.json')) {
        const jsonContent = await readJsonFile(fileUrl);
        if (jsonContent) {
          const limitedJson = jsonContent.length > MAX_JSON_CONTENT_LENGTH
            ? jsonContent.substring(0, MAX_JSON_CONTENT_LENGTH) + '... [обрезано]'
            : jsonContent;
          prompt += `\n\n=== СОДЕРЖИМОЕ JSON ФАЙЛА (${fileName}) ===\n${limitedJson}\n=== КОНЕЦ JSON ФАЙЛА ===`;
          console.log(`   ✅ Прочитан JSON файл (${jsonContent.length} символов, отправлено ${limitedJson.length})`);
        }
      } else if (fileName.endsWith('.zip')) {
         const zipContent = await readZipFile(fileUrl);
         if (zipContent) {
             // ZIP архивы тоже ограничиваем
             const limitedZip = zipContent.length > MAX_JSON_CONTENT_LENGTH
               ? zipContent.substring(0, MAX_JSON_CONTENT_LENGTH) + '... [обрезано]'
               : zipContent;
             prompt += `\n\n=== СОДЕРЖИМОЕ ZIP АРХИВА (${fileName}) ===\n${limitedZip}\n=== КОНЕЦ ZIP АРХИВА ===`;
             console.log(`   ✅ Прочитан ZIP архив (${zipContent.length} символов, отправлено ${limitedZip.length})`);
         }
      } else {
        prompt += `\n\nПрикреплен файл: ${fileName}`;
      }
    }
  }

  // Анализируем скриншоты через Google Gemini Vision (если настроен)
  // Временно отключено по просьбе пользователя
  /*
  if (submission.imageUrls.length > 0) {
    if (genAI) {
      // Fallback на Gemini (если GigaChat не настроен, но есть Gemini)
      console.log(`   🖼️ Анализирую ${submission.imageUrls.length} скриншот(ов) через Google Gemini...`);
      prompt += `\n\n=== АНАЛИЗ ПРИКРЕПЛЕННЫХ СКРИНШОТОВ ===`;
      for (let i = 0; i < submission.imageUrls.length; i++) {
        const imageUrl = submission.imageUrls[i];
        console.log(`   🔍 Скриншот ${i + 1}: ${imageUrl}`);
        const description = await analyzeImage(imageUrl); // Старая функция вызывает Gemini
        prompt += `\n\nСкриншот ${i + 1} (${imageUrl.split('/').pop()}):\n${description}`;
        console.log(`   ✅ Получено описание (${description.length} символов)`);
      }
      prompt += `\n=== КОНЕЦ АНАЛИЗА СКРИНШОТОВ ===`;
    } else {
       // Нет API ключей
       console.log(`   🖼️ Студент прикрепил ${submission.imageUrls.length} скриншот(ов) (Vision API не настроен)`);
       prompt += `\n\n=== ПРИКРЕПЛЕННЫЕ СКРИНШОТЫ ===`;
       // ... старый код ...
       prompt += `\nСтудент прикрепил ${submission.imageUrls.length} скриншот(ов):`;
       for (let i = 0; i < submission.imageUrls.length; i++) {
         const imageUrl = submission.imageUrls[i];
         prompt += `\n${i + 1}. ${imageUrl.split('/').pop()}`;
       }
       prompt += `\n\nВНИМАНИЕ: Скриншоты прикреплены, но их содержимое не анализируется (Vision API не настроен). Если в задании требуются скриншоты - считай, что они есть.`;
       prompt += `\n=== КОНЕЦ СПИСКА СКРИНШОТОВ ===`;
    }
  }
  */
  
  // Заглушка для скриншотов, пока анализ отключен
  if (submission.imageUrls.length > 0) {
      console.log(`   🖼️ Студент прикрепил ${submission.imageUrls.length} скриншот(ов) (Анализ временно отключен)`);
      prompt += `\n\n=== ПРИКРЕПЛЕННЫЕ СКРИНШОТЫ ===`;
      prompt += `\nСтудент прикрепил ${submission.imageUrls.length} скриншот(ов).`;
      prompt += `\nВНИМАНИЕ: Считай, что скриншоты корректны и содержат выполненное задание.`;
      prompt += `\n=== КОНЕЦ СПИСКА СКРИНШОТОВ ===`;
  }
  
  prompt += `
    
    Твои действия:
    0. СНАЧАЛА изучи ВЫЖИМКУ УРОКА (если есть) — это то, что студент изучал перед выполнением задания. Используй эти знания для понимания контекста.
    1. ВНИМАТЕЛЬНО прочитай ТЕКСТ ЗАДАНИЯ и ИДЕАЛЬНЫЙ ОТВЕТ выше, чтобы точно понять, что от студента требуется.
    2. Прочитай ОТВЕТ СТУДЕНТА. Если студент задает ВОПРОС или просит помощи - обязательно ответь на него в комментарии.
    2.1. ВАЖНО: Если студент НЕ написал текстовый комментарий, но предоставил скриншоты, файлы или другие данные - это НЕ ошибка! Считай, что задание выполнено через предоставленные материалы. Не требуй обязательного текстового комментария!
    3. Проверь, выполнил ли студент КОНКРЕТНЫЕ требования из ТЕКСТА ЗАДАНИЯ, сравнивая с тем, что объяснялось в УРОКЕ:
       - Если в ТЕКСТЕ ЗАДАНИЯ явно требуется JSON файл - проанализируй его содержимое.
       - Если в ТЕКСТЕ ЗАДАНИЯ явно требуются скриншоты - проверь их наличие и содержимое.
       - Если в ТЕКСТЕ ЗАДАНИЯ требуется текстовый ответ - оцени его.
       - КРИТИЧЕСКИ ВАЖНО: Если в ТЕКСТЕ ЗАДАНИЯ указаны варианты формата сдачи через "ИЛИ" (например: "ссылка ИЛИ скриншоты ИЛИ архив") - достаточно, чтобы студент предоставил ОДИН из вариантов! Не требуй все варианты сразу!
       - КРИТИЧЕСКИ ВАЖНО: Если в ТЕКСТЕ ЗАДАНИЯ требуется ссылка (ссылка, link, url, адрес, сайт, проект, приложение, деплой, GitHub, репозиторий) - проверь её наличие в ответе студента. Если ссылка НЕ предоставлена И нет других вариантов через "ИЛИ" - это ОШИБКА, отклони работу и укажи это в комментарии!
       - ВАЖНО: Если студент предоставил скриншоты, файлы или другие данные, но НЕ написал текстовый комментарий - это НЕ ошибка! Считай, что студент выполнил задание через предоставленные материалы. Не требуй обязательного текстового комментария, если есть другие данные!
       - НЕ ПРИДУМЫВАЙ требования, которых нет в тексте задания!
    4. Сравни ответ студента с ИДЕАЛЬНЫМ ОТВЕТОМ (если он указан).
    5. ВАЖНО: Если студент прислал скриншоты, на которых ВИДНО выполненное задание - СЧИТАЙ ЭТО ЗАЧЕТОМ, даже если формально просили текст или ссылку. Главное - суть: работа выполнена.
    5.1. ВАЖНО: Если студент предоставил скриншоты, файлы, архив или другие данные, но НЕ написал текстовый комментарий - это НЕ ошибка! Считай, что студент выполнил задание через предоставленные материалы. Не требуй обязательного текстового комментария!
    6. КРИТИЧЕСКИ ВАЖНО: Требуй только то, что ЯВНО указано в тексте задания. Не добавляй свои требования! Если в тексте задания не написано "прикрепите скриншот" - ЗНАЧИТ ОН НЕ НУЖЕН.
    7. Если прикреплен JSON файл (или содержимое ZIP архива) - внимательно проанализируй его структуру, поля, значения.
    8. Если ответ выполняет ВСЕ требования из ТЕКСТА ЗАДАНИЯ — ПРИНЯТЬ. Если в задании нет требования скриншотов, а студент прислал только JSON - ЭТО НОРМАЛЬНО, ПРИНИМАЙ.
    9. Если ответ НЕ выполняет требования из ТЕКСТА ЗАДАНИЯ — ОТКЛОНИТЬ.
    10. Напиши дружелюбный, мотивирующий комментарий на русском языке.
    11. ОБЯЗАТЕЛЬНО начни комментарий с обращения: "Здравствуйте, ${firstName}!"
    12. КРИТИЧЕСКИ ВАЖНО: Обращайся к студенту СТРОГО на "вы" (вы, ваш, ваша, ваше, вам, вас). НИКОГДА не используй "ты" или "твой/твоя/твое".
    13. Укажи конкретно, что сделано правильно, а что нужно исправить (если есть ошибки).
    14. В комментарии ссылайся ТОЛЬКО на требования из текста задания, не придумывай лишнего! Не пиши про отсутствующие скриншоты, если их не просили!
    15. Если студент написал комментарий с вопросом или пояснением - отреагируй на него. Если задан вопрос - дай краткий и полезный ответ или подсказку.
    16. КРИТИЧЕСКИ ВАЖНО: Пиши комментарий ТОЛЬКО на русском языке! Не используй символы из других языков (хинди, арабский, китайский и т.д.). Только кириллица, латиница и знаки препинания!
    17. НЕ УПОМИНАЙ слово "задание" в комментарии! Не пиши фразы типа "указанным в тексте задания", "требования задания", "задание выполнено". Вместо этого пиши конкретно: "требуется создать...", "нужно было...", "работа выполнена" и т.д.
    
    Верни ответ строго в формате JSON:
    {
      "comment": "Здравствуйте, ${firstName}! [твой комментарий здесь]",
      "status": "accept" или "reject"
    }
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Ты помощник преподавателя. Отвечай только в JSON. ВСЕГДА обращайся к студенту по имени в начале комментария. ОБЯЗАТЕЛЬНО используй вежливую форму обращения на 'вы' (вы, ваш, ваша, ваше, вам, вас). НИКОГДА не используй 'ты' или 'твой/твоя/твое'." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    if (!content) {
        throw new Error("Пустой ответ от AI");
    }

    const result = JSON.parse(content) as AIFeedback;
    
    // Очищаем комментарий от нелатинских/нецириллических символов
    result.comment = result.comment.replace(/[^\u0000-\u007F\u0400-\u04FF\s.,!?;:()"'«»—–-]/g, '');
    
    // Проверяем, что имя студента есть в комментарии
    if (!result.comment.includes(firstName)) {
      result.comment = `Здравствуйте, ${firstName}! ${result.comment}`;
    }
    
    return result;

  } catch (error) {
    console.error("❌ Ошибка при запросе к AI:", error);
    // Fallback на случай ошибки
    return {
      comment: `Здравствуйте, ${firstName}! Произошла ошибка при автоматической проверке. Пожалуйста, дождитесь проверки живым преподавателем.`,
      status: "reject"
    };
  }
}


