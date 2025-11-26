# Интеграция OpenSPG клиента с основным агентом GetcourseAgent

## Обзор

Данный документ описывает интеграцию OpenSPG клиента с основным агентом GetcourseAgent. Мы создадим TypeScript клиент для работы с OpenSPG и интегрируем его в существующий workflow проверки домашних заданий.

## Архитектура интеграции

### Компоненты интеграции
```
src/kag/
├── integration/
│   ├── client-integration.md          # Этот документ
│   ├── kag-client-impl.md             # Реализация KAG клиента
│   ├── education-adapter.md           # Адаптер для образовательной доменной области
│   └── workflow-integration.md         # Интеграция с workflow
├── client/
│   ├── KAGClient.ts                   # Основной клиент KAG
│   ├── EducationKAGAdapter.ts          # Адаптер для GetcourseAgent
│   ├── SPGBuilder.ts                  # Клиент для SPG-Builder
│   ├── SPGReasoner.ts                 # Клиент для SPG-Reasoner
│   └── KNextFramework.ts              # Клиент для KNext Framework
└── utils/
    ├── config.ts                      # Конфигурация
    ├── logger.ts                      # Логирование
    └── errors.ts                       # Обработка ошибок
```

## Реализация KAG клиента

### KAGClient.ts
```typescript
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { 
  KAGClient, 
  KAGConfig, 
  KAGQuery, 
  KAGResult, 
  SearchOptions,
  KAGInferenceResult,
  KAGRecommendation,
  KAGCondition,
  KAGRelationQuery,
  KAGOrder
} from '../types/education-entities';

export class KAGClientImpl implements KAGClient {
  private httpClient: AxiosInstance;
  private config: KAGConfig;
  private initialized: boolean = false;

  constructor(config?: KAGConfig) {
    this.config = config || this.getDefaultConfig();
    this.httpClient = axios.create({
      baseURL: this.config.server.url,
      timeout: this.config.server.timeout || 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  private getDefaultConfig(): KAGConfig {
    return {
      server: {
        url: process.env.OPENSPG_SERVER_URL || 'http://localhost:8887',
        timeout: 30000
      },
      database: {
        type: 'neo4j',
        connection: {
          host: process.env.OPENSPG_NEO4J_HOST || 'localhost',
          port: parseInt(process.env.OPENSPG_NEO4J_PORT || '7687'),
          username: process.env.OPENSPG_NEO4J_USERNAME || 'neo4j',
          password: process.env.OPENSPG_NEO4J_PASSWORD || 'neo4j@openspg',
          database: process.env.OPENSPG_NEO4J_DATABASE || 'neo4j'
        }
      },
      schema: {
        file: process.env.OPENSPG_SCHEMA_FILE || './src/kag/schema/education-schema.json',
        version: '1.0.0'
      },
      reasoning: {
        enabled: true,
        rules: ['StudentReadiness', 'AssignmentDifficulty', 'ConceptPrerequisites'],
        confidence: 0.8
      }
    };
  }

  async init(config?: KAGConfig): Promise<boolean> {
    try {
      if (config) {
        this.config = { ...this.config, ...config };
        this.httpClient = axios.create({
          baseURL: this.config.server.url,
          timeout: this.config.server.timeout || 30000,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }

      // Проверка здоровья сервера
      const healthResponse = await this.httpClient.get('/api/v1/health');
      if (healthResponse.status !== 200) {
        throw new Error(`OpenSPG server health check failed: ${healthResponse.status}`);
      }

      // Загрузка схемы
      await this.loadSchema();

      // Загрузка правил вывода
      if (this.config.reasoning.enabled) {
        await this.loadReasoningRules();
      }

      this.initialized = true;
      console.log('✅ KAG Client initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize KAG Client:', error);
      throw error;
    }
  }

  private async loadSchema(): Promise<void> {
    try {
      const fs = require('fs').promises;
      const schemaContent = await fs.readFile(this.config.schema.file, 'utf8');
      const schema = JSON.parse(schemaContent);

      const response: AxiosResponse = await this.httpClient.post('/api/v1/schema/load', schema);
      if (response.status !== 200) {
        throw new Error(`Failed to load schema: ${response.status}`);
      }
      console.log('✅ Schema loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load schema:', error);
      throw error;
    }
  }

  private async loadReasoningRules(): Promise<void> {
    try {
      const fs = require('fs').promises;
      const rulesDir = './src/kag/rules';
      const files = await fs.readdir(rulesDir);
      
      for (const file of files) {
        if (file.endsWith('.kgdsl')) {
          const ruleContent = await fs.readFile(`${rulesDir}/${file}`, 'utf8');
          const response: AxiosResponse = await this.httpClient.post(
            '/api/v1/rules/load', 
            ruleContent,
            { headers: { 'Content-Type': 'text/plain' } }
          );
          if (response.status !== 200) {
            throw new Error(`Failed to load rule ${file}: ${response.status}`);
          }
          console.log(`✅ Rule ${file} loaded successfully`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to load reasoning rules:', error);
      throw error;
    }
  }

  async addEntity<T>(type: string, entity: T): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const response: AxiosResponse = await this.httpClient.post(`/api/v1/entities/${type}`, entity);
      return response.status === 200;
    } catch (error) {
      console.error(`❌ Failed to add entity ${type}:`, error);
      throw error;
    }
  }

  async getEntity<T>(type: string, id: string): Promise<T | null> {
    this.ensureInitialized();
    
    try {
      const response: AxiosResponse = await this.httpClient.get(`/api/v1/entities/${type}/${id}`);
      return response.status === 200 ? response.data : null;
    } catch (error) {
      console.error(`❌ Failed to get entity ${type}/${id}:`, error);
      return null;
    }
  }

  async updateEntity<T>(type: string, id: string, updates: Partial<T>): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const response: AxiosResponse = await this.httpClient.put(`/api/v1/entities/${type}/${id}`, updates);
      return response.status === 200;
    } catch (error) {
      console.error(`❌ Failed to update entity ${type}/${id}:`, error);
      throw error;
    }
  }

  async deleteEntity(type: string, id: string): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const response: AxiosResponse = await this.httpClient.delete(`/api/v1/entities/${type}/${id}`);
      return response.status === 200;
    } catch (error) {
      console.error(`❌ Failed to delete entity ${type}/${id}:`, error);
      throw error;
    }
  }

  async addRelation(type: string, relation: any): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const response: AxiosResponse = await this.httpClient.post(`/api/v1/relations/${type}`, relation);
      return response.status === 200;
    } catch (error) {
      console.error(`❌ Failed to add relation ${type}:`, error);
      throw error;
    }
  }

  async getRelations(type: string, fromId?: string, toId?: string): Promise<any[]> {
    this.ensureInitialized();
    
    try {
      const params: any = {};
      if (fromId) params.fromId = fromId;
      if (toId) params.toId = toId;
      
      const response: AxiosResponse = await this.httpClient.get(`/api/v1/relations/${type}`, { params });
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to get relations ${type}:`, error);
      return [];
    }
  }

  async deleteRelation(type: string, fromId: string, toId: string): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const response: AxiosResponse = await this.httpClient.delete(`/api/v1/relations/${type}/${fromId}/${toId}`);
      return response.status === 200;
    } catch (error) {
      console.error(`❌ Failed to delete relation ${type}:`, error);
      throw error;
    }
  }

  async query(query: KAGQuery): Promise<KAGResult[]> {
    this.ensureInitialized();
    
    try {
      const response: AxiosResponse = await this.httpClient.post('/api/v1/query', query);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to execute query:', error);
      return [];
    }
  }

  async search(query: string, options?: SearchOptions): Promise<KAGResult[]> {
    this.ensureInitialized();
    
    try {
      const params: any = { q: query };
      if (options) {
        if (options.entityTypes) params.entityTypes = options.entityTypes.join(',');
        if (options.relationTypes) params.relationTypes = options.relationTypes.join(',');
        if (options.limit) params.limit = options.limit;
        if (options.offset) params.offset = options.offset;
        if (options.ranking) params.ranking = options.ranking;
      }
      
      const response: AxiosResponse = await this.httpClient.get('/api/v1/search', { params });
      return response.data;
    } catch (error) {
      console.error('❌ Failed to search:', error);
      return [];
    }
  }

  async infer(rules?: string[]): Promise<KAGInferenceResult[]> {
    this.ensureInitialized();
    
    try {
      const response: AxiosResponse = await this.httpClient.post('/api/v1/infer', { rules });
      return response.data;
    } catch (error) {
      console.error('❌ Failed to infer:', error);
      return [];
    }
  }

  async recommend(entityId: string, relationType: string): Promise<KAGRecommendation[]> {
    this.ensureInitialized();
    
    try {
      const response: AxiosResponse = await this.httpClient.get(`/api/v1/recommend/${entityId}/${relationType}`);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to get recommendations:', error);
      return [];
    }
  }

  async close(): Promise<void> {
    this.initialized = false;
    console.log('🔌 KAG Client closed');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('KAG Client is not initialized. Call init() first.');
    }
  }
}
```

## Адаптер для образовательной доменной области

### EducationKAGAdapter.ts
```typescript
import { KAGClientImpl } from './KAGClient';
import { 
  EducationKAGAdapter,
  Lesson,
  LessonInput,
  Assignment,
  AssignmentInput,
  Student,
  StudentInput,
  Submission,
  SubmissionInput,
  Concept,
  ConceptInput,
  Resource,
  ResourceInput,
  SubmissionContext,
  KAGRecommendation,
  SearchOptions
} from '../types/education-entities';

