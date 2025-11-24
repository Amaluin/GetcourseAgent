/**
 * База знаний - детальное хранение и поиск по урокам
 */

import neo4j, { Session } from 'neo4j-driver';
import axios from 'axios';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

export interface LessonSection {
  id: string;
  lessonId: string;
  sectionNumber: number;
  title: string;
  content: string;
  videoUrl?: string;
  videoTitle?: string;
  timestamp?: string;
  beforeVideo: string;  // Текст до видео
  afterVideo: string;   // Текст после видео
  keywords: string[];
  embedding?: number[];
}

export interface SearchResult {
  lessonId: string;
  lessonTitle: string;
  sectionNumber: number;
  sectionTitle: string;
  content: string;
  videoUrl?: string;
  videoTitle?: string;
  relevanceScore: number;
}

/**
 * Создание embedding для текста
 */
async function createEmbedding(text: string): Promise<number[]> {
  try {
    const cleanedText = text
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    if (!cleanedText) {
      return [];
    }

    const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
      model: OLLAMA_MODEL,
      prompt: cleanedText
    });

    return response.data.embedding || [];
  } catch (error) {
    console.warn('⚠️ Ошибка создания embedding:', error);
    return [];
  }
}

/**
 * Вычисление косинусного сходства между векторами
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Извлечение ключевых слов из текста
 */
export function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    // Русские стоп-слова
    'и', 'в', 'на', 'с', 'по', 'для', 'как', 'что', 'это', 'вы', 'мы', 'он', 'она', 'они',
    'быть', 'который', 'весь', 'этот', 'мочь', 'свой', 'один', 'такой', 'наш', 'сам',
    'или', 'но', 'да', 'нет', 'не', 'ни', 'то', 'та', 'те', 'так', 'там', 'тут', 'где',
    'когда', 'почему', 'зачем', 'если', 'хотя', 'чтобы', 'при', 'без', 'под', 'над',
    'из', 'за', 'до', 'после', 'через', 'между', 'среди', 'будет', 'может', 'должен',
    'есть', 'был', 'была', 'было', 'были', 'будут', 'можно', 'нужно', 'надо',
    // Английские стоп-слова
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    // Общие слова из уроков
    'урок', 'секция', 'часть', 'раздел', 'глава', 'пункт', 'пример', 'будем', 'сделать',
    'создать', 'использовать', 'работать', 'необходимо', 'можете', 'нужно', 'должны'
  ]);
  
  const words = text
    .toLowerCase()
    .match(/[а-яёa-z]{4,}/gi) || [];
  
  const frequency: Record<string, number> = {};
  words.forEach(word => {
    if (!stopWords.has(word)) {
      frequency[word] = (frequency[word] || 0) + 1;
    }
  });
  
  // Сортируем по частоте и берем топ-20
  return Object.entries(frequency)
    .filter(([_, count]) => count >= 2) // Минимум 2 упоминания
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 20);
}

/**
 * Сохранение секции урока в Neo4j с embedding
 */
export async function saveLessonSection(
  session: Session,
  section: LessonSection
): Promise<boolean> {
  try {
    // Создаем embedding для содержимого секции
    const fullContent = `${section.title}\n${section.beforeVideo}\n${section.afterVideo}`;
    const embedding = await createEmbedding(fullContent);
    
    if (embedding.length === 0) {
      console.warn(`⚠️ Не удалось создать embedding для секции ${section.id}`);
    }

    await session.run(`
      MERGE (s:LessonSection {id: $id})
      SET s.lessonId = $lessonId,
          s.sectionNumber = $sectionNumber,
          s.title = $title,
          s.content = $content,
          s.videoUrl = $videoUrl,
          s.videoTitle = $videoTitle,
          s.timestamp = $timestamp,
          s.beforeVideo = $beforeVideo,
          s.afterVideo = $afterVideo,
          s.keywords = $keywords,
          s.embedding = $embedding,
          s.updated_at = datetime(),
          s.created_at = COALESCE(s.created_at, datetime())
      WITH s
      MATCH (l:Lesson {id: $lessonId})
      MERGE (l)-[:HAS_SECTION]->(s)
      RETURN s
    `, {
      id: section.id,
      lessonId: section.lessonId,
      sectionNumber: section.sectionNumber,
      title: section.title,
      content: section.content,
      videoUrl: section.videoUrl || null,
      videoTitle: section.videoTitle || null,
      timestamp: section.timestamp || null,
      beforeVideo: section.beforeVideo,
      afterVideo: section.afterVideo,
      keywords: section.keywords,
      embedding: embedding
    });

    // Создаем узлы для ключевых слов и связываем с секцией
    for (const keyword of section.keywords.slice(0, 10)) {
      try {
        await session.run(`
          MERGE (k:Keyword {name: $keyword})
          SET k.created_at = COALESCE(k.created_at, datetime())
          WITH k
          MATCH (s:LessonSection {id: $sectionId})
          MERGE (s)-[:MENTIONS]->(k)
        `, {
          keyword: keyword,
          sectionId: section.id
        });
      } catch (e) {
        // Игнорируем ошибки для отдельных ключевых слов
      }
    }

    return true;
  } catch (error: any) {
    console.error(`❌ Ошибка сохранения секции ${section.id}:`, error.message);
    return false;
  }
}

