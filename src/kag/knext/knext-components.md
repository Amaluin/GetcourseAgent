# Создание KNext компонентов для образовательных сценариев

## Обзор

Данный документ описывает создание KNext компонентов для специфических образовательных сценариев в GetcourseAgent. KNext Framework предоставляет программируемый интерфейс для создания кастомных компонентов поверх графа знаний OpenSPG.

## Архитектура KNext компонентов

### Структура компонентов
```
src/kag/
├── knext/
│   ├── knext-components.md            # Этот документ
│   ├── framework-overview.md          # Обзор KNext Framework
│   ├── component-architecture.md     # Архитектура компонентов
│   └── deployment-guide.md            # Руководство по развертыванию
├── components/
│   ├── core/
│   │   ├── BaseComponent.ts           # Базовый компонент
│   │   ├── ComponentRegistry.ts       # Реестр компонентов
│   │   └── ComponentManager.ts        # Менеджер компонентов
│   ├── education/
│   │   ├── LearningPathBuilder.ts     # Построитель образовательных путей
│   │   ├── PersonalizedRecommender.ts # Персонализированный рекомендатор
│   │   ├── AdaptiveAssessment.ts      # Адаптивная оценка
│   │   ├── SkillGapAnalyzer.ts        # Анализатор пробелов в навыках
│   │   ├── ProgressTracker.ts         # Трекер прогресса
│   │   └── CollaborationMatcher.ts     # Матчер для коллаборации
│   ├── analytics/
│   │   ├── LearningAnalytics.ts       # Аналитика обучения
│   │   ├── EngagementMetrics.ts       # Метрики вовлеченности
│   │   ├── PerformancePredictor.ts    # Предиктор производительности
│   │   └── DropoutRiskAnalyzer.ts     # Анализатор риска отсева
│   └── automation/
│       ├── AutoGrader.ts              # Автоматический оценщик
│       ├── ContentGenerator.ts        # Генератор контента
│       ├── NotificationEngine.ts       # Движок уведомлений
│       └── FeedbackCollector.ts       # Сборщик обратной связи
├── workflows/
│   ├── onboarding/
│   │   ├── StudentOnboarding.ts       # Онбординг студентов
│   │   ├── SkillAssessment.ts         # Оценка навыков
│   │   └── PersonalizedPlan.ts        # Персонализированный план
│   ├── learning/
│   │   ├── AdaptiveLearning.ts         # Адаптивное обучение
│   │   ├── MicroLearning.ts           # Микрообучение
│   │   └── SpacedRepetition.ts       # Интервальное повторение
│   └── assessment/
│       ├── FormativeAssessment.ts     # Формативная оценка
│       ├── SummativeAssessment.ts     # Суммативная оценка
│       └── PeerReview.ts              # Проверка сверстниками
└── interfaces/
    ├── ComponentInterface.ts         # Интерфейс компонента
    ├── WorkflowInterface.ts           # Интерфейс workflow
    └── ServiceInterface.ts            # Интерфейс сервиса
```

## Базовая архитектура компонентов

