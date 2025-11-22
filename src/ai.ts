import OpenAI from 'openai';
import { config } from './config';
import { AIFeedback, HomeworkSubmission } from './types';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
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

export async function checkHomework(submission: HomeworkSubmission): Promise<AIFeedback> {
  console.log(`🧠 AI анализирует работу студента: ${submission.studentName}`);
  
  // Debug ключей (скрываем часть ключа)
  console.log(`   🔑 Gemini Key: ${config.geminiApiKey ? 'PRESENT (' + config.geminiApiKey.substring(0, 5) + '...)' : 'MISSING'}`);

  // Обрабатываем имя студента
  const firstName = processStudentName(submission.studentName);
  console.log(`   👤 Обращение к студенту: ${firstName}`);

  // Формируем промпт с учетом задания и идеального ответа
  let prompt = `
    Ты — опытный преподаватель по No-Code разработке. Твоя задача — проверить домашнее задание студента.
    
    ВАЖНО: Обращайся к студенту по имени! Имя студента для обращения: ${firstName}
    
    Название урока: ${submission.assignmentTitle}
  `;

  if (submission.taskDescription) {
    console.log('\n=== ТЕКСТ ЗАДАНИЯ (ПОЛНЫЙ) ===');
    console.log(submission.taskDescription);
    console.log('==============================\n');
    prompt += `\n\nТекст задания:\n${submission.taskDescription}`;
  }

  if (submission.idealAnswer) {
    console.log('\n=== ИДЕАЛЬНЫЙ ОТВЕТ (ПОЛНЫЙ) ===');
    console.log(submission.idealAnswer);
    console.log('================================\n');
    prompt += `\n\nИдеальный ответ (эталон):\n${submission.idealAnswer}`;
  }

  prompt += `\n\nОтвет студента:\n"${submission.text}"`;

  // Анализируем JSON файлы
  if (submission.fileUrls.length > 0) {
    console.log(`   📄 Обрабатываю ${submission.fileUrls.length} файл(ов)...`);
    for (const fileUrl of submission.fileUrls) {
      if (fileUrl.endsWith('.json')) {
        const jsonContent = await readJsonFile(fileUrl);
        if (jsonContent) {
          prompt += `\n\n=== СОДЕРЖИМОЕ JSON ФАЙЛА (${fileUrl.split('/').pop()}) ===\n${jsonContent.substring(0, 3000)}\n=== КОНЕЦ JSON ФАЙЛА ===`;
          console.log(`   ✅ Прочитан JSON файл (${jsonContent.length} символов)`);
        }
      } else {
        prompt += `\n\nПрикреплен файл: ${fileUrl.split('/').pop()}`;
      }
    }
  }

  // Анализируем скриншоты через Google Gemini Vision (если настроен)
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

  prompt += `
    
    Твои действия:
    1. ВНИМАТЕЛЬНО прочитай ТЕКСТ ЗАДАНИЯ и ИДЕАЛЬНЫЙ ОТВЕТ выше, чтобы точно понять, что от студента требуется.
    2. Проверь, выполнил ли студент КОНКРЕТНЫЕ требования из ТЕКСТА ЗАДАНИЯ:
       - Если в ТЕКСТЕ ЗАДАНИЯ явно требуется JSON файл - проанализируй его содержимое
       - Если в ТЕКСТЕ ЗАДАНИЯ явно требуются скриншоты - проверь их наличие и содержимое
       - Если в ТЕКСТЕ ЗАДАНИЯ требуется текстовый ответ - оцени его
       - НЕ ПРИДУМЫВАЙ требования, которых нет в тексте задания!
    3. Сравни ответ студента с ИДЕАЛЬНЫМ ОТВЕТОМ (если он указан).
    4. ВАЖНО: Если студент прислал скриншоты, на которых ВИДНО выполненное задание - СЧИТАЙ ЭТО ЗАЧЕТОМ, даже если формально просили текст или ссылку. Главное - суть: работа выполнена.
    5. КРИТИЧЕСКИ ВАЖНО: Требуй только то, что ЯВНО указано в тексте задания. Не добавляй свои требования! Если в тексте задания не написано "прикрепите скриншот" - ЗНАЧИТ ОН НЕ НУЖЕН.
    5. Если прикреплен JSON файл - внимательно проанализируй его структуру, поля, значения.
    6. Если ответ выполняет ВСЕ требования из ТЕКСТА ЗАДАНИЯ — ПРИНЯТЬ. Если в задании нет требования скриншотов, а студент прислал только JSON - ЭТО НОРМАЛЬНО, ПРИНИМАЙ.
    7. Если ответ НЕ выполняет требования из ТЕКСТА ЗАДАНИЯ — ОТКЛОНИТЬ.
    8. Напиши дружелюбный, мотивирующий комментарий на русском языке.
    9. ОБЯЗАТЕЛЬНО начни комментарий с обращения: "Здравствуйте, ${firstName}!"
    10. Укажи конкретно, что сделано правильно, а что нужно исправить (если есть ошибки).
    11. В комментарии ссылайся ТОЛЬКО на требования из текста задания, не придумывай лишнего! Не пиши про отсутствующие скриншоты, если их не просили!
    
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
        { role: "system", content: "Ты помощник преподавателя. Отвечай только в JSON. ВСЕГДА обращайся к студенту по имени в начале комментария." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    if (!content) {
        throw new Error("Пустой ответ от AI");
    }

    const result = JSON.parse(content) as AIFeedback;
    
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


