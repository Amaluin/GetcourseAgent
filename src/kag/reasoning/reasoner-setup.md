# Настройка SPG-Reasoner для логических правил

## Обзор

Данный документ описывает настройку SPG-Reasoner компонента OpenSPG для реализации логических правил в образовательной доменной области GetcourseAgent. Мы создадим правила вывода для персонализированного обучения, рекомендаций и проверки готовности студентов.

## Архитектура SPG-Reasoner

### Компоненты системы вывода
```
src/kag/
├── reasoning/
│   ├── reasoner-setup.md              # Этот документ
│   ├── kgdsl-rules.md                 # Правила в KGDSL формате
│   ├── inference-engine.md             # Движок вывода
│   └── rule-management.md             # Управление правилами
├── rules/
│   ├── core/
│   │   ├── student-readiness.kgdsl    # Правило готовности студента
│   │   ├── assignment-difficulty.kgdsl # Правило сложности задания
│   │   ├── concept-prerequisites.kgdsl # Правило предварительных условий
│   │   └── learning-path.kgdsl        # Правило образовательного пути
│   ├── recommendations/
│   │   ├── content-recommendation.kgdsl # Рекомендация контента
│   │   ├── peer-learning.kgdsl       # Обучение со сверстниками
│   │   └── remediation.kgdsl         # Правило коррекции знаний
│   ├── assessment/
│   │   ├── mastery-evaluation.kgdsl  # Оценка освоения
│   │   ├── skill-gap.kgdsl           # Определение пробелов
│   │   └── progression.kgdsl         # Прогресс обучения
│   └── adaptive/
│       ├── difficulty-adjustment.kgdsl # Адаптация сложности
│       ├── pacing.kgdsl              # Темп обучения
│       └── personalization.kgdsl     # Персонализация
├── inference/
│   ├── ReasoningEngine.ts             # Движок вывода
│   ├── RuleExecutor.ts               # Исполнитель правил
│   ├── InferenceResult.ts            # Результаты вывода
│   └── ConfidenceCalculator.ts       # Расчет уверенности
└── prompts/
    ├── rule-generation.md            # Генерация правил
    ├── inference-optimization.md      # Оптимизация вывода
    └── confidence-estimation.md      # Оценка уверенности
```

## Основные правила вывода в KGDSL

### 1. Правило готовности студента (StudentReadiness)

#### student-readiness.kgdsl
```kgdsl
# Правило проверки готовности студента к изучению концепции
RULE StudentReadiness {
  DESCRIPTION "Check if student is ready to learn a concept based on prerequisites and progress"
  
  # Условие: студент существует
  WHEN (
    student:Student {id = $student_id}
  )
  
  # Условие: концепция существует
  AND (
    concept:Concept {id = $concept_id}
  )
  
  # Условие: студент освоил все предварительные концепции
  AND (
    NOT EXISTS (
      concept:Concept {id = $concept_id} -[REQUIRES]-> prerequisite:Concept
      AND NOT EXISTS (
        student:Student {id = $student_id} -[SUBMITS]-> submission:Submission
        AND submission.status = 'accepted'
        AND submission -[EVALUATES]-> prerequisite:Concept
        AND submission.mastery_level >= 0.7
      )
    )
  )
  
  # Условие: уровень студента соответствует сложности концепции
  AND (
    (student.level = 'beginner' AND concept.difficulty IN ['beginner'])
    OR (student.level = 'intermediate' AND concept.difficulty IN ['beginner', 'intermediate'])
    OR (student.level = 'advanced' AND concept.difficulty IN ['beginner', 'intermediate', 'advanced'])
  )
  
  # Вывод: студент готов изучать концепцию
  INFER (
    student:Student {id = $student_id} -[READY_TO_LEARN]-> concept:Concept {id = $concept_id}
    AND concept:Concept {id = $concept_id} -[SUITABLE_FOR]-> student:Student {id = $student_id}
  )
  
  CONFIDENCE 0.85
  
  # Метаданные правила
  METADATA {
    category: "readiness",
    priority: 1,
    auto_apply: true,
    refresh_on: ["student.progress", "concept.prerequisites", "submission.status"]
  }
}
```

