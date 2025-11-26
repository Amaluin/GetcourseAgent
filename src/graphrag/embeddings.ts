/**
 * Создание и управление embeddings для чанков
 */

import axios from 'axios';
import OpenAI from 'openai';

export interface EmbeddingProvider {
  name: string;
  dimension: number;
  createEmbedding(text: string): Promise<number[]>;
  createBatchEmbeddings(texts: string[]): Promise<number[][]>;
}

/**
 * Ollama provider для embeddings (локальный, бесплатный)
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  name = 'ollama';
  dimension = 768; // для nomic-embed-text
  
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string = 'http://localhost:11434', model: string = 'nomic-embed-text') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async createEmbedding(text: string): Promise<number[]> {
    try {
      const cleanedText = text
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000); // Ограничение для Ollama

      const response = await axios.post(`${this.baseUrl}/api/embeddings`, {
        model: this.model,
        prompt: cleanedText
      }, {
        timeout: 30000
      });

      return response.data.embedding || [];
    } catch (error: any) {
      console.error(`❌ Ошибка создания embedding (Ollama):`, error.message);
      throw error;
    }
  }

  async createBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    
    // Ollama не поддерживает батчи, делаем последовательно
    for (const text of texts) {
      try {
        const embedding = await this.createEmbedding(text);
        embeddings.push(embedding);
      } catch (error) {
        console.error(`⚠️ Ошибка при создании embedding для текста: ${text.slice(0, 50)}...`);
        embeddings.push([]); // Пустой embedding в случае ошибки
      }
    }

    return embeddings;
  }
}

/**
 * OpenAI provider для embeddings (платный, высокое качество)
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'openai';
  dimension = 1536; // для text-embedding-ada-002
  
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'text-embedding-ada-002') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async createEmbedding(text: string): Promise<number[]> {
    try {
      const cleanedText = text
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const response = await this.client.embeddings.create({
        model: this.model,
        input: cleanedText,
      });

      return response.data[0].embedding;
    } catch (error: any) {
      console.error(`❌ Ошибка создания embedding (OpenAI):`, error.message);
      throw error;
    }
  }

  async createBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const cleanedTexts = texts.map(text =>
        text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
      );

      const response = await this.client.embeddings.create({
        model: this.model,
        input: cleanedTexts,
      });

      return response.data.map(item => item.embedding);
    } catch (error: any) {
      console.error(`❌ Ошибка создания batch embeddings (OpenAI):`, error.message);
      throw error;
    }
  }
}

/**
 * Вычисление косинусного сходства между векторами
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (denominator === 0) {
    return 0;
  }
  
  return dotProduct / denominator;
}

/**
 * Находит топ-K наиболее похожих embeddings
 */
export interface SimilarityResult {
  index: number;
  similarity: number;
}

export function findTopSimilar(
  query: number[],
  embeddings: number[][],
  topK: number = 5
): SimilarityResult[] {
  const similarities = embeddings.map((embedding, index) => ({
    index,
    similarity: cosineSimilarity(query, embedding)
  }));

  // Сортируем по убыванию схожести
  similarities.sort((a, b) => b.similarity - a.similarity);

  return similarities.slice(0, topK);
}

/**
 * Нормализация embedding (приведение к единичной длине)
 */
export function normalizeEmbedding(embedding: number[]): number[] {
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  
  if (norm === 0) {
    return embedding;
  }
  
  return embedding.map(val => val / norm);
}

/**
 * Кэширование embeddings
 */
export class EmbeddingCache {
  private cache: Map<string, number[]> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(text: string): number[] | undefined {
    const key = this.getKey(text);
    return this.cache.get(key);
  }

  set(text: string, embedding: number[]): void {
    const key = this.getKey(text);
    
    // Если кэш переполнен - удаляем самый старый элемент
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, embedding);
  }

  has(text: string): boolean {
    const key = this.getKey(text);
    return this.cache.has(key);
  }

  private getKey(text: string): string {
    // Используем первые 100 символов как ключ
    return text.slice(0, 100);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Менеджер embeddings с автоматическим выбором провайдера
 */
export class EmbeddingManager {
  private provider: EmbeddingProvider;
  private cache: EmbeddingCache;

  constructor(provider: EmbeddingProvider, enableCache: boolean = true) {
    this.provider = provider;
    this.cache = new EmbeddingCache(enableCache ? 1000 : 0);
  }

  async createEmbedding(text: string, useCache: boolean = true): Promise<number[]> {
    if (useCache && this.cache.has(text)) {
      return this.cache.get(text)!;
    }

    const embedding = await this.provider.createEmbedding(text);
    
    if (useCache) {
      this.cache.set(text, embedding);
    }

    return embedding;
  }

  async createBatchEmbeddings(texts: string[], useCache: boolean = true): Promise<number[][]> {
    const embeddings: number[][] = [];
    const textsToEmbed: string[] = [];
    const indices: number[] = [];

    // Проверяем кэш
    for (let i = 0; i < texts.length; i++) {
      if (useCache && this.cache.has(texts[i])) {
        embeddings[i] = this.cache.get(texts[i])!;
      } else {
        textsToEmbed.push(texts[i]);
        indices.push(i);
      }
    }

    // Создаем embeddings для текстов, которых нет в кэше
    if (textsToEmbed.length > 0) {
      const newEmbeddings = await this.provider.createBatchEmbeddings(textsToEmbed);
      
      for (let i = 0; i < textsToEmbed.length; i++) {
        const embedding = newEmbeddings[i];
        const originalIndex = indices[i];
        
        embeddings[originalIndex] = embedding;
        
        if (useCache) {
          this.cache.set(textsToEmbed[i], embedding);
        }
      }
    }

    return embeddings;
  }

  getCacheStats() {
    return {
      size: this.cache.size(),
      provider: this.provider.name,
      dimension: this.provider.dimension
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Создание провайдера на основе конфигурации
 */
export function createEmbeddingProvider(config: {
  type: 'ollama' | 'openai';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): EmbeddingProvider {
  if (config.type === 'ollama') {
    return new OllamaEmbeddingProvider(
      config.baseUrl || 'http://localhost:11434',
      config.model || 'nomic-embed-text'
    );
  } else if (config.type === 'openai') {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    return new OpenAIEmbeddingProvider(
      config.apiKey,
      config.model || 'text-embedding-ada-002'
    );
  } else {
    throw new Error(`Unknown embedding provider: ${config.type}`);
  }
}

