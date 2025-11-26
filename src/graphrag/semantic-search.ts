/**
 * Семантический поиск с ranking'ом результатов
 */

import { Chunk } from './chunking';
import { EmbeddingManager, findTopSimilar, SimilarityResult } from './embeddings';
import { Neo4jAdvancedClient } from './neo4j-advanced';

export interface SearchResult {
  chunk: Chunk;
  similarity: number;
  rank: number;
  context?: Chunk[];
}

export interface SearchOptions {
  topK?: number;           // Количество результатов (по умолчанию 5)
  minSimilarity?: number;  // Минимальная схожесть (по умолчанию 0.5)
  includeContext?: boolean; // Включать соседние чанки (по умолчанию true)
  contextSize?: number;    // Размер контекста (по умолчанию 1)
  lessonId?: string;       // Фильтр по уроку
  rerank?: boolean;        // Пе рeранжирование (по умолчанию true)
}

/**
 * Основной класс для семантического поиска
 */
export class SemanticSearchEngine {
  constructor(
    private neo4jClient: Neo4jAdvancedClient,
    private embeddingManager: EmbeddingManager
  ) {}

  /**
   * Поиск релевантных чанков по запросу
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      topK = 5,
      minSimilarity = 0.5,
      includeContext = true,
      contextSize = 1,
      lessonId,
      rerank = true
    } = options;

    console.log(`\n🔍 Семантический поиск: "${query.slice(0, 50)}..."`);

    // 1. Создаем embedding для запроса
    const queryEmbedding = await this.embeddingManager.createEmbedding(query);

    // 2. Ищем похожие чанки в Neo4j
    const candidateChunks = await this.neo4jClient.semanticSearchChunks(
      queryEmbedding,
      rerank ? topK * 3 : topK, // Берем больше для reranking
      lessonId
    );

    // 3. Фильтруем по минимальной схожести
    const filteredChunks = candidateChunks.filter(c => c.similarity >= minSimilarity);

    if (filteredChunks.length === 0) {
      console.log(`⚠️  Не найдено релевантных чанков (min similarity: ${minSimilarity})`);
      return [];
    }

    // 4. Reranking (если включен)
    let rankedChunks = filteredChunks;
    if (rerank) {
      rankedChunks = await this.rerankResults(query, filteredChunks);
    }

    // 5. Берем топ-K результатов
    const topChunks = rankedChunks.slice(0, topK);

    // 6. Добавляем контекст
    const results: SearchResult[] = [];
    
    for (let i = 0; i < topChunks.length; i++) {
      const { chunk, similarity } = topChunks[i];
      
      let context: Chunk[] | undefined;
      if (includeContext) {
        try {
          context = await this.neo4jClient.getChunkContext(chunk.id, contextSize);
        } catch (error) {
          console.warn(`⚠️  Не удалось получить контекст для чанка ${chunk.id}`);
          context = [chunk];
        }
      }

      results.push({
        chunk,
        similarity,
        rank: i + 1,
        context
      });
    }

    console.log(`✅ Найдено ${results.length} релевантных чанков`);
    
    return results;
  }

  /**
   * Reranking - улучшенное ранжирование результатов
   * Использует более глубокий анализ
   */
  private async rerankResults(
    query: string,
    candidates: Array<{ chunk: Chunk; similarity: number }>
  ): Promise<Array<{ chunk: Chunk; similarity: number }>> {
    // Факторы для reranking:
    // 1. Semantic similarity (уже есть)
    // 2. Keyword overlap
    // 3. Position in document (первые чанки важнее)
    // 4. Length (предпочитаем более полные чанки)

    const queryWords = this.extractKeywords(query.toLowerCase());

    const reranked = candidates.map(({ chunk, similarity }) => {
      // Базовый score - cosine similarity
      let score = similarity;

      // +1. Keyword overlap
      const chunkWords = this.extractKeywords(chunk.text.toLowerCase());
      const overlap = this.calculateKeywordOverlap(queryWords, chunkWords);
      score += overlap * 0.2; // Вес 20%

      // +2. Position bonus (первые чанки получают бонус)
      const positionBonus = 1 - (chunk.metadata.chunkIndex / (chunk.metadata.totalChunks || 100));
      score += positionBonus * 0.1; // Вес 10%

      // +3. Length bonus (предпочитаем чанки среднего размера)
      const optimalLength = 400; // токенов
      const lengthRatio = Math.min(chunk.tokenCount, optimalLength) / optimalLength;
      score += lengthRatio * 0.1; // Вес 10%

      return {
        chunk,
        similarity,
        score
      };
    });

    // Сортируем по новому score
    reranked.sort((a, b) => b.score - a.score);

    return reranked.map(r => ({ chunk: r.chunk, similarity: r.similarity }));
  }

