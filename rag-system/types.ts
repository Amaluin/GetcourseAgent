/**
 * TypeScript типы для RAG системы
 */

// ============================================
// Базовые типы
// ============================================

export interface Embedding {
  vector: number[];
  model: string;
  dimension: number;
}

export interface Metadata {
  [key: string]: any;
}

// ============================================
// Урок (Lesson)
// ============================================

export interface Lesson {
  id: string;
  title: string;
  url: string;
  contentText: string;
  summary: string;
  embedding?: number[];
  videoUrls: string[];
  imageUrls: string[];
  fileUrls: string[];
  instructions: string[];
  metadata?: Metadata;
  contentHash?: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface LessonInput {
  id: string;
  title: string;
  url: string;
  contentText: string;
  summary: string;
  videoUrls?: string[];
  imageUrls?: string[];
  fileUrls?: string[];
  instructions?: string[];
}

// ============================================
// Задание (Assignment)
// ============================================

export interface Assignment {
  id: string;
  lessonId: string;
  title: string;
  description: string;
  idealAnswer: string;
  requirements: string[];
  embedding?: number[];
  metadata?: Metadata;
  createdAt: Date;
}

export interface AssignmentInput {
  id: string;
  lessonId: string;
  title: string;
  description: string;
  idealAnswer: string;
  requirements?: string[];
}

// ============================================
// Работа студента (Submission)
// ============================================

export type SubmissionStatus = 'accepted' | 'rejected' | 'pending';

export interface StudentSubmission {
  id: string;
  assignmentId: string;
  lessonId: string;
  studentId: string;
  studentName: string;
  submissionText: string;
  imageUrls: string[];
  fileUrls: string[];
  status: SubmissionStatus;
  aiComment?: string;
  aiVerdict?: string;
  embedding?: number[];
  similarityToIdeal?: number;
  similarityToBest?: number;
  metadata?: Metadata;
  createdAt: Date;
  checkedAt?: Date;
}

export interface SubmissionInput {
  id: string;
  assignmentId: string;
  lessonId: string;
  studentId: string;
  studentName: string;
  submissionText: string;
  imageUrls?: string[];
  fileUrls?: string[];
}

// ============================================
// Концепция (Concept)
// ============================================

export type ConceptCategory = 'tool' | 'platform' | 'concept' | 'technique' | 'other';

export interface LessonConcept {
  id: number;
  lessonId: string;
  conceptName: string;
  description: string;
  category: ConceptCategory;
  embedding?: number[];
  mentionedCount: number;
  importanceScore: number;
  createdAt: Date;
}

export interface ConceptInput {
  lessonId: string;
  conceptName: string;
  description: string;
  category: ConceptCategory;
  importanceScore?: number;
}

// ============================================
// Связь концепции с работой
// ============================================

export interface SubmissionConcept {
  submissionId: string;
  conceptId: number;
  usageQuality: number;
}

// ============================================
// Результаты поиска
// ============================================

export interface SimilarityMatch<T> {
  item: T;
  similarity: number;
  distance?: number;
}

export interface LessonMatch {
  id: string;
  title: string;
  summary: string;
  similarity: number;
}

export interface SubmissionMatch {
  id: string;
  studentName: string;
  submissionText: string;
  aiComment: string;
  similarity: number;
}

export interface ConceptMatch {
  id: number;
  conceptName: string;
  description: string;
  similarity: number;
}

// ============================================
// RAG Context
// ============================================

export interface RAGContext {
  lesson: Lesson;
  assignment: Assignment;
  similarSubmissions: SubmissionMatch[];
  relatedConcepts: ConceptMatch[];
  metadata: {
    cacheHit: boolean;
    similarityThreshold: number;
    searchTime: number;
  };
}

// ============================================
// Конфигурация RAG
// ============================================

export interface RAGConfig {
  // Supabase
  supabaseUrl: string;
  supabaseKey: string;

  // OpenAI
  openaiApiKey: string;
  embeddingModel: string;
  embeddingDimension: number;

  // Параметры поиска
  similarityThreshold: number;
  maxSimilarSubmissions: number;
  maxRelatedConcepts: number;

  // Кэширование
  enableCache: boolean;
  cacheExpiration: number; // в секундах

  // GraphRAG
  enableGraph: boolean;
  graphProvider: 'neo4j' | 'memory';
}

// ============================================
// Статистика
// ============================================

export interface CacheStats {
  id: number;
  entityType: 'lesson' | 'assignment' | 'submission';
  entityId: string;
  hitCount: number;
  lastAccessed: Date;
  createdAt: Date;
}

export interface LessonStats {
  id: string;
  title: string;
  assignmentsCount: number;
  submissionsCount: number;
  acceptedCount: number;
  avgSimilarity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConceptStats {
  conceptName: string;
  category: ConceptCategory;
  usageCount: number;
  avgQuality: number;
  importanceScore: number;
}

// ============================================
// API Response типы
// ============================================

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    timestamp: Date;
    processingTime: number;
  };
}

export interface BatchProcessResult {
  total: number;
  processed: number;
  failed: number;
  errors: Array<{
    id: string;
    error: string;
  }>;
}

// ============================================
// Knowledge Builder типы
// ============================================

export interface KnowledgeBuilderOptions {
  lessonId: string;
  includeRejected?: boolean;
  minSimilarity?: number;
  extractConcepts?: boolean;
  buildGraph?: boolean;
}

export interface KnowledgeBuilderResult {
  lessonsProcessed: number;
  submissionsProcessed: number;
  conceptsExtracted: number;
  graphNodesCreated: number;
  graphEdgesCreated: number;
  processingTime: number;
  errors: string[];
}

// ============================================
// Graph типы (для GraphRAG)
// ============================================

export interface GraphNode {
  id: string;
  type: 'lesson' | 'assignment' | 'submission' | 'concept';
  label: string;
  properties: Record<string, any>;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: 'CONTAINS' | 'HAS_SUBMISSION' | 'TEACHES' | 'USES' | 'SIMILAR_TO';
  weight?: number;
  properties?: Record<string, any>;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

// ============================================
// Утилитарные типы
// ============================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OmitFields<T, K extends keyof T> = Omit<T, K>;