export class EducationKAGAdapterImpl implements EducationKAGAdapter {
  private kagClient: KAGClientImpl;
  private initialized: boolean = false;

  constructor(kagClient?: KAGClientImpl) {
    this.kagClient = kagClient || new KAGClientImpl();
  }

  async initialize(): Promise<boolean> {
    try {
      await this.kagClient.init();
      this.initialized = true;
      console.log('✅ Education KAG Adapter initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Education KAG Adapter:', error);
      throw error;
    }
  }

  async addLesson(lesson: LessonInput): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      // Добавляем урок
      const lessonWithTimestamps = {
        ...lesson,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const success = await this.kagClient.addEntity('Lesson', lessonWithTimestamps);
      if (!success) return false;

      // Добавляем ресурсы если есть
      if (lesson.resources) {
        for (const resource of lesson.resources) {
          await this.addResource(resource);
          await this.kagClient.addRelation('USES', {
            lesson_id: lesson.id,
            resource_id: resource.id,
            purpose: 'required',
            importance: 1
          });
        }
      }

      console.log(`✅ Lesson ${lesson.id} added successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to add lesson ${lesson.id}:`, error);
      return false;
    }
  }

  async getLesson(id: string): Promise<Lesson | null> {
    this.ensureInitialized();
    return await this.kagClient.getEntity<Lesson>('Lesson', id);
  }

  async updateLesson(id: string, updates: Partial<Lesson>): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const updatesWithTimestamp = {
        ...updates,
        updated_at: new Date()
      };
      
      return await this.kagClient.updateEntity('Lesson', id, updatesWithTimestamp);
    } catch (error) {
      console.error(`❌ Failed to update lesson ${id}:`, error);
      return false;
    }
  }

  async findLessons(query: string, options?: SearchOptions): Promise<Lesson[]> {
    this.ensureInitialized();
    
    try {
      const results = await this.kagClient.search(query, {
        ...options,
        entityTypes: ['Lesson']
      });
      
      return results
        .filter(result => result.entity)
        .map(result => result.entity as Lesson);
    } catch (error) {
      console.error('❌ Failed to find lessons:', error);
      return [];
    }
  }

  async addAssignment(assignment: AssignmentInput): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const assignmentWithTimestamps = {
        ...assignment,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const success = await this.kagClient.addEntity('Assignment', assignmentWithTimestamps);
      if (!success) return false;

      // Добавляем отношение CONTAINS
      await this.kagClient.addRelation('CONTAINS', {
        lesson_id: assignment.lesson_id,
        assignment_id: assignment.id,
        order: 1,
        required: true
      });

      console.log(`✅ Assignment ${assignment.id} added successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to add assignment ${assignment.id}:`, error);
      return false;
    }
  }

  async getAssignment(id: string): Promise<Assignment | null> {
    this.ensureInitialized();
    return await this.kagClient.getEntity<Assignment>('Assignment', id);
  }

  async updateAssignment(id: string, updates: Partial<Assignment>): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const updatesWithTimestamp = {
        ...updates,
        updated_at: new Date()
      };
      
      return await this.kagClient.updateEntity('Assignment', id, updatesWithTimestamp);
    } catch (error) {
      console.error(`❌ Failed to update assignment ${id}:`, error);
      return false;
    }
  }

  async addStudent(student: StudentInput): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const studentWithTimestamps = {
        ...student,
        registration_date: student.registration_date || new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const success = await this.kagClient.addEntity('Student', studentWithTimestamps);
      if (success) {
        console.log(`✅ Student ${student.id} added successfully`);
      }
      return success;
    } catch (error) {
      console.error(`❌ Failed to add student ${student.id}:`, error);
      return false;
    }
  }

  async getStudent(id: string): Promise<Student | null> {
    this.ensureInitialized();
    return await this.kagClient.getEntity<Student>('Student', id);
  }

  async updateStudent(id: string, updates: Partial<Student>): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const updatesWithTimestamp = {
        ...updates,
        updated_at: new Date()
      };
      
      return await this.kagClient.updateEntity('Student', id, updatesWithTimestamp);
    } catch (error) {
      console.error(`❌ Failed to update student ${id}:`, error);
      return false;
    }
  }

  async addSubmission(submission: SubmissionInput): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const submissionWithTimestamps = {
        ...submission,
        submitted_at: submission.submitted_at || new Date(),
        status: submission.status || 'pending'
      };
      
      const success = await this.kagClient.addEntity('Submission', submissionWithTimestamps);
      if (!success) return false;

      // Добавляем отношение SUBMITS
      await this.kagClient.addRelation('SUBMITS', {
        student_id: submission.student_id,
        assignment_id: submission.assignment_id,
        submission_id: submission.id,
        attempts: 1,
        time_spent: 0
      });

      console.log(`✅ Submission ${submission.id} added successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to add submission ${submission.id}:`, error);
      return false;
    }
  }

  async getSubmission(id: string): Promise<Submission | null> {
    this.ensureInitialized();
    return await this.kagClient.getEntity<Submission>('Submission', id);
  }

  async updateSubmission(id: string, updates: Partial<Submission>): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const updatesWithTimestamp = {
        ...updates,
        checked_at: updates.status ? new Date() : undefined
      };
      
      return await this.kagClient.updateEntity('Submission', id, updatesWithTimestamp);
    } catch (error) {
      console.error(`❌ Failed to update submission ${id}:`, error);
      return false;
    }
  }

  async addConcept(concept: ConceptInput): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const conceptWithTimestamps = {
        ...concept,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const success = await this.kagClient.addEntity('Concept', conceptWithTimestamps);
      if (success) {
        console.log(`✅ Concept ${concept.id} added successfully`);
      }
      return success;
    } catch (error) {
      console.error(`❌ Failed to add concept ${concept.id}:`, error);
      return false;
    }
  }

  async getConcept(id: string): Promise<Concept | null> {
    this.ensureInitialized();
    return await this.kagClient.getEntity<Concept>('Concept', id);
  }

  async findConcepts(query: string, options?: SearchOptions): Promise<Concept[]> {
    this.ensureInitialized();
    
    try {
      const results = await this.kagClient.search(query, {
        ...options,
        entityTypes: ['Concept']
      });
      
      return results
        .filter(result => result.entity)
        .map(result => result.entity as Concept);
    } catch (error) {
      console.error('❌ Failed to find concepts:', error);
      return [];
    }
  }

  async addResource(resource: ResourceInput): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const resourceWithTimestamps = {
        ...resource,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const success = await this.kagClient.addEntity('Resource', resourceWithTimestamps);
      if (success) {
        console.log(`✅ Resource ${resource.id} added successfully`);
      }
      return success;
    } catch (error) {
      console.error(`❌ Failed to add resource ${resource.id}:`, error);
      return false;
    }
  }

  async getContextForSubmission(submissionId: string): Promise<SubmissionContext> {
    this.ensureInitialized();
    
    try {
      // Получаем работу
      const submission = await this.getSubmission(submissionId);
      if (!submission) {
        throw new Error(`Submission ${submissionId} not found`);
      }

      // Получаем задание
      const assignment = await this.getAssignment(submission.assignment_id);
      if (!assignment) {
        throw new Error(`Assignment ${submission.assignment_id} not found`);
      }

      // Получаем урок
      const lesson = await this.getLesson(assignment.lesson_id);
      if (!lesson) {
        throw new Error(`Lesson ${assignment.lesson_id} not found`);
      }

      // Получаем студента
      const student = await this.getStudent(submission.student_id);
      if (!student) {
        throw new Error(`Student ${submission.student_id} not found`);
      }

      // Получаем связанные концепции
      const conceptRelations = await this.kagClient.getRelations('TEACHES', lesson.id);
      const relatedConcepts: Concept[] = [];
      for (const relation of conceptRelations) {
        const concept = await this.getConcept(relation.target_id);
        if (concept) {
          relatedConcepts.push(concept);
        }
      }

      // Получаем похожие работы
      const similarSubmissions: Submission[] = [];
      const submissionRelations = await this.kagClient.getRelations('SUBMITS', undefined, assignment.assignment_id);
      for (const relation of submissionRelations) {
        if (relation.from_id !== submission.student_id) {
          const similarSubmission = await this.getSubmission(relation.submission_id);
          if (similarSubmission) {
            similarSubmissions.push(similarSubmission);
          }
        }
      }

      // Получаем рекомендуемые ресурсы
      const resourceRelations = await this.kagClient.getRelations('USES', lesson.id);
      const recommendedResources: Resource[] = [];
      for (const relation of resourceRelations) {
        const resource = await this.kagClient.getEntity<Resource>('Resource', relation.target_id);
        if (resource) {
          recommendedResources.push(resource);
        }
      }

      // Получаем предварительные условия
      const prerequisites: Concept[] = [];
      for (const concept of relatedConcepts) {
        const prereqRelations = await this.kagClient.getRelations('REQUIRES', concept.id);
        for (const relation of prereqRelations) {
          const prereqConcept = await this.getConcept(relation.target_id);
          if (prereqConcept) {
            prerequisites.push(prereqConcept);
          }
        }
      }

      return {
        submission,
        assignment,
        lesson,
        student,
        relatedConcepts,
        similarSubmissions,
        recommendedResources,
        prerequisites
      };
    } catch (error) {
      console.error(`❌ Failed to get context for submission ${submissionId}:`, error);
      throw error;
    }
  }

  async getRecommendationsForStudent(studentId: string): Promise<KAGRecommendation[]> {
    this.ensureInitialized();
    
    try {
      // Получаем рекомендации на основе правил вывода
      const recommendations = await this.kagClient.recommend(studentId, 'READY_FOR');
      
      // Дополняем рекомендациями по концепциям
      const conceptRecommendations = await this.kagClient.recommend(studentId, 'READY_TO_LEARN');
      recommendations.push(...conceptRecommendations);
      
      return recommendations;
    } catch (error) {
      console.error(`❌ Failed to get recommendations for student ${studentId}:`, error);
      return [];
    }
  }

  async close(): Promise<void> {
    await this.kagClient.close();
    this.initialized = false;
    console.log('🔌 Education KAG Adapter closed');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Education KAG Adapter is not initialized. Call initialize() first.');
    }
  }
}
```

## Интеграция с основным workflow

### Модификация src/index.ts
```typescript
import { EducationKAGAdapterImpl } from './kag/client/EducationKAGAdapter';
import { KAGClientImpl } from './kag/client/KAGClient';