### BaseComponent.ts
```typescript
import { KAGClientImpl } from '../client/KAGClient';
import { ComponentConfig, ComponentContext, ComponentResult } from '../interfaces/ComponentInterface';

export abstract class BaseComponent {
  protected kagClient: KAGClientImpl;
  protected config: ComponentConfig;
  protected context: ComponentContext;
  protected initialized: boolean = false;

  constructor(kagClient: KAGClientImpl, config: ComponentConfig) {
    this.kagClient = kagClient;
    this.config = config;
    this.context = this.createContext();
  }

  async initialize(): Promise<void> {
    try {
      console.log(`🔧 Initializing component: ${this.getComponentName()}`);
      
      // Валидация конфигурации
      this.validateConfig();
      
      // Инициализация специфических для компонента ресурсов
      await this.initializeComponent();
      
      this.initialized = true;
      console.log(`✅ Component ${this.getComponentName()} initialized successfully`);
    } catch (error) {
      console.error(`❌ Failed to initialize component ${this.getComponentName()}:`, error);
      throw error;
    }
  }

  async execute(input: any): Promise<ComponentResult> {
    this.ensureInitialized();
    
    try {
      console.log(`⚡ Executing component: ${this.getComponentName()}`);
      
      // Предварительная обработка входных данных
      const processedInput = await this.preprocessInput(input);
      
      // Основная логика компонента
      const result = await this.executeComponent(processedInput);
      
      // Постобработка результатов
      const finalResult = await this.postprocessResult(result);
      
      console.log(`✅ Component ${this.getComponentName()} executed successfully`);
      return finalResult;
    } catch (error) {
      console.error(`❌ Error executing component ${this.getComponentName()}:`, error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      console.log(`🧹 Cleaning up component: ${this.getComponentName()}`);
      
      // Очистка специфических для компонента ресурсов
      await this.cleanupComponent();
      
      this.initialized = false;
      console.log(`✅ Component ${this.getComponentName()} cleaned up successfully`);
    } catch (error) {
      console.error(`❌ Error cleaning up component ${this.getComponentName()}:`, error);
    }
  }

  // Абстрактные методы для реализации в дочерних классах
  protected abstract getComponentName(): string;
  protected abstract initializeComponent(): Promise<void>;
  protected abstract executeComponent(input: any): Promise<ComponentResult>;
  protected abstract cleanupComponent(): Promise<void>;

  // Вспомогательные методы с реализацией по умолчанию
  protected validateConfig(): void {
    if (!this.config) {
      throw new Error('Component config is required');
    }
  }

  protected createContext(): ComponentContext {
    return {
      componentId: this.config.id || this.generateComponentId(),
      componentType: this.getComponentName(),
      config: this.config,
      kagClient: this.kagClient,
      logger: this.createLogger(),
      metrics: this.createMetricsCollector()
    };
  }

  protected async preprocessInput(input: any): Promise<any> {
    return input;
  }

  protected async postprocessResult(result: ComponentResult): Promise<ComponentResult> {
    return {
      ...result,
      metadata: {
        ...result.metadata,
        componentId: this.context.componentId,
        executedAt: new Date(),
        executionTime: result.metadata?.executionTime || 0
      }
    };
  }

  private generateComponentId(): string {
    return `${this.getComponentName().toLowerCase()}_${Date.now()}`;
  }

  private createLogger() {
    return {
      info: (message: string, ...args: any[]) => {
        console.log(`🔍 [${this.getComponentName()}] ${message}`, ...args);
      },
      error: (message: string, error?: any) => {
        console.error(`❌ [${this.getComponentName()}] ${message}`, error);
      },
      success: (message: string, ...args: any[]) => {
        console.log(`✅ [${this.getComponentName()}] ${message}`, ...args);
      },
      warn: (message: string, ...args: any[]) => {
        console.warn(`⚠️ [${this.getComponentName()}] ${message}`, ...args);
      }
    };
  }

  private createMetricsCollector() {
    return {
      increment: (metric: string, value: number = 1) => {
        console.log(`📊 [${this.getComponentName()}] Metric ${metric}: +${value}`);
      },
      timing: (metric: string, duration: number) => {
        console.log(`⏱️ [${this.getComponentName()}] Timing ${metric}: ${duration}ms`);
      },
      gauge: (metric: string, value: number) => {
        console.log(`📈 [${this.getComponentName()}] Gauge ${metric}: ${value}`);
      }
    };
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`Component ${this.getComponentName()} is not initialized`);
    }
  }
}
```

## Образовательные компоненты

