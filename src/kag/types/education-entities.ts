// TypeScript типы для образовательной доменной области KAG

// ============================================
// БАЗОВЫЕ СУЩНОСТИ
// ============================================

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type SubmissionStatus = 'pending' | 'accepted' | 'rejected';
export type ResourceType = 'video' | 'document' | 'image' | 'link' | 'tool';
export type ResourceFormat = 'mp4' | 'pdf' | 'jpg' | 'png' | 'html' | 'other';
export type ConceptCategory = 'tool' | 'platform' | 'technique' | 'concept' | 'other';
export type TeachingMethod = 'theory' | 'practice' | 'example' | 'demonstration';
export type ResourcePurpose = 'required' | 'optional' | 'reference' | 'example';

// ============================================
// СУЩНОСТИ (ENTITIES)
// ============================================

export interface Lesson {
  id: string;
  title: string;
  content: string;
  summary?: string;
  duration?: number;
  difficulty?: DifficultyLevel;
  created_at: Date;
  updated_at: Date;
  videoUrls?: string[];
  imageUrls?: string[];
}

export interface LessonInput {
  id: string;
  title: string;
  content: string;
  summary?: string;
  duration?: number;
  difficulty?: DifficultyLevel;
  videoUrls?: string[];
  imageUrls?: string[];
  resources?: ResourceInput[];
}

export interface Assignment {
  id: string;
  lesson_id: string;
  title: string;
  description: string;
  requirements?: string[];
  ideal_answer?: string;
  max_attempts?: number;
  deadline?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface AssignmentInput {
  id: string;
  lesson_id: string;
  title: string;
  description: string;
  requirements?: string[];
  ideal_answer?: string;
  max_attempts?: number;
  deadline?: Date;
}

export interface Student {
  id: string;
  name: string;
  email?: string;
  registration_date: Date;
  level?: DifficultyLevel;
  progress?: number;
  created_at: Date;
  updated_at: Date;
}

export interface StudentInput {
  id: string;
  name: string;
  email?: string;
  registration_date?: Date;
  level?: DifficultyLevel;
  progress?: number;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string;
  status?: SubmissionStatus;
  submitted_at: Date;
  score?: number;
  feedback?: string;
  checked_at?: Date;
  imageUrls?: string[];
  fileUrls?: string[];
}

export interface SubmissionInput {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string;
  status?: SubmissionStatus;
  submitted_at?: Date;
  score?: number;
  feedback?: string;
  imageUrls?: string[];
  fileUrls?: string[];
}

export interface Concept {
  id: string;
  name: string;
  description: string;
  category?: ConceptCategory;
  difficulty?: DifficultyLevel;
  prerequisites?: string[];
  created_at: Date;
  updated_at: Date;
}

export interface ConceptInput {
  id: string;
  name: string;
  description: string;
  category?: ConceptCategory;
  difficulty?: DifficultyLevel;
  prerequisites?: string[];
}

export interface Resource {
  id: string;
  type: ResourceType;
  url: string;
  title: string;
  description?: string;
  format?: ResourceFormat;
  created_at: Date;
  updated_at: Date;
}

export interface ResourceInput {
  id: string;
  type: ResourceType;
  url: string;
  title: string;
  description?: string;
  format?: ResourceFormat;
}

// ============================================
// ОТНОШЕНИЯ (RELATIONS)
// ============================================

export interface ConceptRelation {
  fromConcept: string;
  toConcept: string;
  relationType: 'REQUIRES' | 'RELATED_TO' | 'PART_OF' | 'EXAMPLE_OF';
  strength: number;
  description?: string;
}

// ============================================
// KAG КЛИЕНТ
// ============================================

export interface KAGConfig {
  server: {
    url: string;
    timeout?: number;
  };
  database: {
    type: 'neo4j' | 'mysql';
    connection: {
      host: string;
      port: number;
      username: string;
      password: string;
      database?: string;
    };
  };
  schema: {
    file: string;
    version: string;
  };
  reasoning: {
    enabled: boolean;
    rules: string[];
    confidence: number;
  };
}

export interface KAGQuery {
  entityTypes?: string[];
  relationTypes?: string[];
  conditions?: KAGCondition[];
  limit?: number;
  offset?: number;
  orderBy?: KAGOrder[];
}

export interface KAGCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: any;
}

export interface KAGOrder {
  field: string;
  direction: 'asc' | 'desc';
}

export interface KAGResult {
  entity?: any;
  relation?: any;
  score?: number;
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  entityTypes?: string[];
  relationTypes?: string[];
  limit?: number;
  offset?: number;
  ranking?: 'relevance' | 'date' | 'score';
}

export interface KAGInferenceResult {
  ruleName: string;
  conclusion: string;
  confidence: number;
  evidence: string[];
  reasoning: string;
  timestamp: Date;
}