/**
 * Семантический поиск по базе знаний
 */
export async function searchKnowledge(
  session: Session,
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  try {
    console.log(`🔍 Ищу в базе знаний: "${query}"`);
    
    // Создаем embedding для запроса
    const queryEmbedding = await createEmbedding(query);
    
    if (queryEmbedding.length === 0) {
      console.warn('⚠️ Не удалось создать embedding для запроса');
      return [];
    }

    // Получаем все секции с embeddings
    const result = await session.run(`
      MATCH (l:Lesson)-[:HAS_SECTION]->(s:LessonSection)
      WHERE s.embedding IS NOT NULL
      RETURN l.id as lessonId,
             l.title as lessonTitle,
             s.id as sectionId,
             s.sectionNumber as sectionNumber,
             s.title as sectionTitle,
             s.content as content,
             s.videoUrl as videoUrl,
             s.videoTitle as videoTitle,
             s.beforeVideo as beforeVideo,
             s.afterVideo as afterVideo,
             s.embedding as embedding
      LIMIT 100
    `);

    // Вычисляем релевантность для каждой секции
    const results: SearchResult[] = [];
    
    for (const record of result.records) {
      const embedding = record.get('embedding');
      if (!embedding || embedding.length === 0) continue;
      
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      
      if (similarity > 0.3) { // Порог релевантности
        const sectionNum = record.get('sectionNumber');
        results.push({
          lessonId: record.get('lessonId'),
          lessonTitle: record.get('lessonTitle'),
          sectionNumber: typeof sectionNum === 'number' ? sectionNum : (sectionNum?.toNumber?.() || 1),
          sectionTitle: record.get('sectionTitle'),
          content: record.get('content'),
          videoUrl: record.get('videoUrl'),
          videoTitle: record.get('videoTitle'),
          relevanceScore: similarity
        });
      }
    }

    // Сортируем по релевантности
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    console.log(`✅ Найдено ${results.length} релевантных секций`);
    
    return results.slice(0, limit);
  } catch (error: any) {
    console.error('❌ Ошибка поиска:', error.message);
    return [];
  }
}

/**
 * Поиск по ключевому слову
 */
export async function searchByKeyword(
  session: Session,
  keyword: string,
  limit: number = 10
): Promise<SearchResult[]> {
  try {
    console.log(`🔍 Ищу по ключевому слову: "${keyword}"`);
    
    const result = await session.run(`
      MATCH (k:Keyword {name: $keyword})<-[:MENTIONS]-(s:LessonSection)<-[:HAS_SECTION]-(l:Lesson)
      RETURN l.id as lessonId,
             l.title as lessonTitle,
             s.sectionNumber as sectionNumber,
             s.title as sectionTitle,
             s.content as content,
             s.videoUrl as videoUrl,
             s.videoTitle as videoTitle
      ORDER BY s.sectionNumber
      LIMIT $limit
    `, {
      keyword: keyword.toLowerCase(),
      limit: limit
    });

    const results: SearchResult[] = result.records.map(record => {
      const sectionNum = record.get('sectionNumber');
      return {
        lessonId: record.get('lessonId'),
        lessonTitle: record.get('lessonTitle'),
        sectionNumber: typeof sectionNum === 'number' ? sectionNum : (sectionNum?.toNumber?.() || 1),
        sectionTitle: record.get('sectionTitle'),
        content: record.get('content'),
        videoUrl: record.get('videoUrl'),
        videoTitle: record.get('videoTitle'),
        relevanceScore: 1.0
      };
    });

    console.log(`✅ Найдено ${results.length} секций с ключевым словом "${keyword}"`);
    
    return results;
  } catch (error: any) {
    console.error('❌ Ошибка поиска по ключевому слову:', error.message);
    return [];
  }
}

/**
 * Получение всех ключевых слов из урока
 */
export async function getLessonKeywords(
  session: Session,
  lessonId: string
): Promise<string[]> {
  try {
    const result = await session.run(`
      MATCH (l:Lesson {id: $lessonId})-[:HAS_SECTION]->(s:LessonSection)-[:MENTIONS]->(k:Keyword)
      RETURN DISTINCT k.name as keyword
      ORDER BY keyword
    `, { lessonId });

    return result.records.map(r => r.get('keyword'));
  } catch (error) {
    return [];
  }
}

/**
 * Форматирование результатов поиска для отображения
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'Ничего не найдено.';
  }

  let output = `🔍 Найдено ${results.length} релевантных секций:\n\n`;
  
  results.forEach((result, index) => {
    output += `${index + 1}. 📚 Урок: "${result.lessonTitle}"\n`;
    output += `   📍 Секция ${result.sectionNumber}: ${result.sectionTitle}\n`;
    
    if (result.videoUrl) {
      output += `   🎥 Видео: ${result.videoTitle || 'Без названия'}\n`;
      output += `   🔗 ${result.videoUrl}\n`;
    }
    
    output += `   📝 Содержание: ${result.content.slice(0, 200)}...\n`;
    output += `   ⭐ Релевантность: ${(result.relevanceScore * 100).toFixed(1)}%\n\n`;
  });

  return output;
}