### 2. Правило сложности задания (AssignmentDifficulty)

#### assignment-difficulty.kgdsl
```kgdsl
# Правило подбора оптимальной сложности задания для студента
RULE AssignmentDifficulty {
  DESCRIPTION "Match assignment difficulty with student level and previous performance"
  
  # Условие: студент и задание
  WHEN (
    student:Student {id = $student_id}
    AND assignment:Assignment {id = $assignment_id}
  )
  
  # Условие: студент имеет достаточный прогресс
  AND (
    student.progress >= 0.3
  )
  
  # Условие: проверка уровня студента относительно сложности задания
  AND (
    (student.level = 'beginner' AND assignment.difficulty = 'beginner')
    OR (student.level = 'intermediate' AND assignment.difficulty IN ['beginner', 'intermediate'])
    OR (student.level = 'advanced' AND assignment.difficulty IN ['beginner', 'intermediate', 'advanced'])
  )
  
  # Условие: студент успешно выполнил похожие задания
  AND (
    NOT EXISTS (
      assignment:Assignment {id = $assignment_id} -[SIMILAR_TO]-> similar_assignment:Assignment
      AND student:Student {id = $student_id} -[SUBMITS]-> submission:Submission
      AND submission.assignment_id = similar_assignment.id
      AND submission.status = 'rejected'
      AND COUNT(submission) >= 2
    )
  )
  
  # Вывод: задание подходит студенту
  INFER (
    student:Student {id = $student_id} -[SUITABLE_FOR]-> assignment:Assignment {id = $assignment_id}
    AND assignment:Assignment {id = $assignment_id} -[RECOMMENDED_FOR]-> student:Student {id = $student_id}
  )
  
  CONFIDENCE 0.8
  
  METADATA {
    category: "recommendation",
    priority: 2,
    auto_apply: true,
    refresh_on: ["student.level", "student.progress", "submission.status"]
  }
}
```

### 3. Правило образовательного пути (LearningPath)

#### learning-path.kgdsl
```kgdsl
# Правило построения оптимального образовательного пути
RULE LearningPath {
  DESCRIPTION "Generate optimal learning path based on student goals and current knowledge"
  
  # Условие: студент с целями обучения
  WHEN (
    student:Student {id = $student_id}
    AND student.learning_goals IS NOT NULL
  )
  
  # Условие: целевая концепция
  AND (
    target_concept:Concept {id = $target_concept_id}
    AND target_concept.id IN student.learning_goals
  )
  
  # Условие: поиск промежуточных концепций
  AND (
    intermediate_concept:Concept
    AND target_concept:Concept {id = $target_concept_id} -[REQUIRES*]-> intermediate_concept:Concept
    AND NOT EXISTS (
      student:Student {id = $student_id} -[SUBMITS]-> submission:Submission
      AND submission.status = 'accepted'
      AND submission -[EVALUATES]-> intermediate_concept:Concept
      AND submission.mastery_level >= 0.7
    )
  )
  
  # Условие: студент готов изучить промежуточную концепцию
  AND (
    student:Student {id = $student_id} -[READY_TO_LEARN]-> intermediate_concept:Concept
  )
  
  # Вывод: концепция является следующей в образовательном пути
  INFER (
    student:Student {id = $student_id} -[NEXT_IN_PATH]-> intermediate_concept:Concept
    AND intermediate_concept:Concept -[STEP_TO]-> target_concept:Concept {id = $target_concept_id}
    AND intermediate_concept:Concept -[ORDERED_PATH]-> student:Student {id = $student_id}
  )
  
  CONFIDENCE 0.75
  
  METADATA {
    category: "learning_path",
    priority: 1,
    auto_apply: true,
    refresh_on: ["student.learning_goals", "submission.status", "concept.prerequisites"]
  }
}
```

## Продвинутые правила вывода

### 4. Правило оценки освоения (MasteryEvaluation)