### LearningPathBuilder.ts
```typescript
import { BaseComponent } from '../core/BaseComponent';
import { ComponentConfig, ComponentResult } from '../interfaces/ComponentInterface';
import { 
  Student, 
  Lesson, 
  Concept, 
  LearningPath, 
  LearningPathStep 
} from '../types/education-entities';

export interface LearningPathInput {
  studentId: string;
  targetConcepts: string[];
  currentKnowledge: string[];
  timeConstraints?: number; // в часах
  difficultyPreference?: 'conservative' | 'balanced' | 'aggressive';
}

export interface LearningPathOutput {
  learningPath: LearningPath;
  estimatedDuration: number;
  difficultyProgression: string[];
  prerequisites: string[];
  alternatives: LearningPath[];
}

export class LearningPathBuilder extends BaseComponent {
  protected getComponentName(): string {
    return 'LearningPathBuilder';
  }

  protected async initializeComponent(): Promise<void> {
    // Инициализация алгоритмов построения путей
    console.log('🔧 Initializing learning path algorithms...');
  }

  protected async executeComponent(input: LearningPathInput): Promise<ComponentResult> {
    try {
      this.context.logger.info('Building learning path for student', input.studentId);
      
      // 1. Анализ текущих знаний студента
      const currentKnowledge = await this.analyzeCurrentKnowledge(input.studentId);
      
      // 2. Определение промежуточных концепций
      const intermediateConcepts = await this.identifyIntermediateConcepts(
        input.currentKnowledge,
        input.targetConcepts
      );
      
      // 3. Поиск релевантных уроков
      const relevantLessons = await this.findRelevantLessons(intermediateConcepts);
      
      // 4. Оптимизация последовательности уроков
      const optimizedSequence = await this.optimizeLessonSequence(
        relevantLessons,
        input.timeConstraints,
        input.difficultyPreference
      );
      
      // 5. Создание образовательного пути
      const learningPath = await this.createLearningPath(
        input.studentId,
        optimizedSequence,
        input.targetConcepts
      );
      
      // 6. Генерация альтернативных путей
      const alternatives = await this.generateAlternativePaths(
        input.studentId,
        input.targetConcepts,
        learningPath
      );
      
      const output: LearningPathOutput = {
        learningPath,
        estimatedDuration: this.calculateEstimatedDuration(learningPath),
        difficultyProgression: this.calculateDifficultyProgression(learningPath),
        prerequisites: await this.identifyMissingPrerequisites(input.studentId, learningPath),
        alternatives
      };
      
      this.context.metrics.timing('path_building_duration', Date.now());
      this.context.metrics.increment('paths_built');
      
      return {
        success: true,
        data: output,
        metadata: {
          studentId: input.studentId,
          targetConcepts: input.targetConcepts,
          pathLength: learningPath.steps.length
        }
      };
    } catch (error) {
      this.context.logger.error('Error building learning path', error);
      return {
        success: false,
        error: error.message,
        metadata: { studentId: input.studentId }
      };
    }
  }

  protected async cleanupComponent(): Promise<void> {
    // Очистка ресурсов
  }

  private async analyzeCurrentKnowledge(studentId: string): Promise<string[]> {
    // Анализ текущих знаний студента из графа
    const student = await this.kagClient.getEntity<Student>('Student', studentId);
    if (!student) return [];
    
    // Поиск освоенных концепций
    const masteredRelations = await this.kagClient.getRelations('MASTERED', studentId);
    return masteredRelations.map(relation => relation.to_id);
  }

  private async identifyIntermediateConcepts(
    currentKnowledge: string[], 
    targetConcepts: string[]
  ): Promise<string[]> {
    const intermediateConcepts: string[] = [];
    
    for (const targetConcept of targetConcepts) {
      // Поиск всех prerequisite концепций
      const prerequisites = await this.findAllPrerequisites(targetConcept);
      
      // Фильтрация уже изученных концепций
      const missingPrerequisites = prerequisites.filter(
        concept => !currentKnowledge.includes(concept)
      );
      
      intermediateConcepts.push(...missingPrerequisites);
    }
    
    return [...new Set(intermediateConcepts)]; // Удаление дубликатов
  }

  private async findAllPrerequisites(conceptId: string): Promise<string[]> {
    const prerequisites: string[] = [];
    const visited = new Set<string>();
    
    await this.dfsPrerequisites(conceptId, prerequisites, visited);
    return prerequisites;
  }

  private async dfsPrerequisites(
    conceptId: string, 
    prerequisites: string[], 
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(conceptId)) return;
    visited.add(conceptId);
    
    const relations = await this.kagClient.getRelations('REQUIRES', conceptId);
    for (const relation of relations) {
      prerequisites.push(relation.to_id);
      await this.dfsPrerequisites(relation.to_id, prerequisites, visited);
    }
  }

  private async findRelevantLessons(concepts: string[]): Promise<Lesson[]> {
    const relevantLessons: Lesson[] = [];
    
    for (const conceptId of concepts) {
      // Поиск уроков, обучающих концепции
      const teachingRelations = await this.kagClient.getRelations('TEACHES', undefined, conceptId);
      
      for (const relation of teachingRelations) {
        const lesson = await this.kagClient.getEntity<Lesson>('Lesson', relation.from_id);
        if (lesson && !relevantLessons.find(l => l.id === lesson.id)) {
          relevantLessons.push(lesson);
        }
      }
    }
    
    return relevantLessons;
  }

  private async optimizeLessonSequence(
    lessons: Lesson[],
    timeConstraints?: number,
    difficultyPreference?: string
  ): Promise<Lesson[]> {
    // Сортировка уроков по сложности и зависимостям
    const sortedLessons = [...lessons].sort((a, b) => {
      const difficultyOrder = { 'beginner': 1, 'intermediate': 2, 'advanced': 3 };
      return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
    });
    
    // Оптимизация с учетом временных ограничений
    if (timeConstraints) {
      return this.filterByTimeConstraints(sortedLessons, timeConstraints);
    }
    
    return sortedLessons;
  }

  private filterByTimeConstraints(lessons: Lesson[], maxHours: number): Lesson[] {
    const filteredLessons: Lesson[] = [];
    let totalHours = 0;
    
    for (const lesson of lessons) {
      const lessonHours = (lesson.duration || 60) / 60; // Преобразование минут в часы
      
      if (totalHours + lessonHours <= maxHours) {
        filteredLessons.push(lesson);
        totalHours += lessonHours;
      } else {
        break;
      }
    }
    
    return filteredLessons;
  }

  private async createLearningPath(
    studentId: string,
    lessons: Lesson[],
    targetConcepts: string[]
  ): Promise<LearningPath> {
    const steps: LearningPathStep[] = [];
    
    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i];
      const step: LearningPathStep = {
        id: `step_${i + 1}`,
        lessonId: lesson.id,
        title: lesson.title,
        description: lesson.summary || lesson.content.substring(0, 200) + '...',
        order: i + 1,
        estimatedDuration: lesson.duration || 60,
        difficulty: lesson.difficulty,
        concepts: await this.getLessonConcepts(lesson.id),
        resources: await this.getLessonResources(lesson.id),
        prerequisites: await this.getStepPrerequisites(lesson.id, lessons.slice(0, i))
      };
      
      steps.push(step);
    }
    
    return {
      id: `path_${studentId}_${Date.now()}`,
      studentId,
      title: `Learning Path to ${targetConcepts.join(', ')}`,
      description: `Personalized learning path for mastering ${targetConcepts.join(', ')}`,
      steps,
      targetConcepts,
      createdAt: new Date(),
      estimatedDuration: steps.reduce((total, step) => total + step.estimatedDuration, 0),
      difficulty: this.calculatePathDifficulty(steps)
    };
  }

  private async getLessonConcepts(lessonId: string): Promise<string[]> {
    const relations = await this.kagClient.getRelations('TEACHES', lessonId);
    return relations.map(relation => relation.to_id);
  }

  private async getLessonResources(lessonId: string): Promise<string[]> {
    const relations = await this.kagClient.getRelations('USES', lessonId);
    return relations.map(relation => relation.to_id);
  }

  private async getStepPrerequisites(lessonId: string, previousLessons: Lesson[]): Promise<string[]> {
    const prerequisites: string[] = [];
    
    // Концепции из предыдущих уроков
    for (const lesson of previousLessons) {
      const concepts = await this.getLessonConcepts(lesson.id);
      prerequisites.push(...concepts);
    }
    
    return [...new Set(prerequisites)];
  }

  private calculatePathDifficulty(steps: LearningPathStep[]): 'beginner' | 'intermediate' | 'advanced' {
    if (steps.length === 0) return 'beginner';
    
    const avgDifficulty = steps.reduce((sum, step) => {
      const difficultyScore = step.difficulty === 'beginner' ? 1 : 
                           step.difficulty === 'intermediate' ? 2 : 3;
      return sum + difficultyScore;
    }, 0) / steps.length;
    
    if (avgDifficulty <= 1.5) return 'beginner';
    if (avgDifficulty <= 2.5) return 'intermediate';
    return 'advanced';
  }

  private calculateEstimatedDuration(learningPath: LearningPath): number {
    return learningPath.steps.reduce((total, step) => total + step.estimatedDuration, 0);
  }

  private calculateDifficultyProgression(learningPath: LearningPath): string[] {
    return learningPath.steps.map(step => step.difficulty);
  }

  private async identifyMissingPrerequisites(studentId: string, learningPath: LearningPath): Promise<string[]> {
    const currentKnowledge = await this.analyzeCurrentKnowledge(studentId);
    const allPrerequisites = learningPath.steps.flatMap(step => step.prerequisites);
    
    return allPrerequisites.filter(prerequisite => !currentKnowledge.includes(prerequisite));
  }

  private async generateAlternativePaths(
    studentId: string,
    targetConcepts: string[],
    primaryPath: LearningPath
  ): Promise<LearningPath[]> {
    const alternatives: LearningPath[] = [];
    
    // Альтернативный путь с фокусом на практику
    const practiceFocusedPath = await this.generatePracticeFocusedPath(
      studentId,
      targetConcepts,
      primaryPath
    );
    if (practiceFocusedPath) {
      alternatives.push(practiceFocusedPath);
    }
    
    // Альтернативный путь с фокусом на теорию
    const theoryFocusedPath = await this.generateTheoryFocusedPath(
      studentId,
      targetConcepts,
      primaryPath
    );
    if (theoryFocusedPath) {
      alternatives.push(theoryFocusedPath);
    }
    
    return alternatives;
  }

  private async generatePracticeFocusedPath(
    studentId: string,
    targetConcepts: string[],
    primaryPath: LearningPath
  ): Promise<LearningPath | null> {
    // Логика генерации пути с фокусом на практику
    // Поиск уроков с большим количеством практических заданий
    return null; // Заглушка
  }

  private async generateTheoryFocusedPath(
    studentId: string,
    targetConcepts: string[],
    primaryPath: LearningPath
  ): Promise<LearningPath | null> {
    // Логика генерации пути с фокусом на теорию
    // Поиск уроков с углубленным теоретическим содержанием
    return null; // Заглушка
  }
}
```

