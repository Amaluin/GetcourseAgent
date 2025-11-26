# TypeScript интерфейсы для образовательной доменной области KAG

## Обзор

Данный файл содержит TypeScript интерфейсы, которые соответствуют SPG-Schema, определенной в `education-schema.md`. Эти интерфейсы будут использоваться для интеграции KAG с основным агентом GetcourseAgent.

## Основные интерфейсы сущностей

### 1. Lesson (Урок)
```typescript
export interface Lesson {
  id: string;
  title: string;
  content: string;
  summary?: string;
  duration?: number;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  created_at: Date;
  updated_at: Date;
  videoUrls?: string[];
  imageUrls?: string[];
  resources?: Resource[];
}

export interface LessonInput {
  id: string;
  title: string;
  content: string;
  summary?: string;
  duration?: number;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  videoUrls?: string[];
  imageUrls?: string[];
  resources?: Resource[];
}
```

### 2. Assignment (Задание)
```typescript
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
```

### 3. Student (Студент)
```typescript
export interface Student {
  id: string;
  name: string;
  email?: string;
  registration_date: Date;
  level?: 'beginner' | 'intermediate' | 'advanced';
  progress?: number;
  created_at: Date;
  updated_at: Date;
}

export interface StudentInput {
  id: string;
  name: string;
  email?: string;
  registration_date?: Date;
  level?: 'beginner' | 'intermediate' | 'advanced';
  progress?: number;
}
```

### 4. Submission (Работа студента)
```typescript
export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string;
  status?: 'pending' | 'accepted' | 'rejected';
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
  status?: 'pending' | 'accepted' | 'rejected';
  submitted_at?: Date;
  imageUrls?: string[];
  fileUrls?: string[];
}
```

### 5. Concept (Концепция)
```typescript
export interface Concept {
  id: string;
  name: string;
  description: string;
  category?: 'tool' | 'platform' | 'technique' | 'concept' | 'other';
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  prerequisites?: string[];
  created_at: Date;
  updated_at: Date;
}

export interface ConceptInput {
  id: string;
  name: string;
  description: string;
  category?: 'tool' | 'platform' | 'technique' | 'concept' | 'other';
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  prerequisites?: string[];
}
```

### 6. Resource (Ресурс)
```typescript
export interface Resource {
  id: string;
  type: 'video' | 'document' | 'image' | 'link' | 'tool';
  url: string;
  title: string;
  description?: string;
  format?: 'mp4' | 'pdf' | 'jpg' | 'png' | 'html' | 'other';
  created_at: Date;
  updated_at: Date;
}

export interface ResourceInput {
  id: string;
  type: 'video' | 'document' | 'image' | 'link' | 'tool';
  url: string;
  title: string;
  description?: string;
  format?: 'mp4' | 'pdf' | 'jpg' | 'png' | 'html' | 'other';
}
```

## Интерфейсы отношений

### 1. ContainsRelation (Содержит)
```typescript
export interface ContainsRelation {
  lesson_id: string;
  assignment_id: string;
  order?: number;
  required?: boolean;
}
```

### 2. StudiesRelation (Изучает)
```typescript
export interface StudiesRelation {
  student_id: string;
  lesson_id: string;
  progress?: number;
  started_at?: Date;
  completed_at?: Date;
}
```

### 3. SubmitsRelation (Выполняет)
```typescript
export interface SubmitsRelation {
  student_id: string;
  assignment_id: string;
  submission_id: string;
  attempts?: number;
  time_spent?: number;
}
```

### 4. EvaluatesRelation (Оценивает)
```typescript
export interface EvaluatesRelation {
  submission_id: string;
  concept_id: string;
  mastery_level?: number;
  evidence?: string;
}
```

### 5. RequiresRelation (Требует)
```typescript
export interface RequiresRelation {
  concept_id: string;
  prerequisite_id: string;
  strength?: number;
  description?: string;
}
```