#### mastery-evaluation.kgdsl
```kgdsl
# Правило оценки уровня освоения концепций студентом
RULE MasteryEvaluation {
  DESCRIPTION "Evaluate student mastery level of concepts based on submission performance"
  
  # Условие: студент с работами
  WHEN (
    student:Student {id = $student_id}
    AND student:Student {id = $student_id} -[SUBMITS]-> submission:Submission
    AND submission.status = 'accepted'
  )
  
  # Условие: работа оценивает концепцию
  AND (
    submission:Submission -[EVALUATES]-> concept:Concept
    AND submission.mastery_level IS NOT NULL
  )
  
  # Условие: агрегация оценок по концепции
  AND (
    recent_submissions = AGGREGATE(
      SELECT submission:Submission
      WHERE submission:Submission -[EVALUATES]-> concept:Concept
      AND submission.student_id = $student_id
      AND submission.status = 'accepted'
      AND submission.submitted_at >= NOW() - INTERVAL '30 days'
      ORDER BY submission.submitted_at DESC
      LIMIT 5
    )
  )
  
  # Условие: расчет среднего уровня освоения
  AND (
    avg_mastery = AVG(recent_submissions.mastery_level)
    AND avg_mastery >= 0.7
  )
  
  # Вывод: студент освоил концепцию
  INFER (
    student:Student {id = $student_id} -[MASTERED]-> concept:Concept
    AND concept:Concept -[MASTERED_BY]-> student:Student {id = $student_id}
    AND student:Student {id = $student_id} -[MASTERY_LEVEL]-> concept:Concept {
      level: avg_mastery,
      evaluated_at: NOW(),
      submission_count: COUNT(recent_submissions)
    }
  )
  
  CONFIDENCE 0.9
  
  METADATA {
    category: "assessment",
    priority: 1,
    auto_apply: true,
    refresh_on: ["submission.status", "submission.mastery_level"]
  }
}
```

### 5. Правило адаптивной сложности (AdaptiveDifficulty)

#### adaptive-difficulty.kgdsl
```kgdsl
# Правило адаптации сложности контента на основе производительности
RULE AdaptiveDifficulty {
  DESCRIPTION "Adjust content difficulty based on student performance and engagement"
  
  # Условие: студент с историей выполнения заданий
  WHEN (
    student:Student {id = $student_id}
    AND recent_submissions = AGGREGATE(
      SELECT submission:Submission
      WHERE submission.student_id = $student_id
      AND submission.submitted_at >= NOW() - INTERVAL '14 days'
      ORDER BY submission.submitted_at DESC
      LIMIT 10
    )
  )
  
  # Условие: анализ успешности
  AND (
    success_rate = COUNT(
      FILTER recent_submissions WHERE recent_submissions.status = 'accepted'
    ) / COUNT(recent_submissions)
  )
  
  # Условие: анализ среднего времени выполнения
  AND (
    avg_time = AVG(recent_submissions.time_spent)
  )
  
  # Условие: студент слишком успешен (нужна большая сложность)
  AND (
    success_rate >= 0.9
    AND avg_time <= AVG_EXPECTED_TIME * 0.8
  )
  
  # Вывод: рекомендовать более сложный контент
  INFER (
    student:Student {id = $student_id} -[SHOULD_ADVANCE]-> level:DifficultyLevel {
      current_level: student.level,
      recommended_level: CASE 
        WHEN student.level = 'beginner' THEN 'intermediate'
        WHEN student.level = 'intermediate' THEN 'advanced'
        ELSE 'advanced'
      END,
      reason: 'High performance and quick completion time',
      confidence: 0.8
    }
  )
  
  CONFIDENCE 0.8
  
  METADATA {
    category: "adaptive",
    priority: 2,
    auto_apply: true,
    refresh_on: ["submission.status", "submission.time_spent"]
  }
}
```

### 6. Правило коллаборативного обучения (PeerLearning)

