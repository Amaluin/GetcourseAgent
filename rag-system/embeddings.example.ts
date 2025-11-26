/**
 * Модуль для создания embeddings через OpenAI
 * 
 * Пример использования:
 * const embedding = await createEmbedding("Текст для векторизации");
 * const embeddings = await batchCreateEmbeddings(["текст 1", "текст 2"]);
 */

import OpenAI from 'openai';

// Конфигурация
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-ada-002';
const EMBEDDING_DIMENSION = parseInt(process.env.EMBEDDING_DIMENSION || '1536');

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

/**
 * Создает embedding для одного текста
 */
export async function createEmbedding(text: string): Promise<number[]> {
  try {
    // Очищаем текст от лишних символов
    const cleanedText = text
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000); // Ограничиваем длину

    if (!cleanedText) {
      throw new Error('Пустой текст для векторизации');
    }

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: cleanedText,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('❌ Ошибка при создании embedding:', error);
    throw error;
  }
}

/**
 * Создает embeddings для массива текстов (батч)
 */
export async function batchCreateEmbeddings(
  texts: string[],
  batchSize: number = 10
): Promise<number[][]> {
  const results: number[][] = [];

  // Разбиваем на батчи
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    try {
      const cleanedBatch = batch.map(text =>
        text
          .replace(/\n+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 8000)
      );

      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: cleanedBatch,
      });

      const embeddings = response.data.map(item => item.embedding);
      results.push(...embeddings);

      console.log(`✅ Векторизовано ${i + batch.length}/${texts.length}`);
    } catch (error) {
      console.error(`❌ Ошибка в батче ${i}-${i + batch.length}:`, error);
      // Добавляем пустые embeddings для failed батчей
      results.push(...Array(batch.length).fill([]));
    }
  }

  return results;
}

/**
 * Вычисляет косинусное сходство между двумя векторами
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Векторы должны быть одинаковой длины');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Создает хэш текста для определения изменений
 */
export function createContentHash(text: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Подготавливает текст для векторизации
 * - Удаляет HTML теги
 * - Удаляет лишние пробелы
 * - Ограничивает длину
 */
export function prepareTextForEmbedding(text: string, maxLength: number = 8000): string {
  return text
    .replace(/<[^>]*>/g, '') // Удаляем HTML теги
    .replace(/\n+/g, ' ') // Заменяем переносы строк на пробелы
    .replace(/\s+/g, ' ') // Удаляем множественные пробелы
    .trim()
    .slice(0, maxLength);
}

/**
 * Пример использования
 */
async function example() {
  // Одиночный embedding
  const text = "GitHub Actions - это платформа для автоматизации CI/CD";
  const embedding = await createEmbedding(text);
  console.log(`Embedding размерность: ${embedding.length}`);

  // Батч embeddings
  const texts = [
    "Первый текст для векторизации",
    "Второй текст для векторизации",
    "Третий текст для векторизации"
  ];
  const embeddings = await batchCreateEmbeddings(texts);
  console.log(`Создано ${embeddings.length} embeddings`);

  // Вычисление схожести
  const similarity = cosineSimilarity(embeddings[0], embeddings[1]);
  console.log(`Схожесть: ${similarity.toFixed(4)}`);

  // Хэш контента
  const hash = createContentHash(text);
  console.log(`Хэш: ${hash}`);
}

// Раскомментируйте для тестирования
// example();