### PersonalizedRecommender.ts
```typescript
import { BaseComponent } from '../core/BaseComponent';
import { ComponentConfig, ComponentResult } from '../interfaces/ComponentInterface';
import { Student, Lesson, Concept, Recommendation } from '../types/education-entities';

export interface RecommendationInput {
  studentId: string;
  context: 'learning' | 'practice' | 'review' | 'exploration';
  limit?: number;
  excludeCompleted?: boolean;
  timeAvailable?: number; // в минутах
}

export interface RecommendationOutput {
  recommendations: Recommendation[];
  reasoning: string;
  confidence: number;
  alternatives: Recommendation[];
}

export class PersonalizedRecommender extends BaseComponent {
  protected getComponentName(): string {
    return 'PersonalizedRecommender';
  }

  protected async initializeComponent(): Promise<void> {
    // Инициализация алгоритмов рекомендаций
    console.log('🔧 Initializing recommendation algorithms...');
  }

  protected async executeComponent(input: RecommendationInput): Promise<ComponentResult> {
    try {
      this.context.logger.info('Generating recommendations for student', input.studentId);
      
      // 1. Анализ профиля студента
      const studentProfile = await this.analyzeStudentProfile(input.studentId);
      
      // 2. Анализ текущего контекста
      const contextAnalysis = await this.analyzeContext(input.studentId, input.context);
      
      // 3. Генерация кандидатов для рекомендаций
      const candidates = await this.generateCandidates(studentProfile, contextAnalysis);
      
      // 4. Ранжирование кандидатов
      const rankedCandidates = await this.rankCandidates(candidates, studentProfile, contextAnalysis);
      
      // 5. Фильтрация и ограничение
      const filteredRecommendations = await this.filterRecommendations(
        rankedCandidates,
        input.limit || 5,
        input.excludeCompleted,
        input.timeAvailable
      );
      
      // 6. Генерация объяснений
      const reasoning = await this.generateReasoning(filteredRecommendations, studentProfile);
      
      // 7. Расчет уверенности
      const confidence = this.calculateConfidence(filteredRecommendations, studentProfile);
      
      // 8. Генерация альтернатив
      const alternatives = await this.generateAlternatives(
        filteredRecommendations,
        studentProfile,
        contextAnalysis
      );
      
      const output: RecommendationOutput = {
        recommendations: filteredRecommendations,
        reasoning,
        confidence,
        alternatives
      };
      
      this.context.metrics.timing('recommendation_generation', Date.now());
      this.context.metrics.increment('recommendations_generated', filteredRecommendations.length);
      
      return {
        success: true,
        data: output,
        metadata: {
          studentId: input.studentId,
          context: input.context,
          recommendationCount: filteredRecommendations.length
        }
      };
    } catch (error) {
      this.context.logger.error('Error generating recommendations', error);
      return {
        success: false,
        error: error.message,
        metadata: { studentId: input.studentId }
      };
    }
  }

  protected async cleanupComponent(): Promise<void> {
    // Очистка ресурсов
  }

  private async analyzeStudentProfile(studentId: string): Promise<any> {
    const student = await this.kagClient.getEntity<Student>('Student', studentId);
    if (!student) return null;
    
    // Анализ изученных концепций
    const masteredConcepts = await this.getMasteredConcepts(studentId);
    
    // Анализ текущего прогресса
    const currentProgress = await this.getCurrentProgress(studentId);
    
    // Анализ стиля обучения
    const learningStyle = await this.analyzeLearningStyle(studentId);
    
    // Анализ производительности
    const performanceMetrics = await this.getPerformanceMetrics(studentId);
    
    return {
      student,
      masteredConcepts,
      currentProgress,
      learningStyle,
      performanceMetrics
    };
  }

  private async analyzeContext(studentId: string, context: string): Promise<any> {
    switch (context) {
      case 'learning':
        return await this.analyzeLearningContext(studentId);
      case 'practice':
        return await this.analyzePracticeContext(studentId);
      case 'review':
        return await this.analyzeReviewContext(studentId);
      case 'exploration':
        return await this.analyzeExplorationContext(studentId);
      default:
        return await this.analyzeGeneralContext(studentId);
    }
  }

  private async analyzeLearningContext(studentId: string): Promise<any> {
    // Анализ контекста активного обучения
    const currentLessons = await this.getCurrentLessons(studentId);
    const strugglingConcepts = await this.getStrugglingConcepts(studentId);
    
    return {
      currentLessons,
      strugglingConcepts,
      contextType: 'learning'
    };
  }

  private async analyzePracticeContext(studentId: string): Promise<any> {
    // Анализ контекста практики
    const pendingAssignments = await this.getPendingAssignments(studentId);
    const practiceGaps = await this.getPracticeGaps(studentId);
    
    return {
      pendingAssignments,
      practiceGaps,
      contextType: 'practice'
    };
  }

  private async analyzeReviewContext(studentId: string): Promise<any> {
    // Анализ контекста повторения
    const forgottenConcepts = await this.getForgottenConcepts(studentId);
    const reviewSchedule = await this.getReviewSchedule(studentId);
    
    return {
      forgottenConcepts,
      reviewSchedule,
      contextType: 'review'
    };
  }

  private async analyzeExplorationContext(studentId: string): Promise<any> {
    // Анализ контекста исследования
    const interests = await this.getStudentInterests(studentId);
    const relatedConcepts = await this.getRelatedConcepts(studentId);
    
    return {
      interests,
      relatedConcepts,
      contextType: 'exploration'
    };
  }

  private async analyzeGeneralContext(studentId: string): Promise<any> {
    // Общий анализ контекста
    return {
      contextType: 'general'
    };
  }

  private async generateCandidates(studentProfile: any, contextAnalysis: any): Promise<any[]> {
    const candidates: any[] = [];
    
    // Генерация кандидатов на основе разных стратегий
    const contentBasedCandidates = await this.generateContentBasedCandidates(studentProfile);
    const collaborativeCandidates = await this.generateCollaborativeCandidates(studentProfile);
    const contextBasedCandidates = await this.generateContextBasedCandidates(contextAnalysis);
    
    candidates.push(...contentBasedCandidates, ...collaborativeCandidates, ...contextBasedCandidates);
    
    return candidates;
  }

  private async generateContentBasedCandidates(studentProfile: any): Promise<any[]> {
    const candidates: any[] = [];
    
    // Рекомендации на основе изученных концепций
    for (const concept of studentProfile.masteredConcepts) {
      const relatedConcepts = await this.getRelatedConcepts(concept.id);
      
      for (const relatedConcept of relatedConcepts) {
        const lessons = await this.getLessonsForConcept(relatedConcept.id);
        
        for (const lesson of lessons) {
          candidates.push({
            type: 'lesson',
            entity: lesson,
            source: 'content_based',
            score: this.calculateContentBasedScore(lesson, studentProfile),
            reasoning: `Based on your knowledge of ${concept.name}`
          });
        }
      }
    }
    
    return candidates;
  }

  private async generateCollaborativeCandidates(studentProfile: any): Promise<any[]> {
    const candidates: any[] = [];
    
    // Поиск похожих студентов
    const similarStudents = await this.findSimilarStudents(studentProfile.student.id);
    
    // Анализ того, что изучали похожие студенты
    for (const similarStudent of similarStudents) {
      const studentLessons = await this.getStudentLessons(similarStudent.id);
      
      for (const lesson of studentLessons) {
        if (!await this.hasStudentCompletedLesson(studentProfile.student.id, lesson.id)) {
          candidates.push({
            type: 'lesson',
            entity: lesson,
            source: 'collaborative',
            score: this.calculateCollaborativeScore(lesson, similarStudent),
            reasoning: `Students like you studied ${lesson.title}`
          });
        }
      }
    }
    
    return candidates;
  }

  private async generateContextBasedCandidates(contextAnalysis: any): Promise<any[]> {
    const candidates: any[] = [];
    
    switch (contextAnalysis.contextType) {
      case 'learning':
        candidates.push(...await this.generateLearningCandidates(contextAnalysis));
        break;
      case 'practice':
        candidates.push(...await this.generatePracticeCandidates(contextAnalysis));
        break;
      case 'review':
        candidates.push(...await this.generateReviewCandidates(contextAnalysis));
        break;
      case 'exploration':
        candidates.push(...await this.generateExplorationCandidates(contextAnalysis));
        break;
    }
    
    return candidates;
  }

  private async rankCandidates(candidates: any[], studentProfile: any, contextAnalysis: any): Promise<any[]> {
    // Ранжирование кандидатов на основе множества факторов
    return candidates.sort((a, b) => {
      const scoreA = this.calculateFinalScore(a, studentProfile, contextAnalysis);
      const scoreB = this.calculateFinalScore(b, studentProfile, contextAnalysis);
      
      return scoreB - scoreA;
    });
  }

  private async filterRecommendations(
    candidates: any[],
    limit: number,
    excludeCompleted: boolean,
    timeAvailable?: number
  ): Promise<Recommendation[]> {
    let filteredCandidates = candidates;
    
    // Исключение завершенных уроков
    if (excludeCompleted) {
      filteredCandidates = filteredCandidates.filter(
        candidate => !candidate.entity.completed
      );
    }
    
    // Фильтрация по времени
    if (timeAvailable) {
      filteredCandidates = filteredCandidates.filter(
        candidate => (candidate.entity.duration || 60) <= timeAvailable
      );
    }
    
    // Ограничение количества
    filteredCandidates = filteredCandidates.slice(0, limit);
    
    // Преобразование в формат Recommendation
    return filteredCandidates.map(candidate => ({
      id: `rec_${candidate.entity.id}_${Date.now()}`,
      type: candidate.type,
      entityId: candidate.entity.id,
      title: candidate.entity.title,
      description: candidate.entity.description || candidate.entity.summary,
      score: candidate.score,
      reasoning: candidate.reasoning,
      metadata: {
        source: candidate.source,
        duration: candidate.entity.duration,
        difficulty: candidate.entity.difficulty
      }
    }));
  }

  private async generateReasoning(recommendations: Recommendation[], studentProfile: any): Promise<string> {
    const reasons = recommendations.map(rec => rec.reasoning);
    const uniqueReasons = [...new Set(reasons)];
    
    return `Based on your learning history and current progress, I recommend these items because: ${uniqueReasons.join('; ')}`;
  }

  private calculateConfidence(recommendations: Recommendation[], studentProfile: any): number {
    if (recommendations.length === 0) return 0;
    
    const avgScore = recommendations.reduce((sum, rec) => sum + rec.score, 0) / recommendations.length;
    const dataCompleteness = this.assessDataCompleteness(studentProfile);
    
    return Math.min(1.0, avgScore * dataCompleteness);
  }

  private async generateAlternatives(
    recommendations: Recommendation[],
    studentProfile: any,
    contextAnalysis: any
  ): Promise<Recommendation[]> {
    // Генерация альтернативных рекомендаций
    const alternatives: Recommendation[] = [];
    
    // Альтернативы с разной сложностью
    for (const rec of recommendations) {
      const easierAlternatives = await this.findEasierAlternatives(rec, studentProfile);
      const harderAlternatives = await this.findHarderAlternatives(rec, studentProfile);
      
      alternatives.push(...easierAlternatives, ...harderAlternatives);
    }
    
    return alternatives.slice(0, 3); // Ограничение количества альтернатив
  }

  // Вспомогательные методы
  private async getMasteredConcepts(studentId: string): Promise<any[]> {
    const relations = await this.kagClient.getRelations('MASTERED', studentId);
    return relations;
  }

  private async getCurrentProgress(studentId: string): Promise<number> {
    const student = await this.kagClient.getEntity<Student>('Student', studentId);
    return student?.progress || 0;
  }

  private async analyzeLearningStyle(studentId: string): Promise<string> {
    // Анализ стиля обучения на основе истории
    return 'visual'; // Заглушка
  }

  private async getPerformanceMetrics(studentId: string): Promise<any> {
    // Получение метрик производительности
    return { avgScore: 0.8, completionRate: 0.9 }; // Заглушка
  }

  private async getCurrentLessons(studentId: string): Promise<any[]> {
    // Получение текущих уроков студента
    return []; // Заглушка
  }

  private async getStrugglingConcepts(studentId: string): Promise<any[]> {
    // Поиск концепций, с которыми студент испытывает трудности
    return []; // Заглушка
  }

  private async getPendingAssignments(studentId: string): Promise<any[]> {
    // Получение ожидающих заданий
    return []; // Заглушка
  }

  private async getPracticeGaps(studentId: string): Promise<any[]> {
    // Определение пробелов в практике
    return []; // Заглушка
  }

  private async getForgottenConcepts(studentId: string): Promise<any[]> {
    // Поиск забытых концепций для повторения
    return []; // Заглушка
  }

  private async getReviewSchedule(studentId: string): Promise<any[]> {
    // Получение графика повторения
    return []; // Заглушка
  }

  private async getStudentInterests(studentId: string): Promise<any[]> {
    // Анализ интересов студента
    return []; // Заглушка
  }

  private async getRelatedConcepts(conceptId: string): Promise<any[]> {
    // Получение связанных концепций
    return []; // Заглушка
  }

  private async getLessonsForConcept(conceptId: string): Promise<Lesson[]> {
    // Получение уроков для концепции
    return []; // Заглушка
  }

  private calculateContentBasedScore(lesson: Lesson, studentProfile: any): number {
    // Расчет релевантности на основе контента
    return 0.8; // Заглушка
  }

  private async findSimilarStudents(studentId: string): Promise<any[]> {
    // Поиск похожих студентов
    return []; // Заглушка
  }

  private async getStudentLessons(studentId: string): Promise<Lesson[]> {
    // Получение уроков студента
    return []; // Заглушка
  }

  private async hasStudentCompletedLesson(studentId: string, lessonId: string): Promise<boolean> {
    // Проверка завершенности урока
    return false; // Заглушка
  }

  private calculateCollaborativeScore(lesson: Lesson, similarStudent: any): number {
    // Расчет коллаборативной оценки
    return 0.7; // Заглушка
  }

  private async generateLearningCandidates(contextAnalysis: any): Promise<any[]> {
    // Генерация кандидатов для контекста обучения
    return []; // Заглушка
  }

  private async generatePracticeCandidates(contextAnalysis: any): Promise<any[]> {
    // Генерация кандидатов для контекста практики
    return []; // Заглушка
  }

  private async generateReviewCandidates(contextAnalysis: any): Promise<any[]> {
    // Генерация кандидатов для контекста повторения
    return []; // Заглушка
  }

  private async generateExplorationCandidates(contextAnalysis: any): Promise<any[]> {
    // Генерация кандидатов для контекста исследования
    return []; // Заглушка
  }

  private calculateFinalScore(candidate: any, studentProfile: any, contextAnalysis: any): number {
    // Расчет итоговой оценки кандидата
    return candidate.score || 0.5;
  }

  private assessDataCompleteness(studentProfile: any): number {
    // Оценка полноты данных профиля студента
    return 0.9; // Заглушка
  }

  private async findEasierAlternatives(recommendation: Recommendation, studentProfile: any): Promise<Recommendation[]> {
    // Поиск более простых альтернатив
    return []; // Заглушка
  }

  private async findHarderAlternatives(recommendation: Recommendation, studentProfile: any): Promise<Recommendation[]> {
    // Поиск более сложных альтернатив
    return []; // Заглушка
  }
}
```