#### peer-learning.kgdsl
```kgdsl
# Правило рекомендации коллаборативного обучения
RULE PeerLearning {
  DESCRIPTION "Recommend peer learning opportunities based on complementary skills"
  
  # Условие: студент ищет помощь
  WHEN (
    student:Student {id = $student_id}
    AND student:Student {id = $student_id} -[STRUGGLING_WITH]-> concept:Concept
  )
  
  # Условие: поиск студентов с сильными знаниями в этой концепции
  AND (
    peer:Student
    AND peer:Student -[MASTERED]-> concept:Concept
    AND peer.id != $student_id
    AND peer.level >= student.level
  )
  
  # Условие: проверка совместимости
  AND (
    NOT EXISTS (
      student:Student {id = $student_id} -[COLLABORATED_WITH]-> peer:Student
      AND collaboration.collaboration_date >= NOW() - INTERVAL '7 days'
    )
  )
  
  # Условие: расчет совместимости
  AND (
    compatibility_score = CALCULATE_COMPATIBILITY($student_id, peer.id)
    AND compatibility_score >= 0.7
  )
  
  # Вывод: рекомендовать коллаборацию
  INFER (
    student:Student {id = $student_id} -[CAN_LEARN_FROM]-> peer:Student
    AND peer:Student -[CAN_TEACH]-> student:Student {id = $student_id}
    AND student:Student {id = $student_id} -[PEER_RECOMMENDATION]-> peer:Student {
      concept: concept.id,
      compatibility_score: compatibility_score,
      recommended_at: NOW()
    }
  )
  
  CONFIDENCE 0.75
  
  METADATA {
    category: "collaborative",
    priority: 3,
    auto_apply: true,
    refresh_on: ["submission.status", "collaboration.collaboration_date"]
  }
}
```

## Движок вывода

