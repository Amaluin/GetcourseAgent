/**
 * Главный модуль GraphRAG - объединяет все компоненты
 */

export * from './chunking';
export * from './embeddings';
export * from './neo4j-advanced';
export * from './semantic-search';

import { chunkLesson, Chunk, ChunkingOptions, getChunkingStats } from './chunking';
import {
  createEmbeddingProvider,
  EmbeddingManager,
  EmbeddingProvider
} from './embeddings';
import { Neo4jAdvancedClient, ChunkWithEmbedding } from './neo4j-advanced';
import { SemanticSearchEngine, SearchOptions, SearchResult, buildLLMContext } from './semantic-search';

/**
 * Конфигурация GraphRAG системы
 */
export interface GraphRAGConfig {
  // Neo4j
  neo4j: {
    uri: string;
    username: string;
    password: string;
  };
  
  // Embeddings
  embeddings: {
    provider: 'ollama' | 'openai';
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
  
  // Chunking
  chunking?: Partial<ChunkingOptions>;
  
  // Search
  search?: {
    defaultTopK?: number;
    minSimilarity?: number;
  };
}

/**
 * Главный класс GraphRAG системы
 */
export class GraphRAG {
  private neo4jClient: Neo4jAdvancedClient;
  private embeddingManager: EmbeddingManager;
  private searchEngine: SemanticSearchEngine;
  private config: GraphRAGConfig;

  constructor(config: GraphRAGConfig) {
    this.config = config;

    // Инициализируем Neo4j
    this.neo4jClient = new Neo4jAdvancedClient(
      config.neo4j.uri,
      config.neo4j.username,
      config.neo4j.password
    );

    // Инициализируем embedding provider
    const embeddingProvider = createEmbeddingProvider({
      type: config.embeddings.provider,
      apiKey: config.embeddings.apiKey,
      baseUrl: config.embeddings.baseUrl,
      model: config.embeddings.model
    });
    this.embeddingManager = new EmbeddingManager(embeddingProvider, true);

    // Инициализируем поисковый движок
    this.searchEngine = new SemanticSearchEngine(
      this.neo4jClient,
      this.embeddingManager
    );

    console.log(`✅ GraphRAG инициализирован (${config.embeddings.provider})`);
  }

  /**
   * Закрыть соединения
   */
  async close(): Promise<void> {
    await this.neo4jClient.close();
  }

  /**
   * 1. ДОБАВЛЕНИЕ УРОКА с чанкингом и embeddings
   * replaceExisting: если true - удаляет старые чанки перед добавлением новых
   */
  async addLesson(
    lessonId: string,
    lessonTitle: string,
    content: string,
    sectionNumber: number = 0,
    replaceExisting: boolean = false
  ): Promise<{ chunks: number; tokens: number }> {
    console.log(`\n📚 Добавление урока: ${lessonTitle}`);

    // 1. Чанкинг
    const chunks = chunkLesson(
      lessonId,
      sectionNumber,
      content,
      this.config.chunking
    );

    const stats = getChunkingStats(chunks);
    console.log(`   📄 Создано чанков: ${stats.totalChunks}`);
    console.log(`   🔤 Всего токенов: ${stats.totalTokens}`);
    console.log(`   📊 Средний размер: ${stats.avgTokensPerChunk} токенов`);

    // 2. Создаем embeddings для каждого чанка
    console.log(`   🧠 Создание embeddings...`);
    const texts = chunks.map(c => c.text);
    const embeddings = await this.embeddingManager.createBatchEmbeddings(texts);

    // 3. Добавляем embeddings к чанкам
    const chunksWithEmbeddings: ChunkWithEmbedding[] = chunks.map((chunk, i) => ({
      ...chunk,
      embedding: embeddings[i]
    }));

    // 4. Сохраняем в Neo4j (с проверкой на дубликаты)
    await this.neo4jClient.addLessonChunks(lessonId, lessonTitle, chunksWithEmbeddings, replaceExisting);

    return {
      chunks: stats.totalChunks,
      tokens: stats.totalTokens
    };
  }

  /**
   * Проверка существования урока в GraphRAG
   */
  async hasLesson(lessonId: string): Promise<boolean> {
    return await this.neo4jClient.lessonExists(lessonId);
  }

  /**
   * Получение информации об уроке из GraphRAG
   */
  async getLessonInfo(lessonId: string): Promise<{ id: string; title: string; chunkCount: number } | null> {
    return await this.neo4jClient.getLessonInfo(lessonId);
  }