// Инициализация KAG адаптера
const kagAdapter = new EducationKAGAdapterImpl();

// В функции main() перед запуском основного workflow
async function main() {
  try {
    // Инициализация KAG
    console.log('🔧 Initializing KAG system...');
    await kagAdapter.initialize();
    console.log('✅ KAG system initialized successfully');

    // Остальная инициализация...
    await initializeBrowser();
    await loginToGetcourse();
    
    // Основной workflow
    await checkHomeworkWorkflow();
    
  } catch (error) {
    console.error('❌ Error in main workflow:', error);
  } finally {
    // Закрытие соединений
    await kagAdapter.close();
    await browser.close();
  }
}

// Модификация функции checkHomeworkSubmission
async function checkHomeworkSubmission(submission: any) {
  try {
    console.log(`🔍 Проверка работы студента: ${submission.studentName}`);
    
    // Добавляем работу в KAG
    await kagAdapter.addSubmission({
      id: submission.id,
      assignment_id: submission.assignmentId,
      student_id: submission.studentId,
      content: submission.content,
      imageUrls: submission.imageUrls,
      fileUrls: submission.fileUrls
    });

    // Получаем контекст из KAG
    const context = await kagAdapter.getContextForSubmission(submission.id);
    
    console.log(`📚 Урок: ${context.lesson.title}`);
    console.log(`📝 Задание: ${context.assignment.title}`);
    console.log(`👨‍🎓 Студент: ${context.student.name}`);
    console.log(`💡 Связанные концепции: ${context.relatedConcepts.map(c => c.name).join(', ')}`);
    
    // Используем контекст для проверки работы
    const prompt = buildPromptWithContext(context);
    
    // Отправляем в AI для проверки
    const aiResponse = await checkSubmissionWithAI(prompt, submission);
    
    // Обновляем работу в KAG
    await kagAdapter.updateSubmission(submission.id, {
      status: aiResponse.accepted ? 'accepted' : 'rejected',
      score: aiResponse.score,
      feedback: aiResponse.feedback
    });

    // Добавляем оцененные концепции
    for (const concept of context.relatedConcepts) {
      await kagAdapter.addRelation('EVALUATES', {
        submission_id: submission.id,
        concept_id: concept.id,
        mastery_level: aiResponse.conceptMastery[concept.id] || 0,
        evidence: aiResponse.feedback
      });
    }

    // Получаем рекомендации для студента
    const recommendations = await kagAdapter.getRecommendationsForStudent(submission.studentId);
    if (recommendations.length > 0) {
      console.log(`🎯 Рекомендации для студента:`);
      for (const rec of recommendations) {
        console.log(`  - ${rec.entity.title || rec.entity.name}: ${rec.reason}`);
      }
    }

    return aiResponse;
  } catch (error) {
    console.error(`❌ Ошибка при проверке работы ${submission.id}:`, error);
    throw error;
  }
}

