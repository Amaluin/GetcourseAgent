// Адаптер для образовательной доменной области
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
import { logger } from '../utils/logger';
import { KAGConnectionError, assertExists } from '../utils/errors';

export class EducationKAGAdapterImpl implements EducationKAGAdapter {
  private kagClient: KAGClientImpl;
  private initialized: boolean = false;

  constructor(kagClient?: KAGClientImpl) {
    this.kagClient = kagClient || new KAGClientImpl();
  }

  async initialize(): Promise<boolean> {
    try {
      logger.operation('Initializing Education KAG Adapter');

      await this.kagClient.init();
      this.initialized = true;

      logger.success('Education KAG Adapter initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Education KAG Adapter', error);
      throw new KAGConnectionError('Failed to initialize Education KAG Adapter', error);
    }
  }

  // ============================================
  // LESSON OPERATIONS
  // ============================================

  async addLesson(lesson: LessonInput): Promise<boolean> {
    this.ensureInitialized();

    try {
      logger.operation('Adding lesson', { id: lesson.id, title: lesson.title });

      // Добавляем урок с временными метками
      const lessonWithTimestamps = {
        ...lesson,
        created_at: new Date(),
        updated_at: new Date()
      };

      const success = await this.kagClient.addEntity('Lesson', lessonWithTimestamps);
      if (!success) return false;

      // Добавляем ресурсы если есть
      if (lesson.resources && lesson.resources.length > 0) {
        for (const resource of lesson.resources) {
          await this.addResource(resource);
          await this.kagClient.addRelation('USES', {
            from: lesson.id,
            to: resource.id,
            purpose: 'required',
            importance: 1
          });
        }
      }

      logger.success(`Lesson ${lesson.id} added successfully`);
      return true;
    } catch (error) {
      logger.error(`Failed to add lesson ${lesson.id}`, error);
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
      logger.error(`Failed to update lesson ${id}`, error);
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
      logger.error('Failed to find lessons', error);
      return [];
    }
  }

  // ============================================
  // ASSIGNMENT OPERATIONS
  // ============================================

  async addAssignment(assignment: AssignmentInput): Promise<boolean> {
    this.ensureInitialized();

    try {
      logger.operation('Adding assignment', { id: assignment.id, title: assignment.title });

      const assignmentWithTimestamps = {
        ...assignment,
        created_at: new Date(),
        updated_at: new Date()
      };

      const success = await this.kagClient.addEntity('Assignment', assignmentWithTimestamps);
      if (!success) return false;

      // Добавляем отношение CONTAINS
      await this.kagClient.addRelation('CONTAINS', {
        from: assignment.lesson_id,
        to: assignment.id,
        order: 1,
        required: true
      });

      logger.success(`Assignment ${assignment.id} added successfully`);
      return true;
    } catch (error) {
      logger.error(`Failed to add assignment ${assignment.id}`, error);
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
      logger.error(`Failed to update assignment ${id}`, error);
      return false;
    }
  }

  // ============================================
  // STUDENT OPERATIONS
  // ============================================

  async addStudent(student: StudentInput): Promise<boolean> {
    this.ensureInitialized();

    try {
      logger.operation('Adding student', { id: student.id, name: student.name });

      const studentWithTimestamps = {
        ...student,
        registration_date: student.registration_date || new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };

      const success = await this.kagClient.addEntity('Student', studentWithTimestamps);
      if (success) {
        logger.success(`Student ${student.id} added successfully`);
      }
      return success;
    } catch (error) {
      logger.error(`Failed to add student ${student.id}`, error);
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
      logger.error(`Failed to update student ${id}`, error);
      return false;
    }
  }

  // ============================================
  // SUBMISSION OPERATIONS
  // ============================================

  async addSubmission(submission: SubmissionInput): Promise<boolean> {
    this.ensureInitialized();

    try {
      logger.operation('Adding submission', { id: submission.id, student: submission.student_id });

      const submissionWithTimestamps = {
        ...submission,
        submitted_at: submission.submitted_at || new Date(),
        status: submission.status || 'pending'
      };

      const success = await this.kagClient.addEntity('Submission', submissionWithTimestamps);
      if (!success) return false;

      // Добавляем отношение SUBMITS
      await this.kagClient.addRelation('SUBMITS', {
        from: submission.student_id,
        to: submission.assignment_id,
        submission_id: submission.id,
        attempts: 1,
        time_spent: 0
      });

      logger.success(`Submission ${submission.id} added successfully`);
      return true;
    } catch (error) {
      logger.error(`Failed to add submission ${submission.id}`, error);
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
      logger.error(`Failed to update submission ${id}`, error);
      return false;
    }
  }