## Интерфейсы компонентов

### ComponentInterface.ts
```typescript
export interface ComponentConfig {
  id?: string;
  name: string;
  version: string;
  enabled: boolean;
  settings: Record<string, any>;
  dependencies?: string[];
}

export interface ComponentContext {
  componentId: string;
  componentType: string;
  config: ComponentConfig;
  kagClient: any;
  logger: Logger;
  metrics: MetricsCollector;
}

export interface ComponentResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface Logger {
  info(message: string, ...args: any[]): void;
  error(message: string, error?: any): void;
  success(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
}

export interface MetricsCollector {
  increment(metric: string, value?: number): void;
  timing(metric: string, duration: number): void;
  gauge(metric: string, value: number): void;
}

// Интерфейсы для образовательных сущностей
export interface LearningPath {
  id: string;
  studentId: string;
  title: string;
  description: string;
  steps: LearningPathStep[];
  targetConcepts: string[];
  createdAt: Date;
  estimatedDuration: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export interface LearningPathStep {
  id: string;
  lessonId: string;
  title: string;
  description: string;
  order: number;
  estimatedDuration: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  concepts: string[];
  resources: string[];
  prerequisites: string[];
}

export interface Recommendation {
  id: string;
  type: 'lesson' | 'concept' | 'resource' | 'assignment';
  entityId: string;
  title: string;
  description: string;
  score: number;
  reasoning: string;
  metadata: Record<string, any>;
}
```