// Функция построения промпта с контекстом
function buildPromptWithContext(context: SubmissionContext): string {
  return `
Ты - преподаватель, который проверяет домашнее задание.

КОНТЕКСТ УРОКА:
Название урока: ${context.lesson.title}
Содержание урока: ${context.lesson.content}
Сложность: ${context.lesson.difficulty}

ЗАДАНИЕ:
Название: ${context.assignment.title}
Описание: ${context.assignment.description}
Требования: ${context.assignment.requirements?.join(', ') || 'Нет'}

СТУДЕНТ:
Имя: ${context.student.name}
Уровень: ${context.student.level}
Прогресс: ${context.student.progress}%

СВЯЗАННЫЕ КОНЦЕПЦИИ:
${context.relatedConcepts.map(c => `- ${c.name}: ${c.description}`).join('\n')}

РЕСУРСЫ:
${context.recommendedResources.map(r => `- ${r.title}: ${r.url}`).join('\n')}

ПОХОЖИЕ РАБОТЫ:
${context.similarSubmissions.slice(0, 3).map(s => `- Статус: ${s.status}, Оценка: ${s.score}`).join('\n')`

РАБОТА ДЛЯ ПРОВЕРКИ:
${context.submission.content}

Проанализируй работу студента, учитывая контекст урока, изученные концепции и уровень студента.
Дай обратную связь и оцени работу.
  `;
}
```

## Утилиты и конфигурация

### config.ts
```typescript
export const KAG_CONFIG = {
  server: {
    url: process.env.OPENSPG_SERVER_URL || 'http://localhost:8887',
    timeout: parseInt(process.env.OPENSPG_TIMEOUT || '30000')
  },
  database: {
    type: 'neo4j',
    connection: {
      host: process.env.OPENSPG_NEO4J_HOST || 'localhost',
      port: parseInt(process.env.OPENSPG_NEO4J_PORT || '7687'),
      username: process.env.OPENSPG_NEO4J_USERNAME || 'neo4j',
      password: process.env.OPENSPG_NEO4J_PASSWORD || 'neo4j@openspg',
      database: process.env.OPENSPG_NEO4J_DATABASE || 'neo4j'
    }
  },
  schema: {
    file: process.env.OPENSPG_SCHEMA_FILE || './src/kag/schema/education-schema.json',
    version: '1.0.0'
  },
  reasoning: {
    enabled: process.env.OPENSPG_REASONING_ENABLED !== 'false',
    rules: process.env.OPENSPG_RULES?.split(',') || ['StudentReadiness', 'AssignmentDifficulty', 'ConceptPrerequisites'],
    confidence: parseFloat(process.env.OPENSPG_CONFIDENCE || '0.8')
  }
};
```

### logger.ts
```typescript
export class KAGLogger {
  private static instance: KAGLogger;
  
  static getInstance(): KAGLogger {
    if (!KAGLogger.instance) {
      KAGLogger.instance = new KAGLogger();
    }
    return KAGLogger.instance;
  }

  info(message: string, ...args: any[]): void {
    console.log(`🔍 [KAG] ${message}`, ...args);
  }

  error(message: string, error?: any): void {
    console.error(`❌ [KAG] ${message}`, error);
  }

  success(message: string, ...args: any[]): void {
    console.log(`✅ [KAG] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`⚠️ [KAG] ${message}`, ...args);
  }
}
```

### errors.ts
```typescript
export class KAGError extends Error {
  constructor(message: string, public code?: string, public details?: any) {
    super(message);
    this.name = 'KAGError';
  }
}