### 6. UsesRelation (Использует)
```typescript
export interface UsesRelation {
  lesson_id: string;
  resource_id: string;
  purpose?: 'required' | 'optional' | 'reference' | 'example';
  importance?: number;
}
```

### 7. TeachesRelation (Обучает)
```typescript
export interface TeachesRelation {
  lesson_id: string;
  concept_id: string;
  depth?: number;
  method?: 'theory' | 'practice' | 'example' | 'demonstration';
}
```

## Интерфейсы для работы с KAG

### 1. KAGClient (Клиент KAG)
```typescript
export interface KAGClient {
  // Инициализация
  init(config: KAGConfig): Promise<boolean>;
  
  // Работа с сущностями
  addEntity<T>(type: string, entity: T): Promise<boolean>;
  getEntity<T>(type: string, id: string): Promise<T | null>;
  updateEntity<T>(type: string, id: string, updates: Partial<T>): Promise<boolean>;
  deleteEntity(type: string, id: string): Promise<boolean>;
  
  // Работа с отношениями
  addRelation(type: string, relation: any): Promise<boolean>;
  getRelations(type: string, fromId?: string, toId?: string): Promise<any[]>;
  deleteRelation(type: string, fromId: string, toId: string): Promise<boolean>;
  
  // Поиск и запросы
  query(query: KAGQuery): Promise<KAGResult[]>;
  search(query: string, options?: SearchOptions): Promise<KAGResult[]>;
  
  // Вывод и рекомендации
  infer(rules: string[]): Promise<KAGInferenceResult[]>;
  recommend(entityId: string, relationType: string): Promise<KAGRecommendation[]>;
  
  // Закрытие соединения
  close(): Promise<void>;
}
```

### 2. KAGConfig (Конфигурация KAG)
```typescript
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
    version?: string;
  };
  reasoning: {
    enabled: boolean;
    rules?: string[];
    confidence?: number;
  };
}
```

### 3. KAGQuery (Запрос KAG)
```typescript
export interface KAGQuery {
  select?: string[];
  from?: string;
  where?: KAGCondition[];
  relations?: KAGRelationQuery[];
  limit?: number;
  offset?: number;
  order?: KAGOrder[];
}

export interface KAGCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: any;
}

export interface KAGRelationQuery {
  type: string;
  direction?: 'outgoing' | 'incoming' | 'both';
  target?: string;
  depth?: number;
}

export interface KAGOrder {
  field: string;
  direction: 'asc' | 'desc';
}
```

### 4. KAGResult (Результат запроса KAG)
```typescript
export interface KAGResult {
  entity?: any;
  relations?: any[];
  score?: number;
  metadata?: Record<string, any>;
}
```

### 5. SearchOptions (Опции поиска)
```typescript
export interface SearchOptions {
  entityTypes?: string[];
  relationTypes?: string[];
  limit?: number;
  offset?: number;
  filters?: KAGCondition[];
  ranking?: 'relevance' | 'recent' | 'popularity';
}
```

### 6. KAGInferenceResult (Результат вывода)
```typescript
export interface KAGInferenceResult {
  rule: string;
  conclusion: string;
  confidence: number;
  evidence: any[];
  metadata?: Record<string, any>;
}
```

### 7. KAGRecommendation (Рекомендация)
```typescript
export interface KAGRecommendation {
  entity: any;
  relation: string;
  score: number;
  reason?: string;
  metadata?: Record<string, any>;
}
```

## Интерфейсы для интеграции с GetcourseAgent