### ReasoningEngine.ts
```typescript
import { KAGClientImpl } from '../client/KAGClient';
import { RuleExecutor } from './RuleExecutor';
import { InferenceResult } from './InferenceResult';
import { ConfidenceCalculator } from './ConfidenceCalculator';

export interface ReasoningConfig {
  enabled: boolean;
  rules: string[];
  confidence: number;
  batchSize: number;
  refreshInterval: number;
  autoApply: boolean;
}

export class ReasoningEngine {
  private kagClient: KAGClientImpl;
  private ruleExecutor: RuleExecutor;
  private confidenceCalculator: ConfidenceCalculator;
  private config: ReasoningConfig;
  private isRunning: boolean = false;

  constructor(kagClient: KAGClientImpl, config: ReasoningConfig) {
    this.kagClient = kagClient;
    this.config = config;
    this.ruleExecutor = new RuleExecutor(kagClient);
    this.confidenceCalculator = new ConfidenceCalculator();
  }

  async initialize(): Promise<void> {
    try {
      console.log('🔧 Initializing Reasoning Engine...');
      
      // Загрузка правил вывода
      await this.loadRules();
      
      // Проверка конфигурации
      this.validateConfig();
      
      console.log('✅ Reasoning Engine initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Reasoning Engine:', error);
      throw error;
    }
  }

  async startInference(): Promise<void> {
    if (!this.config.enabled) {
      console.log('⚠️ Reasoning is disabled in config');
      return;
    }

    if (this.isRunning) {
      console.log('⚠️ Reasoning Engine is already running');
      return;
    }

    try {
      this.isRunning = true;
      console.log('🚀 Starting inference process...');

      // Периодический запуск вывода
      while (this.isRunning) {
        await this.runInferenceCycle();
        await this.sleep(this.config.refreshInterval);
      }
    } catch (error) {
      console.error('❌ Error in inference process:', error);
      throw error;
    }
  }

  async stopInference(): Promise<void> {
    this.isRunning = false;
    console.log('🛑 Reasoning Engine stopped');
  }

  async runInferenceCycle(): Promise<InferenceResult[]> {
    try {
      console.log('🔄 Running inference cycle...');
      
      const results: InferenceResult[] = [];
      
      // Выполнение правил вывода
      for (const ruleName of this.config.rules) {
        const ruleResults = await this.executeRule(ruleName);
        results.push(...ruleResults);
      }
      
      // Применение результатов
      if (this.config.autoApply) {
        await this.applyInferenceResults(results);
      }
      
      console.log(`✅ Inference cycle completed: ${results.length} results`);
      return results;
    } catch (error) {
      console.error('❌ Error in inference cycle:', error);
      return [];
    }
  }

  async executeRule(ruleName: string): Promise<InferenceResult[]> {
    try {
      console.log(`🔍 Executing rule: ${ruleName}`);
      
      // Выполнение правила
      const rawResults = await this.ruleExecutor.execute(ruleName);
      
      // Расчет уверенности
      const resultsWithConfidence = await this.confidenceCalculator.calculate(rawResults);
      
      // Фильтрация по порогу уверенности
      const filteredResults = resultsWithConfidence.filter(
        result => result.confidence >= this.config.confidence
      );
      
      console.log(`✅ Rule ${ruleName} executed: ${filteredResults.length} results`);
      return filteredResults;
    } catch (error) {
      console.error(`❌ Error executing rule ${ruleName}:`, error);
      return [];
    }
  }

  async applyInferenceResults(results: InferenceResult[]): Promise<void> {
    try {
      console.log(`🔄 Applying ${results.length} inference results...`);
      
      for (const result of results) {
        await this.applyInferenceResult(result);
      }
      
      console.log('✅ Inference results applied successfully');
    } catch (error) {
      console.error('❌ Error applying inference results:', error);
      throw error;
    }
  }

  private async applyInferenceResult(result: InferenceResult): Promise<void> {
    try {
      switch (result.type) {
        case 'RELATION':
          await this.applyRelation(result);
          break;
        case 'ENTITY_UPDATE':
          await this.applyEntityUpdate(result);
          break;
        case 'RECOMMENDATION':
          await this.applyRecommendation(result);
          break;
        default:
          console.warn(`⚠️ Unknown inference result type: ${result.type}`);
      }
    } catch (error) {
      console.error(`❌ Error applying inference result:`, error);
    }
  }

  private async applyRelation(result: InferenceResult): Promise<void> {
    const { fromType, fromId, relationType, toType, toId, properties } = result.data;
    
    await this.kagClient.addRelation(relationType, {
      from_id: fromId,
      to_id: toId,
      ...properties
    });
  }

  private async applyEntityUpdate(result: InferenceResult): Promise<void> {
    const { entityType, entityId, updates } = result.data;
    
    await this.kagClient.updateEntity(entityType, entityId, updates);
  }

  private async applyRecommendation(result: InferenceResult): Promise<void> {
    const { studentId, recommendationType, entityId, metadata } = result.data;
    
    // Сохранение рекомендации в специальной таблице
    await this.saveRecommendation(studentId, recommendationType, entityId, metadata);
  }

  private async saveRecommendation(
    studentId: string, 
    type: string, 
    entityId: string, 
    metadata: any
  ): Promise<void> {
    // Реализация сохранения рекомендаций
    console.log(`💾 Saving recommendation: ${studentId} -> ${type} -> ${entityId}`);
  }

  private async loadRules(): Promise<void> {
    // Загрузка правил из файлов или базы данных
    console.log(`📚 Loading ${this.config.rules.length} rules...`);
  }

  private validateConfig(): void {
    if (!this.config.enabled) return;
    
    if (!this.config.rules || this.config.rules.length === 0) {
      throw new Error('No rules specified in reasoning config');
    }
    
    if (this.config.confidence < 0 || this.config.confidence > 1) {
      throw new Error('Confidence threshold must be between 0 and 1');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### RuleExecutor.ts
```typescript
import { KAGClientImpl } from '../client/KAGClient';
import { InferenceResult } from './InferenceResult';

export interface RuleExecutionResult {
  ruleName: string;
  results: any[];
  executionTime: number;
  success: boolean;
  error?: string;
}

export class RuleExecutor {
  private kagClient: KAGClientImpl;

  constructor(kagClient: KAGClientImpl) {
    this.kagClient = kagClient;
  }