export class KAGConnectionError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'CONNECTION_ERROR', details);
  }
}

export class KAGSchemaError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'SCHEMA_ERROR', details);
  }
}

export class KAGReasoningError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'REASONING_ERROR', details);
  }
}
```

## Тестирование интеграции

### test-kag-integration.ts
```typescript
import { EducationKAGAdapterImpl } from '../client/EducationKAGAdapter';
import { KAGClientImpl } from '../client/KAGClient';

async function testKAGIntegration() {
  console.log('🧪 Testing KAG Integration...');
  
  const adapter = new EducationKAGAdapterImpl();
  
  try {
    // Инициализация
    await adapter.initialize();
    console.log('✅ Adapter initialized');
    
    // Тест добавления урока
    const lesson = {
      id: 'test_lesson_001',
      title: 'Тестовый урок',
      content: 'Это тестовый контент урока',
      difficulty: 'beginner' as const
    };
    
    await adapter.addLesson(lesson);
    console.log('✅ Lesson added');
    
    // Тест получения урока
    const retrievedLesson = await adapter.getLesson('test_lesson_001');
    console.log('✅ Lesson retrieved:', retrievedLesson?.title);
    
    // Тест добавления студента
    const student = {
      id: 'test_student_001',
      name: 'Тестовый студент',
      level: 'beginner' as const
    };
    
    await adapter.addStudent(student);
    console.log('✅ Student added');
    
    // Тест добавления задания
    const assignment = {
      id: 'test_assignment_001',
      lesson_id: 'test_lesson_001',
      title: 'Тестовое задание',
      description: 'Это тестовое задание'
    };
    
    await adapter.addAssignment(assignment);
    console.log('✅ Assignment added');
    
    // Тест добавления работы
    const submission = {
      id: 'test_submission_001',
      assignment_id: 'test_assignment_001',
      student_id: 'test_student_001',
      content: 'Это тестовая работа студента'
    };
    
    await adapter.addSubmission(submission);
    console.log('✅ Submission added');
    
    // Тест получения контекста
    const context = await adapter.getContextForSubmission('test_submission_001');
    console.log('✅ Context retrieved:', {
      lesson: context.lesson.title,
      assignment: context.assignment.title,
      student: context.student.name
    });
    
    // Тест рекомендаций
    const recommendations = await adapter.getRecommendationsForStudent('test_student_001');
    console.log('✅ Recommendations:', recommendations.length);
    
    console.log('🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await adapter.close();
  }
}

testKAGIntegration();
```

## Следующие шаги

1. **Создать реализацию клиентов**: KAGClient, EducationKAGAdapter
2. **Интегрировать с основным workflow**: Модифицировать src/index.ts
3. **Адаптировать парсер уроков**: Использовать SPG-Builder для извлечения концепций
4. **Настроить правила вывода**: Реализовать логические правила для рекомендаций
5. **Тестирование**: Проверить работу всех компонентов
6. **Оптимизация**: Улучшить производительность и обработку ошибок

## Преимущества данной интеграции

1. **Типизация**: Полная типизация всех операций
2. **Обработка ошибок**: Надежная обработка ошибок и логирование
3. **Контекст**: Богатый контекст для проверки работ
4. **Рекомендации**: Автоматические рекомендации для студентов
5. **Масштабируемость**: Легко масштабировать и расширять
6. **Тестируемость**: Полная тестируемость всех компонентов