  /**
   * Проверка существования студента в GraphRAG
   */
  async hasStudent(studentId: string): Promise<boolean> {
    return await this.neo4jClient.studentExists(studentId);
  }

  /**
   * Получение списка уроков, пройденных студентом
   */
  async getStudentLessons(studentId: string): Promise<string[]> {
    return await this.neo4jClient.getStudentLessons(studentId);
  }

  /**
   * 2. ДОБАВЛЕНИЕ СТУДЕНТА
   */
  async addStudent(
    studentId: string,
    studentName: string,
    email?: string,
    gcId?: string,
    gcUrl?: string
  ): Promise<void> {
    await this.neo4jClient.addOrUpdateStudent(studentId, studentName, email, gcId, gcUrl);
  }

  /**
   * 3. ОТМЕТИТЬ ПРОХОЖДЕНИЕ УРОКА
   * Использует MERGE - не создает дубликаты
   */
  async markLessonCompleted(
    studentId: string,
    lessonId: string
  ): Promise<void> {
    await this.neo4jClient.markLessonCompleted(studentId, lessonId);
  }

  /**
   * 4. СВЯЗАТЬ РАБОТУ СО СТУДЕНТОМ
   * Использует MERGE - не создает дубликаты
   */
  async linkSubmissionToStudent(
    submissionId: string,
    studentId: string,
    studentName: string
  ): Promise<void> {
    await this.neo4jClient.linkSubmissionToStudent(submissionId, studentId, studentName);
  }

  /**
   * 5. СЕМАНТИЧЕСКИЙ ПОИСК
   */
  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const defaultOptions = {
      topK: this.config.search?.defaultTopK || 5,
      minSimilarity: this.config.search?.minSimilarity || 0.5,
      ...options
    };

    return await this.searchEngine.search(query, defaultOptions);
  }

  /**
   * 6. ПОЛУЧИТЬ КОНТЕКСТ ДЛЯ LLM
   */
  async getContextForLLM(
    query: string,
    options?: SearchOptions
  ): Promise<string> {
    const results = await this.search(query, options);
    return buildLLMContext(results);
  }

  /**
   * 7. СТАТИСТИКА СТУДЕНТА
   */
  async getStudentProgress(studentId: string) {
    return await this.neo4jClient.getStudentProgress(studentId);
  }

  async getStudentSubmissions(studentId: string) {
    return await this.neo4jClient.getStudentSubmissions(studentId);
  }

  async getStudentGraph(studentId: string) {
    return await this.neo4jClient.getStudentGraph(studentId);
  }

  /**
   * Поиск студента по имени (частичное совпадение)
   */
  async findStudentByName(nameQuery: string) {
    return await this.neo4jClient.findStudentByName(nameQuery);
  }

  /**
   * 8. ADVANCED QUERIES
   */
  
  async findSimilarStudents(studentId: string, limit: number = 5) {
    return await this.neo4jClient.findStudentsWithSimilarTopics(studentId, limit);
  }

  async findUnlearnedConcepts(studentId: string, limit: number = 10) {
    return await this.neo4jClient.findUnlearnedConcepts(studentId, limit);
  }

  async findDifficultConcepts(limit: number = 10) {
    return await this.neo4jClient.findDifficultConcepts(limit);
  }

  async buildLearningPath(studentId: string, targetConcept: string) {
    return await this.neo4jClient.buildLearningPath(studentId, targetConcept);
  }

  /**
   * 9. СТАТИСТИКА СИСТЕМЫ
   */
  getSystemStats() {
    return {
      embedding: this.embeddingManager.getCacheStats(),
      config: {
        provider: this.config.embeddings.provider,
        chunking: this.config.chunking
      }
    };
  }
}

/**
 * Создание GraphRAG с конфигурацией из .env
 */
export function createGraphRAGFromEnv(): GraphRAG {
  const config: GraphRAGConfig = {
    neo4j: {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USER || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'neo4j@openspg'
    },
    embeddings: {
      provider: (process.env.EMBEDDING_PROVIDER as 'ollama' | 'openai') || 'ollama',
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.EMBEDDING_MODEL
    },
    chunking: {
      chunkSize: parseInt(process.env.CHUNK_SIZE || '512'),
      overlapSize: parseInt(process.env.OVERLAP_SIZE || '50'),
      preserveSentences: process.env.PRESERVE_SENTENCES !== 'false'
    },
    search: {
      defaultTopK: parseInt(process.env.SEARCH_TOP_K || '5'),
      minSimilarity: parseFloat(process.env.MIN_SIMILARITY || '0.5')
    }
  };

  return new GraphRAG(config);
}