  async execute(ruleName: string): Promise<InferenceResult[]> {
    const startTime = Date.now();
    
    try {
      console.log(`⚡ Executing rule: ${ruleName}`);
      
      // Выполнение правила через KAG Client
      const rawResults = await this.kagClient.infer([ruleName]);
      
      // Преобразование результатов в InferenceResult
      const inferenceResults = this.convertToInferenceResults(ruleName, rawResults);
      
      const executionTime = Date.now() - startTime;
      console.log(`✅ Rule ${ruleName} executed in ${executionTime}ms`);
      
      return inferenceResults;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ Rule ${ruleName} failed after ${executionTime}ms:`, error);
      throw error;
    }
  }

  private convertToInferenceResults(ruleName: string, rawResults: any[]): InferenceResult[] {
    return rawResults.map((result, index) => ({
      id: `${ruleName}_${index}_${Date.now()}`,
      ruleName,
      type: this.inferResultType(result),
      confidence: result.confidence || 0.5,
      data: this.extractResultData(result),
      metadata: {
        executedAt: new Date(),
        ruleName,
        resultIndex: index
      }
    }));
  }

  private inferResultType(result: any): 'RELATION' | 'ENTITY_UPDATE' | 'RECOMMENDATION' {
    if (result.relation) return 'RELATION';
    if (result.entityUpdate) return 'ENTITY_UPDATE';
    if (result.recommendation) return 'RECOMMENDATION';
    return 'RELATION'; // По умолчанию
  }

  private extractResultData(result: any): any {
    return {
      fromType: result.fromType,
      fromId: result.fromId,
      relationType: result.relationType,
      toType: result.toType,
      toId: result.toId,
      properties: result.properties,
      entityType: result.entityType,
      entityId: result.entityId,
      updates: result.updates,
      studentId: result.studentId,
      recommendationType: result.recommendationType,
      entityId: result.entityId,
      metadata: result.metadata
    };
  }
}
```

### InferenceResult.ts
```typescript
export interface InferenceResult {
  id: string;
  ruleName: string;
  type: 'RELATION' | 'ENTITY_UPDATE' | 'RECOMMENDATION';
  confidence: number;
  data: any;
  metadata: {
    executedAt: Date;
    ruleName: string;
    resultIndex: number;
  };
}

export interface InferenceResultFilter {
  ruleName?: string;
  type?: string;
  minConfidence?: number;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface InferenceResultSummary {
  totalResults: number;
  resultsByType: Record<string, number>;
  resultsByRule: Record<string, number>;
  averageConfidence: number;
  executionTime: number;
}
```

### ConfidenceCalculator.ts
```typescript
import { InferenceResult } from './InferenceResult';

export class ConfidenceCalculator {
  async calculate(results: InferenceResult[]): Promise<InferenceResult[]> {
    return results.map(result => ({
      ...result,
      confidence: this.calculateConfidence(result)
    }));
  }

  private calculateConfidence(result: InferenceResult): number {
    let baseConfidence = result.confidence || 0.5;
    
    // Корректировка на основе типа правила
    const ruleTypeMultiplier = this.getRuleTypeMultiplier(result.ruleName);
    baseConfidence *= ruleTypeMultiplier;
    
    // Корректировка на основе количества данных
    const dataQualityMultiplier = this.getDataQualityMultiplier(result.data);
    baseConfidence *= dataQualityMultiplier;
    
    // Корректировка на основе времени выполнения
    const timeMultiplier = this.getTimeMultiplier(result.metadata.executedAt);
    baseConfidence *= timeMultiplier;
    
    // Ограничение диапазона
    return Math.max(0.1, Math.min(1.0, baseConfidence));
  }

  private getRuleTypeMultiplier(ruleName: string): number {
    // Разные типы правил имеют разную базовую надежность
    if (ruleName.includes('Readiness')) return 0.9;
    if (ruleName.includes('Mastery')) return 0.95;
    if (ruleName.includes('Recommendation')) return 0.7;
    if (ruleName.includes('Adaptive')) return 0.8;
    return 0.8;
  }

  private getDataQualityMultiplier(data: any): number {
    // Оценка качества данных
    if (!data) return 0.5;
    
    let score = 1.0;
    
    // Проверка наличия обязательных полей
    if (!data.fromId || !data.toId) score -= 0.2;
    if (!data.relationType && !data.entityType) score -= 0.2;
    
    // Проверка полноты данных
    const requiredFields = ['fromId', 'toId', 'relationType'];
    const presentFields = requiredFields.filter(field => data[field]);
    score *= (presentFields.length / requiredFields.length);
    
    return Math.max(0.3, score);
  }

  private getTimeMultiplier(executedAt: Date): number {
    // Более свежие результаты имеют больший вес
    const now = new Date();
    const ageInHours = (now.getTime() - executedAt.getTime()) / (1000 * 60 * 60);
    
    if (ageInHours < 1) return 1.0;
    if (ageInHours < 24) return 0.9;
    if (ageInHours < 168) return 0.8; // 1 неделя
    return 0.7;
  }
}
```

## Интеграция с основным агентом

### Модификация src/index.ts
```typescript
import { ReasoningEngine } from './kag/inference/ReasoningEngine';
import { KAGClientImpl } from './kag/client/KAGClient';

// В функции main()
async function main() {
  try {
    // Инициализация KAG
    const kagClient = new KAGClientImpl();
    await kagClient.init();
    
    // Инициализация движка вывода
    const reasoningConfig = {
      enabled: true,
      rules: ['StudentReadiness', 'AssignmentDifficulty', 'LearningPath', 'MasteryEvaluation'],
      confidence: 0.8,
      batchSize: 10,
      refreshInterval: 60000, // 1 минута
      autoApply: true
    };
    
    const reasoningEngine = new ReasoningEngine(kagClient, reasoningConfig);
    await reasoningEngine.initialize();
    
    // Запуск движка вывода в фоновом режиме
    reasoningEngine.startInference().catch(console.error);
    
    // Остальная инициализация...
    await initializeBrowser();
    await loginToGetcourse();
    
    // Основной workflow
    await checkHomeworkWorkflow();
    
  } catch (error) {
    console.error('❌ Error in main workflow:', error);
  } finally {
    // Остановка движка вывода
    await reasoningEngine.stopInference();
    await kagClient.close();
  }
}
```

## Тестирование правил вывода

### test-reasoning-rules.ts
```typescript
import { ReasoningEngine } from '../inference/ReasoningEngine';
import { KAGClientImpl } from '../client/KAGClient';

async function testReasoningRules() {
  console.log('🧪 Testing Reasoning Rules...');
  
  const kagClient = new KAGClientImpl();
  await kagClient.init();
  
  const reasoningConfig = {
    enabled: true,
    rules: ['StudentReadiness', 'AssignmentDifficulty', 'LearningPath'],
    confidence: 0.7,
    batchSize: 5,
    refreshInterval: 5000,
    autoApply: false
  };
  
  const reasoningEngine = new ReasoningEngine(kagClient, reasoningConfig);
  await reasoningEngine.initialize();
  
  try {
    // Тест правила готовности студента
    console.log('🔍 Testing StudentReadiness rule...');
    const readinessResults = await reasoningEngine.executeRule('StudentReadiness');
    console.log(`✅ StudentReadiness: ${readinessResults.length} results`);
    
    // Тест правила сложности задания
    console.log('🔍 Testing AssignmentDifficulty rule...');
    const difficultyResults = await reasoningEngine.executeRule('AssignmentDifficulty');
    console.log(`✅ AssignmentDifficulty: ${difficultyResults.length} results`);
    
    // Тест правила образовательного пути
    console.log('🔍 Testing LearningPath rule...');
    const pathResults = await reasoningEngine.executeRule('LearningPath');
    console.log(`✅ LearningPath: ${pathResults.length} results`);
    
    console.log('🎉 All reasoning rules tested successfully!');
    
  } catch (error) {
    console.error('❌ Error testing reasoning rules:', error);
  } finally {
    await reasoningEngine.stopInference();
    await kagClient.close();
  }
}

testReasoningRules();
```

## Следующие шаги

1. **Создать реализацию движка вывода**: ReasoningEngine, RuleExecutor, ConfidenceCalculator
2. **Разработать дополнительные правила**: Коллаборативное обучение, адаптивная сложность
3. **Интегрировать с основным workflow**: Модифицировать src/index.ts
4. **Тестирование**: Проверить работу всех правил вывода
5. **Оптимизация**: Улучшить производительность и точность вывода
6. **Мониторинг**: Настроить мониторинг работы движка вывода

## Преимущества данной настройки

1. **Интеллектуальность**: Продвинутые правила вывода для персонализации
2. **Адаптивность**: Автоматическая адаптация под уровень студента
3. **Коллаборация**: Рекомендации для совместного обучения
4. **Точность**: Расчет уверенности для каждого вывода
5. **Масштабируемость**: Эффективная обработка больших объемов данных
6. **Гибкость**: Легко добавлять новые правила вывода