  // ============================================
  // CONCEPT OPERATIONS
  // ============================================

  async addConcept(concept: ConceptInput): Promise<boolean> {
    this.ensureInitialized();

    try {
      logger.operation('Adding concept', { id: concept.id, name: concept.name });

      const conceptWithTimestamps = {
        ...concept,
        created_at: new Date(),
        updated_at: new Date()
      };

      const success = await this.kagClient.addEntity('Concept', conceptWithTimestamps);
      if (success) {
        logger.success(`Concept ${concept.id} added successfully`);
      }
      return success;
    } catch (error) {
      logger.error(`Failed to add concept ${concept.id}`, error);
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
      logger.error('Failed to find concepts', error);
      return [];
    }
  }

  // ============================================
  // RESOURCE OPERATIONS
  // ============================================

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
        logger.success(`Resource ${resource.id} added successfully`);
      }
      return success;
    } catch (error) {
      logger.error(`Failed to add resource ${resource.id}`, error);
      return false;
    }
  }

  // ============================================
  // CONTEXT AND RECOMMENDATIONS
  // ============================================

  async getContextForSubmission(submissionId: string): Promise<SubmissionContext> {
    this.ensureInitialized();

    try {
      logger.operation('Getting context for submission', { submissionId });

      // Получаем работу
      const submission = await this.getSubmission(submissionId);
      assertExists(submission, 'Submission', submissionId);

      // Получаем задание
      const assignment = await this.getAssignment(submission.assignment_id);
      assertExists(assignment, 'Assignment', submission.assignment_id);

      // Получаем урок
      const lesson = await this.getLesson(assignment.lesson_id);
      assertExists(lesson, 'Lesson', assignment.lesson_id);

      // Получаем студента
      const student = await this.getStudent(submission.student_id);
      assertExists(student, 'Student', submission.student_id);

      // Получаем связанные концепции
      const conceptRelations = await this.kagClient.getRelations('TEACHES', lesson.id);
      const relatedConcepts: Concept[] = [];
      for (const relation of conceptRelations) {
        const concept = await this.getConcept(relation.to);
        if (concept) {
          relatedConcepts.push(concept);
        }
      }

      // Получаем похожие работы (упрощенная версия)
      const similarSubmissions: Submission[] = [];

      // Получаем рекомендуемые ресурсы
      const resourceRelations = await this.kagClient.getRelations('USES', lesson.id);
      const recommendedResources: Resource[] = [];
      for (const relation of resourceRelations) {
        const resource = await this.kagClient.getEntity<Resource>('Resource', relation.to);
        if (resource) {
          recommendedResources.push(resource);
        }
      }

      // Получаем предварительные условия
      const prerequisites: Concept[] = [];
      for (const concept of relatedConcepts) {
        const prereqRelations = await this.kagClient.getRelations('REQUIRES', concept.id);
        for (const relation of prereqRelations) {
          const prereqConcept = await this.getConcept(relation.to);
          if (prereqConcept) {
            prerequisites.push(prereqConcept);
          }
        }
      }

      const context: SubmissionContext = {
        submission,
        assignment,
        lesson,
        student,
        relatedConcepts,
        similarSubmissions,
        recommendedResources,
        prerequisites
      };

      logger.success('Context retrieved successfully', {
        concepts: relatedConcepts.length,
        resources: recommendedResources.length,
        prerequisites: prerequisites.length
      });

      return context;
    } catch (error) {
      logger.error(`Failed to get context for submission ${submissionId}`, error);
      throw error;
    }
  }

  async getRecommendationsForStudent(studentId: string): Promise<KAGRecommendation[]> {
    this.ensureInitialized();

    try {
      logger.operation('Getting recommendations for student', { studentId });

      // Получаем рекомендации на основе правил вывода
      const recommendations = await this.kagClient.recommend(studentId, 'READY_FOR');

      // Дополняем рекомендациями по концепциям
      const conceptRecommendations = await this.kagClient.recommend(studentId, 'READY_TO_LEARN');
      recommendations.push(...conceptRecommendations);

      logger.recommendation(studentId, recommendations.length);

      return recommendations;
    } catch (error) {
      logger.error(`Failed to get recommendations for student ${studentId}`, error);
      return [];
    }
  }

  // ============================================
  // CLEANUP
  // ============================================

  async close(): Promise<void> {
    await this.kagClient.close();
    this.initialized = false;
    logger.info('Education KAG Adapter closed');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new KAGConnectionError('Education KAG Adapter is not initialized. Call initialize() first.');
    }
  }
}