  /**
   * Извлечение ключевых слов из текста
   */
  private extractKeywords(text: string): Set<string> {
    // Стоп-слова для русского и английского
    const stopWords = new Set([
      'и', 'в', 'на', 'с', 'по', 'для', 'к', 'из', 'у', 'о', 'от', 'до', 'при', 'через',
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'
    ]);

    const words = text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    return new Set(words);
  }

  /**
   * Вычисление перекрытия ключевых слов
   */
  private calculateKeywordOverlap(set1: Set<string>, set2: Set<string>): number {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    if (union.size === 0) return 0;
    
    return intersection.size / union.size; // Jaccard similarity
  }

  /**
   * Поиск с фильтрацией по метаданным
   */
  async searchWithMetadata(
    query: string,
    metadata: {
      lessonId?: string;
      sectionNumber?: number;
      dateRange?: { start: Date; end: Date };
    },
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    // Базовый поиск с фильтром по уроку
    const results = await this.search(query, {
      ...options,
      lessonId: metadata.lessonId
    });

    // Дополнительная фильтрация
    let filtered = results;

    if (metadata.sectionNumber !== undefined) {
      filtered = filtered.filter(r => 
        r.chunk.metadata.sectionNumber === metadata.sectionNumber
      );
    }

    return filtered;
  }

  /**
   * Гибридный поиск (semantic + keyword)
   */
  async hybridSearch(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    // 1. Semantic search
    const semanticResults = await this.search(query, { ...options, topK: 10 });

    // 2. Keyword search (BM25-like)
    // TODO: Реализовать полнотекстовый поиск в Neo4j

    // Пока просто возвращаем semantic results
    return semanticResults;
  }

  /**
   * Статистика поиска
   */
  async getSearchStats(): Promise<any> {
    return this.embeddingManager.getCacheStats();
  }
}

/**
 * Форматирование результатов поиска для отображения
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return '❌ Ничего не найдено';
  }

  let output = `\n📊 Найдено ${results.length} релевантных чанков:\n\n`;

  for (const result of results) {
    output += `${result.rank}. [Similarity: ${(result.similarity * 100).toFixed(1)}%]\n`;
    output += `   ${result.chunk.text.slice(0, 200)}...\n`;
    
    if (result.context && result.context.length > 1) {
      output += `   📎 Контекст: ${result.context.length} чанков\n`;
    }
    
    output += '\n';
  }

  return output;
}

/**
 * Создание контекста для LLM из результатов поиска
 */
export function buildLLMContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'Релевантная информация не найдена.';
  }

  let context = 'Релевантные секции из уроков:\n\n';

  for (const result of results) {
    context += `--- Секция ${result.rank} (релевантность: ${(result.similarity * 100).toFixed(0)}%) ---\n`;
    
    if (result.context && result.context.length > 0) {
      // Используем полный контекст
      context += result.context.map(c => c.text).join('\n\n');
    } else {
      context += result.chunk.text;
    }
    
    context += '\n\n';
  }

  return context;
}