### 1. EducationKAGAdapter (Адаптер для GetcourseAgent)
```typescript
export interface EducationKAGAdapter {
  // Инициализация
  initialize(): Promise<boolean>;
  
  // Работа с уроками
  addLesson(lesson: LessonInput): Promise<boolean>;
  getLesson(id: string): Promise<Lesson | null>;
  updateLesson(id: string, updates: Partial<Lesson>): Promise<boolean>;
  findLessons(query: string, options?: SearchOptions): Promise<Lesson[]>;
  
  // Работа с заданиями
  addAssignment(assignment: AssignmentInput): Promise<boolean>;
  getAssignment(id: string): Promise<Assignment | null>;
  updateAssignment(id: string, updates: Partial<Assignment>): Promise<boolean>;
  
  // Работа со студентами
  addStudent(student: StudentInput): Promise<boolean>;
  getStudent(id: string): Promise<Student | null>;
  updateStudent(id: string, updates: Partial<Student>): Promise<boolean>;
  
  // Работа с работами
  addSubmission(submission: SubmissionInput): Promise<boolean>;
  getSubmission(id: string): Promise<Submission | null>;
  updateSubmission(id: string, updates: Partial<Submission>): Promise<boolean>;
  
  // Работа с концепциями
  addConcept(concept: ConceptInput): Promise<boolean>;
  getConcept(id: string): Promise<Concept | null>;
  findConcepts(query: string, options?: SearchOptions): Promise<Concept[]>;
  
  // Получение контекста для проверки работ
  getContextForSubmission(submissionId: string): Promise<SubmissionContext>;
  
  // Получение рекомендаций для студента
  getRecommendationsForStudent(studentId: string): Promise<KAGRecommendation[]>;
  
  // Закрытие соединения
  close(): Promise<void>;
}
```

### 2. SubmissionContext (Контекст работы)
```typescript
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
```

## Примеры использования

### 1. Инициализация KAG клиента
```typescript
import { KAGClient, KAGConfig } from './education-entities';

const config: KAGConfig = {
  server: {
    url: 'http://localhost:8887',
    timeout: 30000
  },
  database: {
    type: 'neo4j',
    connection: {
      host: 'localhost',
      port: 7687,
      username: 'neo4j',
      password: 'neo4j@openspg'
    }
  },
  schema: {
    file: './src/kag/schema/education-schema.json',
    version: '1.0.0'
  },
  reasoning: {
    enabled: true,
    rules: ['StudentReadiness', 'AssignmentDifficulty'],
    confidence: 0.8
  }
};

const kagClient: KAGClient = new KAGClientImpl();
await kagClient.init(config);
```

### 2. Добавление урока
```typescript
const lesson: LessonInput = {
  id: 'lesson_001',
  title: 'Введение в GitHub Actions',
  content: 'В этом уроке мы изучим основы CI/CD...',
  difficulty: 'beginner',
  videoUrls: ['https://example.com/video1.mp4']
};

await kagClient.addEntity('Lesson', lesson);
```

### 3. Получение контекста для проверки работы
```typescript
const adapter: EducationKAGAdapter = new EducationKAGAdapterImpl();
await adapter.initialize();

const context: SubmissionContext = await adapter.getContextForSubmission('submission_123');

// Использование контекста для проверки работы
console.log(`Урок: ${context.lesson.title}`);
console.log(`Концепции: ${context.relatedConcepts.map(c => c.name).join(', ')}`);
console.log(`Похожие работы: ${context.similarSubmissions.length}`);
```

## Следующие шаги

1. **Создать реализацию интерфейсов**: KAGClientImpl, EducationKAGAdapterImpl
2. **Интегрировать с основным агентом**: Заменить текущий Neo4j клиент
3. **Адаптировать парсер уроков**: Использовать SPG-Builder для извлечения концепций
4. **Настроить правила вывода**: Реализовать логические правила для рекомендаций
5. **Тестирование**: Проверить работу всех компонентов

## Преимущества данных интерфейсов

1. **Типизация**: Полная типизация всех сущностей и отношений
2. **Расширяемость**: Легко добавлять новые типы и отношения
3. **Интеграция**: Совместимость с существующим кодом GetcourseAgent
4. **KAG-совместимость**: Полное соответствие SPG-Schema
5. **Гибкость**: Поддержка различных конфигураций и опций