## Интеграция с основным агентом

### Модификация src/index.ts
```typescript
import { ComponentManager } from './kag/components/core/ComponentManager';
import { LearningPathBuilder } from './kag/components/education/LearningPathBuilder';
import { PersonalizedRecommender } from './kag/components/education/PersonalizedRecommender';

// В функции main()
async function main() {
  try {
    // Инициализация KAG
    const kagClient = new KAGClientImpl();
    await kagClient.init();
    
    // Инициализация менеджера компонентов
    const componentManager = new ComponentManager(kagClient);
    await componentManager.initialize();
    
    // Регистрация компонентов
    await componentManager.registerComponent('learningPathBuilder', new LearningPathBuilder(kagClient, {
      name: 'LearningPathBuilder',
      version: '1.0.0',
      enabled: true,
      settings: {
        maxPathLength: 10,
        defaultDifficulty: 'balanced'
      }
    }));
    
    await componentManager.registerComponent('personalizedRecommender', new PersonalizedRecommender(kagClient, {
      name: 'PersonalizedRecommender',
      version: '1.0.0',
      enabled: true,
      settings: {
        defaultLimit: 5,
        confidenceThreshold: 0.7
      }
    }));
    
    // Остальная инициализация...
    await initializeBrowser();
    await loginToGetcourse();
    
    // Основной workflow с использованием компонентов
    await runEnhancedWorkflow(componentManager);
    
  } catch (error) {
    console.error('❌ Error in main workflow:', error);
  } finally {
    await componentManager.cleanup();
    await kagClient.close();
  }
}

async function runEnhancedWorkflow(componentManager: ComponentManager) {
  try {
    // Пример использования компонентов
    const learningPathBuilder = componentManager.getComponent('learningPathBuilder');
    const recommender = componentManager.getComponent('personalizedRecommender');
    
    // Построение образовательного пути для студента
    const pathResult = await learningPathBuilder.execute({
      studentId: 'student_001',
      targetConcepts: ['GitHub Actions', 'CI/CD'],
      currentKnowledge: ['Git'],
      timeConstraints: 120 // 2 часа
    });
    
    if (pathResult.success) {
      console.log('✅ Learning path built:', pathResult.data.learningPath.title);
    }
    
    // Генерация персонализированных рекомендаций
    const recResult = await recommender.execute({
      studentId: 'student_001',
      context: 'learning',
      limit: 3
    });
    
    if (recResult.success) {
      console.log('✅ Recommendations generated:', recResult.data.recommendations.length);
    }
    
    // Основной workflow проверки домашних заданий
    await checkHomeworkWorkflow();
    
  } catch (error) {
    console.error('❌ Error in enhanced workflow:', error);
  }
}
```

## Следующие шаги

1. **Создать реализацию компонентов**: LearningPathBuilder, PersonalizedRecommender
2. **Разработать дополнительные компоненты**: AdaptiveAssessment, SkillGapAnalyzer
3. **Создать менеджер компонентов**: ComponentManager для управления жизненным циклом
4. **Интегрировать с основным workflow**: Модифицировать src/index.ts
5. **Тестирование**: Проверить работу всех компонентов
6. **Оптимизация**: Улучшить производительность и масштабируемость

## Преимущества KNext компонентов

1. **Модульность**: Независимые компоненты для разных задач
2. **Переиспользование**: Компоненты можно использовать в разных сценариях
3. **Расширяемость**: Легко добавлять новые компоненты
4. **Конфигурируемость**: Гибкая настройка каждого компонента
5. **Мониторинг**: Встроенные метрики и логирование
6. **Интеграция**: Полная интеграция с KAG и основным агентом