export interface KAGRecommendation {
  entity: any;
  reason: string;
  confidence: number;
  priority?: number;
}

export interface KAGRelationQuery {
  type: string;
  fromId?: string;
  toId?: string;
  properties?: Record<string, any>;
}

// ============================================
// КОНТЕКСТ ДЛЯ ПРОВЕРКИ РАБОТ
// ============================================

export interface SubmissionContext {
  submission: Submission;
  assignment: Assignment;
  lesson: Lesson;
  student: Student;
  relatedConcepts: Concept[];
  similarSubmissions: Submission[];
  recommendedResources: Resource[];
  prerequisites: Concept[];
}

// ============================================
// ИНТЕРФЕЙСЫ КЛИЕНТОВ
// ============================================

export interface KAGClient {
  init(config?: KAGConfig): Promise<boolean>;
  addEntity<T>(type: string, entity: T): Promise<boolean>;
  getEntity<T>(type: string, id: string): Promise<T | null>;
  updateEntity<T>(type: string, id: string, updates: Partial<T>): Promise<boolean>;
  deleteEntity(type: string, id: string): Promise<boolean>;
  addRelation(type: string, relation: any): Promise<boolean>;
  getRelations(type: string, fromId?: string, toId?: string): Promise<any[]>;
  deleteRelation(type: string, fromId: string, toId: string): Promise<boolean>;
  query(query: KAGQuery): Promise<KAGResult[]>;
  search(query: string, options?: SearchOptions): Promise<KAGResult[]>;
  infer(rules?: string[]): Promise<KAGInferenceResult[]>;
  recommend(entityId: string, relationType: string): Promise<KAGRecommendation[]>;
  close(): Promise<void>;
}

export interface EducationKAGAdapter {
  initialize(): Promise<boolean>;
  
  // Lesson operations
  addLesson(lesson: LessonInput): Promise<boolean>;
  getLesson(id: string): Promise<Lesson | null>;
  updateLesson(id: string, updates: Partial<Lesson>): Promise<boolean>;
  findLessons(query: string, options?: SearchOptions): Promise<Lesson[]>;
  
  // Assignment operations
  addAssignment(assignment: AssignmentInput): Promise<boolean>;
  getAssignment(id: string): Promise<Assignment | null>;
  updateAssignment(id: string, updates: Partial<Assignment>): Promise<boolean>;
  
  // Student operations
  addStudent(student: StudentInput): Promise<boolean>;
  getStudent(id: string): Promise<Student | null>;
  updateStudent(id: string, updates: Partial<Student>): Promise<boolean>;
  
  // Submission operations
  addSubmission(submission: SubmissionInput): Promise<boolean>;
  getSubmission(id: string): Promise<Submission | null>;
  updateSubmission(id: string, updates: Partial<Submission>): Promise<boolean>;
  
  // Concept operations
  addConcept(concept: ConceptInput): Promise<boolean>;
  getConcept(id: string): Promise<Concept | null>;
  findConcepts(query: string, options?: SearchOptions): Promise<Concept[]>;
  
  // Resource operations
  addResource(resource: ResourceInput): Promise<boolean>;
  
  // Context and recommendations
  getContextForSubmission(submissionId: string): Promise<SubmissionContext>;
  getRecommendationsForStudent(studentId: string): Promise<KAGRecommendation[]>;
  
  close(): Promise<void>;
}

// ============================================
// ОШИБКИ
// ============================================

export class KAGError extends Error {
  code?: string;
  details?: any;
  
  constructor(message: string, code?: string, details?: any) {
    super(message);
    this.name = 'KAGError';
    this.code = code;
    this.details = details;
  }
}

export class KAGConnectionError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'KAGConnectionError';
  }
}

export class KAGSchemaError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'SCHEMA_ERROR', details);
    this.name = 'KAGSchemaError';
  }
}

export class KAGReasoningError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'REASONING_ERROR', details);
    this.name = 'KAGReasoningError';
  }
}

// ============================================
// УТИЛИТЫ
// ============================================

export interface InferenceResult {
  ruleName: string;
  conclusion: string;
  confidence: number;
  evidence: string[];
  reasoning: string;
  timestamp: Date;
}

export interface LessonData {
  id: string;
  title: string;
  content: string;
  summary?: string;
}

export interface SubmissionData {
  id: string;
  studentName: string;
  studentId: string;
  assignmentId: string;
  lessonId: string;
  content: string;
  text: string;
  imageUrls?: string[];
  fileUrls?: string[];
}

export interface AIFeedback {
  comment: string;
  status: 'accept' | 'reject';
  recommendations?: string[];
  masteryLevel?: number;
  conceptMastery?: Record<string, number>;
  score?: number;
  feedback?: string;
  accepted?: boolean;
}

