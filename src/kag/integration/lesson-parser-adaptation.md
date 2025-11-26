# Адаптация парсера уроков для SPG-Builder

## Обзор

Данный документ описывает адаптацию существующего парсера уроков для работы с SPG-Builder компонентом OpenSPG. Мы модифицируем `src/lesson-parser.ts` для автоматического извлечения концепций, ресурсов и связей из уроков и добавления их в граф знаний.

## Анализ существующего парсера

### Текущая структура src/lesson-parser.ts
```typescript
// Существующий код (упрощенно)
export interface ParsedLesson {
  title: string;
  content: string;
  sections: LessonSection[];
  assignments: Assignment[];
  resources: Resource[];
}

export class LessonParser {
  async parseLesson(lessonUrl: string): Promise<ParsedLesson> {
    // Парсинг урока из Getcourse
    // Извлечение контента, секций, заданий
    // Возврат структурированных данных
  }
}
```

## Адаптированная архитектура

### Компоненты для работы с SPG-Builder
```
src/kag/
├── integration/
│   ├── lesson-parser-adaptation.md    # Этот документ
│   └── spg-builder-integration.md     # Интеграция с SPG-Builder
├── parser/
│   ├── SPGLessonParser.ts            # Адаптированный парсер уроков
│   ├── ConceptExtractor.ts           # Извлечение концепций
│   ├── ResourceExtractor.ts          # Извлечение ресурсов
│   ├── RelationExtractor.ts          # Извлечение отношений
│   └── KnowledgeBuilder.ts           # Построитель знаний
├── nlp/
│   ├── TextProcessor.ts              # Обработка текста
│   ├── ConceptRecognizer.ts          # Распознавание концепций
│   ├── EntityExtractor.ts            # Извлечение сущностей
│   └── RelationDetector.ts           # Обнаружение отношений
└── prompts/
    ├── concept-extraction.md         # Промпты для извлечения концепций
    ├── resource-detection.md         # Промпты для обнаружения ресурсов
    └── relation-extraction.md        # Промпты для извлечения отношений
```

## Адаптированный парсер уроков

### SPGLessonParser.ts
```typescript
import { LessonParser, ParsedLesson } from '../../lesson-parser';
import { EducationKAGAdapterImpl } from '../client/EducationKAGAdapter';
import { ConceptExtractor } from './ConceptExtractor';
import { ResourceExtractor } from './ResourceExtractor';
import { RelationExtractor } from './RelationExtractor';
import { 
  Lesson, 
  LessonInput, 
  Concept, 
  ConceptInput, 
  Resource, 
  ResourceInput 
} from '../types/education-entities';

export interface SPGParsedLesson extends ParsedLesson {
  concepts: Concept[];
  relations: ConceptRelation[];
  knowledgeGraph: KnowledgeGraphData;
}

export interface ConceptRelation {
  fromConcept: string;
  toConcept: string;
  relationType: 'REQUIRES' | 'RELATED_TO' | 'PART_OF' | 'EXAMPLE_OF';
  strength: number;
  description?: string;
}

export interface KnowledgeGraphData {
  concepts: Concept[];
  resources: Resource[];
  relations: ConceptRelation[];
  lessonConcepts: LessonConceptRelation[];
  lessonResources: LessonResourceRelation[];
}

export interface LessonConceptRelation {
  lessonId: string;
  conceptId: string;
  depth: number;
  method: 'theory' | 'practice' | 'example' | 'demonstration';
  importance: number;
}

export interface LessonResourceRelation {
  lessonId: string;
  resourceId: string;
  purpose: 'required' | 'optional' | 'reference' | 'example';
  importance: number;
}

export class SPGLessonParser extends LessonParser {
  private kagAdapter: EducationKAGAdapterImpl;
  private conceptExtractor: ConceptExtractor;
  private resourceExtractor: ResourceExtractor;
  private relationExtractor: RelationExtractor;

  constructor(kagAdapter: EducationKAGAdapterImpl) {
    super();
    this.kagAdapter = kagAdapter;
    this.conceptExtractor = new ConceptExtractor();
    this.resourceExtractor = new ResourceExtractor();
    this.relationExtractor = new RelationExtractor();
  }

  async parseLessonWithSPG(lessonUrl: string): Promise<SPGParsedLesson> {
    try {
      console.log(`🔍 Parsing lesson with SPG: ${lessonUrl}`);
      
      // 1. Базовый парсинг урока
      const baseLesson = await super.parseLesson(lessonUrl);
      
      // 2. Извлечение концепций из контента
      const concepts = await this.conceptExtractor.extractFromLesson(baseLesson);
      
      // 3. Извлечение ресурсов
      const resources = await this.resourceExtractor.extractFromLesson(baseLesson);
      
      // 4. Извлечение отношений между концепциями
      const relations = await this.relationExtractor.extractFromContent(
        baseLesson.content, 
        concepts
      );
      
      // 5. Построение графа знаний
      const knowledgeGraph = await this.buildKnowledgeGraph(
        baseLesson, 
        concepts, 
        resources, 
        relations
      );
      
      const spgParsedLesson: SPGParsedLesson = {
        ...baseLesson,
        concepts,
        relations,
        knowledgeGraph
      };
      
      console.log(`✅ Lesson parsed with SPG: ${concepts.length} concepts, ${resources.length} resources`);
      return spgParsedLesson;
    } catch (error) {
      console.error(`❌ Error parsing lesson with SPG: ${lessonUrl}`, error);
      throw error;
    }
  }

  async processAndStoreLesson(lessonUrl: string): Promise<string> {
    try {
      // Парсинг урока с извлечением знаний
      const spgLesson = await this.parseLessonWithSPG(lessonUrl);
      
      // Генерация ID урока
      const lessonId = this.generateLessonId(lessonUrl);
      
      // Добавление урока в KAG
      const lessonInput: LessonInput = {
        id: lessonId,
        title: spgLesson.title,
        content: spgLesson.content,
        summary: this.generateSummary(spgLesson),
        difficulty: this.estimateDifficulty(spgLesson),
        videoUrls: spgLesson.resources.filter(r => r.type === 'video').map(r => r.url),
        imageUrls: spgLesson.resources.filter(r => r.type === 'image').map(r => r.url),
        resources: spgLesson.resources
      };
      
      await this.kagAdapter.addLesson(lessonInput);
      
      // Добавление концепций
      for (const concept of spgLesson.concepts) {
        const conceptInput: ConceptInput = {
          id: this.generateConceptId(concept.name),
          name: concept.name,
          description: concept.description,
          category: concept.category,
          difficulty: concept.difficulty,
          prerequisites: concept.prerequisites
        };
        
        await this.kagAdapter.addConcept(conceptInput);
        
        // Добавление отношения TEACHES
        await this.kagAdapter.addRelation('TEACHES', {
          lesson_id: lessonId,
          concept_id: conceptInput.id,
          depth: this.calculateConceptDepth(spgLesson, concept),
          method: this.determineTeachingMethod(spgLesson, concept)
        });
      }
      
      // Добавление ресурсов
      for (const resource of spgLesson.resources) {
        const resourceInput: ResourceInput = {
          id: this.generateResourceId(resource.url),
          type: resource.type,
          url: resource.url,
          title: resource.title,
          description: resource.description,
          format: resource.format
        };
        
        await this.kagAdapter.addResource(resourceInput);
        
        // Добавление отношения USES
        await this.kagAdapter.addRelation('USES', {
          lesson_id: lessonId,
          resource_id: resourceInput.id,
          purpose: this.determineResourcePurpose(spgLesson, resource),
          importance: this.calculateResourceImportance(spgLesson, resource)
        });
      }
      
      // Добавление отношений между концепциями
      for (const relation of spgLesson.relations) {
        await this.kagAdapter.addRelation(relation.relationType, {
          from_id: this.generateConceptId(relation.fromConcept),
          to_id: this.generateConceptId(relation.toConcept),
          strength: relation.strength,
          description: relation.description
        });
      }
      
      // Добавление заданий
      for (const assignment of spgLesson.assignments) {
        const assignmentInput = {
          id: this.generateAssignmentId(assignment.title, lessonId),
          lesson_id: lessonId,
          title: assignment.title,
          description: assignment.description,
          requirements: assignment.requirements,
          ideal_answer: assignment.idealAnswer
        };
        
        await this.kagAdapter.addAssignment(assignmentInput);
      }
      
      console.log(`✅ Lesson processed and stored: ${lessonId}`);
      return lessonId;
    } catch (error) {
      console.error(`❌ Error processing and storing lesson: ${lessonUrl}`, error);
      throw error;
    }
  }

  private async buildKnowledgeGraph(
    lesson: ParsedLesson,
    concepts: Concept[],
    resources: Resource[],
    relations: ConceptRelation[]
  ): Promise<KnowledgeGraphData> {
    const lessonId = this.generateLessonId(lesson.title);
    
    // Определение связей урок-концепция
    const lessonConcepts: LessonConceptRelation[] = concepts.map(concept => ({
      lessonId,
      conceptId: this.generateConceptId(concept.name),
      depth: this.calculateConceptDepth(lesson, concept),
      method: this.determineTeachingMethod(lesson, concept),
      importance: this.calculateConceptImportance(lesson, concept)
    }));
    
    // Определение связей урок-ресурс
    const lessonResources: LessonResourceRelation[] = resources.map(resource => ({
      lessonId,
      resourceId: this.generateResourceId(resource.url),
      purpose: this.determineResourcePurpose(lesson, resource),
      importance: this.calculateResourceImportance(lesson, resource)
    }));
    
    return {
      concepts,
      resources,
      relations,
      lessonConcepts,
      lessonResources
    };
  }

  private generateLessonId(lessonUrl: string): string {
    return `lesson_${Buffer.from(lessonUrl).toString('base64').slice(0, 16)}`;
  }

  private generateConceptId(conceptName: string): string {
    return `concept_${conceptName.toLowerCase().replace(/\s+/g, '_')}`;
  }

  private generateResourceId(resourceUrl: string): string {
    return `resource_${Buffer.from(resourceUrl).toString('base64').slice(0, 16)}`;
  }

  private generateAssignmentId(assignmentTitle: string, lessonId: string): string {
    return `${lessonId}_assignment_${assignmentTitle.toLowerCase().replace(/\s+/g, '_')}`;
  }

  private generateSummary(lesson: SPGParsedLesson): string {
    // Используем AI для генерации краткого содержания
    return `Урок "${lesson.title}" охватывает ${lesson.concepts.length} ключевых концепций: ${lesson.concepts.map(c => c.name).join(', ')}`;
  }

  private estimateDifficulty(lesson: SPGParsedLesson): 'beginner' | 'intermediate' | 'advanced' {
    // Анализ сложности на основе концепций и контента
    const avgConceptDifficulty = lesson.concepts.reduce((sum, c) => {
      const difficultyScore = c.difficulty === 'beginner' ? 1 : c.difficulty === 'intermediate' ? 2 : 3;
      return sum + difficultyScore;
    }, 0) / (lesson.concepts.length || 1);
    
    if (avgConceptDifficulty <= 1.5) return 'beginner';
    if (avgConceptDifficulty <= 2.5) return 'intermediate';
    return 'advanced';
  }

  private calculateConceptDepth(lesson: SPGParsedLesson, concept: Concept): number {
    // Анализ глубины изучения концепции в уроке
    const conceptMentions = (lesson.content.match(new RegExp(concept.name, 'gi')) || []).length;
    const conceptInSections = lesson.sections.filter(section => 
      section.content.toLowerCase().includes(concept.name.toLowerCase())
    ).length;
    
    return Math.min(5, Math.max(1, conceptMentions + conceptInSections));
  }

  private determineTeachingMethod(lesson: SPGParsedLesson, concept: Concept): 'theory' | 'practice' | 'example' | 'demonstration' {
    // Определение метода обучения концепции
    const content = lesson.content.toLowerCase();
    const conceptName = concept.name.toLowerCase();
    
    if (content.includes(`${conceptName} пример`) || content.includes(`${conceptName} example`)) {
      return 'example';
    }
    if (content.includes(`${conceptName} практика`) || content.includes(`${conceptName} practice`)) {
      return 'practice';
    }
    if (content.includes(`${conceptName} демонстрация`) || content.includes(`${conceptName} demonstration`)) {
      return 'demonstration';
    }
    
    return 'theory';
  }

  private determineResourcePurpose(lesson: SPGParsedLesson, resource: Resource): 'required' | 'optional' | 'reference' | 'example' {
    // Определение цели ресурса в уроке
    const content = lesson.content.toLowerCase();
    const resourceTitle = resource.title.toLowerCase();
    
    if (content.includes('обязательно') && content.includes(resourceTitle)) {
      return 'required';
    }
    if (content.includes('дополнительно') && content.includes(resourceTitle)) {
      return 'optional';
    }
    if (content.includes('пример') && content.includes(resourceTitle)) {
      return 'example';
    }
    
    return 'reference';
  }

  private calculateResourceImportance(lesson: SPGParsedLesson, resource: Resource): number {
    // Расчет важности ресурса
    const content = lesson.content.toLowerCase();
    const resourceTitle = resource.title.toLowerCase();
    const mentions = (content.match(new RegExp(resourceTitle, 'gi')) || []).length;
    
    return Math.min(5, Math.max(1, mentions));
  }

  private calculateConceptImportance(lesson: SPGParsedLesson, concept: Concept): number {
    // Расчет важности концепции для урока
    const content = lesson.content.toLowerCase();
    const conceptName = concept.name.toLowerCase();
    const mentions = (content.match(new RegExp(conceptName, 'gi')) || []).length;
    const titleMentions = (lesson.title.toLowerCase().match(new RegExp(conceptName, 'gi')) || []).length;
    
    return Math.min(5, Math.max(1, mentions + titleMentions * 2));
  }
}
```

## Извлечение концепций

### ConceptExtractor.ts
```typescript
import { ParsedLesson } from '../../lesson-parser';
import { Concept, ConceptInput } from '../types/education-entities';
import { TextProcessor } from '../nlp/TextProcessor';
import { ConceptRecognizer } from '../nlp/ConceptRecognizer';

export class ConceptExtractor {
  private textProcessor: TextProcessor;
  private conceptRecognizer: ConceptRecognizer;

  constructor() {
    this.textProcessor = new TextProcessor();
    this.conceptRecognizer = new ConceptRecognizer();
  }

  async extractFromLesson(lesson: ParsedLesson): Promise<Concept[]> {
    try {
      console.log(`🔍 Extracting concepts from lesson: ${lesson.title}`);
      
      // 1. Объединение всего текстового контента
      const fullText = this.combineTextContent(lesson);
      
      // 2. Предварительная обработка текста
      const processedText = await this.textProcessor.process(fullText);
      
      // 3. Извлечение концепций с помощью AI
      const rawConcepts = await this.extractConceptsWithAI(processedText);
      
      // 4. Распознавание и валидация концепций
      const validatedConcepts = await this.conceptRecognizer.recognize(rawConcepts);
      
      // 5. Обогащение концепций метаданными
      const enrichedConcepts = await this.enrichConcepts(validatedConcepts, lesson);
      
      console.log(`✅ Extracted ${enrichedConcepts.length} concepts`);
      return enrichedConcepts;
    } catch (error) {
      console.error(`❌ Error extracting concepts from lesson: ${lesson.title}`, error);
      return [];
    }
  }

  private combineTextContent(lesson: ParsedLesson): string {
    const parts = [
      lesson.title,
      lesson.content,
      ...lesson.sections.map(section => section.title + ' ' + section.content),
      ...lesson.assignments.map(assignment => assignment.title + ' ' + assignment.description),
      ...lesson.resources.map(resource => resource.title + ' ' + (resource.description || ''))
    ];
    
    return parts.join('\n');
  }

  private async extractConceptsWithAI(text: string): Promise<Partial<Concept>[]> {
    const prompt = `
Проанализируй следующий текст и извлеки ключевые концепции, которые студент должен изучить.

ТЕКСТ:
${text}

ИНСТРУКЦИИ:
1. Извлеки только важные концепции, которые являются центральными для понимания материала
2. Для каждой концепции укажи:
   - name: Название концепции (краткое и ясное)
   - description: Описание концепции (1-2 предложения)
   - category: Категория (tool, platform, technique, concept, other)
   - difficulty: Уровень сложности (beginner, intermediate, advanced)
   - prerequisites: Список prerequisite концепций (если есть)

ФОРМАТ ВЫВОДА (JSON):
{
  "concepts": [
    {
      "name": "Название концепции",
      "description": "Описание концепции",
      "category": "tool|platform|technique|concept|other",
      "difficulty": "beginner|intermediate|advanced",
      "prerequisites": ["Концепция 1", "Концепция 2"]
    }
  ]
}
`;

    try {
      const response = await this.callAI(prompt);
      const parsed = JSON.parse(response);
      return parsed.concepts || [];
    } catch (error) {
      console.error('❌ Error extracting concepts with AI:', error);
      return [];
    }
  }

  private async enrichConcepts(concepts: Partial<Concept>[], lesson: ParsedLesson): Promise<Concept[]> {
    const enrichedConcepts: Concept[] = [];
    
    for (const concept of concepts) {
      if (!concept.name || !concept.description) continue;
      
      const enrichedConcept: Concept = {
        id: this.generateConceptId(concept.name),
        name: concept.name,
        description: concept.description,
        category: concept.category || 'concept',
        difficulty: concept.difficulty || 'beginner',
        prerequisites: concept.prerequisites || [],
        created_at: new Date(),
        updated_at: new Date()
      };
      
      enrichedConcepts.push(enrichedConcept);
    }
    
    return enrichedConcepts;
  }

  private generateConceptId(conceptName: string): string {
    return `concept_${conceptName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
  }

  private async callAI(prompt: string): Promise<string> {
    // Интеграция с AI сервисом для извлечения концепций
    // Здесь можно использовать OpenAI, Claude или другой AI сервис
    
    // Временная заглушка для демонстрации
    return JSON.stringify({
      concepts: [
        {
          name: "GitHub Actions",
          description: "Платформа для автоматизации рабочих процессов CI/CD",
          category: "platform",
          difficulty: "intermediate",
          prerequisites: ["Git", "CI/CD"]
        },
        {
          name: "CI/CD",
          description: "Непрерывная интеграция и непрерывная доставка",
          category: "concept",
          difficulty: "beginner",
          prerequisites: []
        }
      ]
    });
  }
}
```

## Извлечение ресурсов

### ResourceExtractor.ts
```typescript
import { ParsedLesson } from '../../lesson-parser';
import { Resource, ResourceInput } from '../types/education-entities';

export class ResourceExtractor {
  async extractFromLesson(lesson: ParsedLesson): Promise<Resource[]> {
    try {
      console.log(`🔍 Extracting resources from lesson: ${lesson.title}`);
      
      const resources: Resource[] = [];
      
      // 1. Извлечение из существующих ресурсов
      for (const existingResource of lesson.resources) {
        const resource: Resource = {
          id: this.generateResourceId(existingResource.url),
          type: existingResource.type,
          url: existingResource.url,
          title: existingResource.title,
          description: existingResource.description,
          format: this.inferFormat(existingResource.url, existingResource.type),
          created_at: new Date(),
          updated_at: new Date()
        };
        resources.push(resource);
      }
      
      // 2. Извлечение ссылок из контента
      const contentLinks = await this.extractLinksFromContent(lesson.content);
      resources.push(...contentLinks);
      
      // 3. Извлечение ссылок из секций
      for (const section of lesson.sections) {
        const sectionLinks = await this.extractLinksFromContent(section.content);
        resources.push(...sectionLinks);
      }
      
      // 4. Дедупликация ресурсов
      const uniqueResources = this.deduplicateResources(resources);
      
      console.log(`✅ Extracted ${uniqueResources.length} resources`);
      return uniqueResources;
    } catch (error) {
      console.error(`❌ Error extracting resources from lesson: ${lesson.title}`, error);
      return [];
    }
  }

  private async extractLinksFromContent(content: string): Promise<Resource[]> {
    const resources: Resource[] = [];
    
    // Регулярные выражения для извлечения ссылок
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
    const matches = content.match(urlRegex) || [];
    
    for (const url of matches) {
      const resource: Resource = {
        id: this.generateResourceId(url),
        type: this.inferResourceType(url),
        url: url,
        title: this.extractTitleFromContext(content, url),
        description: this.extractDescriptionFromContext(content, url),
        format: this.inferFormat(url, this.inferResourceType(url)),
        created_at: new Date(),
        updated_at: new Date()
      };
      resources.push(resource);
    }
    
    return resources;
  }

  private inferResourceType(url: string): 'video' | 'document' | 'image' | 'link' | 'tool' {
    const domain = new URL(url).hostname.toLowerCase();
    
    // Видео платформы
    if (domain.includes('youtube.com') || domain.includes('youtu.be') || 
        domain.includes('vimeo.com') || domain.includes('loom.com')) {
      return 'video';
    }
    
    // Документы
    if (url.includes('.pdf') || url.includes('.doc') || url.includes('.docx') || 
        url.includes('.txt') || url.includes('.md')) {
      return 'document';
    }
    
    // Изображения
    if (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || 
        url.includes('.gif') || url.includes('.svg') || url.includes('.webp')) {
      return 'image';
    }
    
    // Инструменты
    if (domain.includes('github.com') || domain.includes('gitlab.com') || 
        domain.includes('bitbucket.org') || domain.includes('codepen.io')) {
      return 'tool';
    }
    
    return 'link';
  }

  private inferFormat(url: string, type: string): 'mp4' | 'pdf' | 'jpg' | 'png' | 'html' | 'other' {
    const extension = url.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'mp4': return 'mp4';
      case 'pdf': return 'pdf';
      case 'jpg':
      case 'jpeg': return 'jpg';
      case 'png': return 'png';
      case 'html':
      case 'htm': return 'html';
      default: return 'other';
    }
  }

  private extractTitleFromContext(content: string, url: string): string {
    // Поиск заголовка рядом со ссылкой
    const beforeUrl = content.substring(0, content.indexOf(url));
    const afterUrl = content.substring(content.indexOf(url) + url.length);
    
    // Ищем заголовок перед ссылкой
    const titleBeforeMatch = beforeUrl.match(/([^\n]*?)\s*$/);
    if (titleBeforeMatch && titleBeforeMatch[1].trim().length > 0) {
      return titleBeforeMatch[1].trim();
    }
    
    // Ищем заголовок после ссылки
    const titleAfterMatch = afterUrl.match(/^\s*([^\n]*)/);
    if (titleAfterMatch && titleAfterMatch[1].trim().length > 0) {
      return titleAfterMatch[1].trim();
    }
    
    // Используем URL как заголовок
    return url;
  }

  private extractDescriptionFromContext(content: string, url: string): string {
    // Поиск описания рядом со ссылкой
    const contextStart = Math.max(0, content.indexOf(url) - 200);
    const contextEnd = Math.min(content.length, content.indexOf(url) + url.length + 200);
    const context = content.substring(contextStart, contextEnd);
    
    // Ищем предложения, содержащие описание
    const sentences = context.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.includes(url) && sentence.length > 50) {
        return sentence.trim();
      }
    }
    
    return '';
  }

  private deduplicateResources(resources: Resource[]): Resource[] {
    const seen = new Set<string>();
    return resources.filter(resource => {
      const key = resource.url;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private generateResourceId(url: string): string {
    return `resource_${Buffer.from(url).toString('base64').slice(0, 16)}`;
  }
}
```

## Извлечение отношений

### RelationExtractor.ts
```typescript
import { Concept } from '../types/education-entities';
import { ConceptRelation } from './SPGLessonParser';
import { TextProcessor } from '../nlp/TextProcessor';
import { RelationDetector } from '../nlp/RelationDetector';

export class RelationExtractor {
  private textProcessor: TextProcessor;
  private relationDetector: RelationDetector;

  constructor() {
    this.textProcessor = new TextProcessor();
    this.relationDetector = new RelationDetector();
  }

  async extractFromContent(content: string, concepts: Concept[]): Promise<ConceptRelation[]> {
    try {
      console.log(`🔍 Extracting relations from content with ${concepts.length} concepts`);
      
      // 1. Предварительная обработка текста
      const processedText = await this.textProcessor.process(content);
      
      // 2. Извлечение отношений с помощью AI
      const rawRelations = await this.extractRelationsWithAI(processedText, concepts);
      
      // 3. Валидация и фильтрация отношений
      const validatedRelations = await this.relationDetector.validate(rawRelations, concepts);
      
      // 4. Расчет силы отношений
      const enrichedRelations = await this.calculateRelationStrength(validatedRelations, content);
      
      console.log(`✅ Extracted ${enrichedRelations.length} relations`);
      return enrichedRelations;
    } catch (error) {
      console.error('❌ Error extracting relations:', error);
      return [];
    }
  }

  private async extractRelationsWithAI(text: string, concepts: Concept[]): Promise<Partial<ConceptRelation>[]> {
    const conceptList = concepts.map(c => c.name).join(', ');
    
    const prompt = `
Проанализируй следующий текст и извлеки отношения между концепциями.

КОНЦЕПЦИИ:
${conceptList}

ТЕКСТ:
${text}

ИНСТРУКЦИИ:
1. Найди отношения между концепциями из списка
2. Для каждого отношения укажи:
   - fromConcept: Исходная концепция
   - toConcept: Целевая концепция
   - relationType: Тип отношения (REQUIRES, RELATED_TO, PART_OF, EXAMPLE_OF)
   - description: Описание отношения
   - strength: Сила отношения (0.1-1.0)

ТИПЫ ОТНОШЕНИЙ:
- REQUIRES: Концепция A требуется для понимания концепции B
- RELATED_TO: Концепции связаны по смыслу
- PART_OF: Концепция A является частью концепции B
- EXAMPLE_OF: Концепция A является примером концепции B

ФОРМАТ ВЫВОДА (JSON):
{
  "relations": [
    {
      "fromConcept": "Концепция A",
      "toConcept": "Концепция B",
      "relationType": "REQUIRES|RELATED_TO|PART_OF|EXAMPLE_OF",
      "description": "Описание отношения",
      "strength": 0.8
    }
  ]
}
`;

    try {
      const response = await this.callAI(prompt);
      const parsed = JSON.parse(response);
      return parsed.relations || [];
    } catch (error) {
      console.error('❌ Error extracting relations with AI:', error);
      return [];
    }
  }

  private async calculateRelationStrength(relations: ConceptRelation[], content: string): Promise<ConceptRelation[]> {
    const enrichedRelations = relations.map(relation => {
      // Расчет силы отношения на основе частоты упоминания в тексте
      const fromMentions = (content.match(new RegExp(relation.fromConcept, 'gi')) || []).length;
      const toMentions = (content.match(new RegExp(relation.toConcept, 'gi')) || []).length;
      
      // Поиск упоминаний обеих концепций в одном предложении
      const sentences = content.split(/[.!?]+/);
      const coOccurrences = sentences.filter(sentence => 
        sentence.toLowerCase().includes(relation.fromConcept.toLowerCase()) && 
        sentence.toLowerCase().includes(relation.toConcept.toLowerCase())
      ).length;
      
      // Расчет итоговой силы
      const baseStrength = relation.strength || 0.5;
      const coOccurrenceBonus = Math.min(0.3, coOccurrences * 0.1);
      const mentionBonus = Math.min(0.2, (fromMentions + toMentions) * 0.01);
      
      const finalStrength = Math.min(1.0, baseStrength + coOccurrenceBonus + mentionBonus);
      
      return {
        ...relation,
        strength: finalStrength
      };
    });
    
    return enrichedRelations;
  }

  private async callAI(prompt: string): Promise<string> {
    // Интеграция с AI сервисом для извлечения отношений
    // Здесь можно использовать OpenAI, Claude или другой AI сервис
    
    // Временная заглушка для демонстрации
    return JSON.stringify({
      relations: [
        {
          fromConcept: "Git",
          toConcept: "GitHub Actions",
          relationType: "REQUIRES",
          description: "Git является необходимым для использования GitHub Actions",
          strength: 0.9
        },
        {
          fromConcept: "CI/CD",
          toConcept: "GitHub Actions",
          relationType: "EXAMPLE_OF",
          description: "GitHub Actions является примером реализации CI/CD",
          strength: 0.8
        }
      ]
    });
  }
}
```

## NLP компоненты

### TextProcessor.ts
```typescript
export class TextProcessor {
  async process(text: string): Promise<string> {
    // 1. Нормализация текста
    let processed = this.normalizeText(text);
    
    // 2. Удаление лишних пробелов
    processed = this.cleanWhitespace(processed);
    
    // 3. Разделение на предложения
    processed = this.segmentSentences(processed);
    
    return processed;
  }

  private normalizeText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private cleanWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private segmentSentences(text: string): string {
    // Простая сегментация предложений
    return text.replace(/([.!?])\s*/g, '$1\n');
  }
}
```

### ConceptRecognizer.ts
```typescript
import { Concept } from '../types/education-entities';

export class ConceptRecognizer {
  async recognize(concepts: Partial<Concept>[]): Promise<Partial<Concept>[]> {
    // Фильтрация и валидация концепций
    return concepts.filter(concept => {
      if (!concept.name || concept.name.length < 2) return false;
      if (!concept.description || concept.description.length < 10) return false;
      
      // Проверка на стоп-слова
      const stopWords = ['это', 'который', 'когда', 'где', 'что', 'как', 'почему'];
      const lowerName = concept.name.toLowerCase();
      if (stopWords.some(word => lowerName.includes(word))) return false;
      
      return true;
    });
  }
}
```

### RelationDetector.ts
```typescript
import { Concept } from '../types/education-objects';
import { ConceptRelation } from './SPGLessonParser';

export class RelationDetector {
  async validate(relations: Partial<ConceptRelation>[], concepts: Concept[]): Promise<ConceptRelation[]> {
    const conceptNames = new Set(concepts.map(c => c.name));
    
    return relations
      .filter(relation => {
        // Проверка существования концепций
        if (!relation.fromConcept || !relation.toConcept) return false;
        if (!conceptNames.has(relation.fromConcept) || !conceptNames.has(relation.toConcept)) return false;
        
        // Проверка типа отношения
        const validTypes = ['REQUIRES', 'RELATED_TO', 'PART_OF', 'EXAMPLE_OF'];
        if (!relation.relationType || !validTypes.includes(relation.relationType)) return false;
        
        // Исключение самосвязей
        if (relation.fromConcept === relation.toConcept) return false;
        
        return true;
      })
      .map(relation => ({
        fromConcept: relation.fromConcept!,
        toConcept: relation.toConcept!,
        relationType: relation.relationType!,
        strength: relation.strength || 0.5,
        description: relation.description || ''
      }));
  }
}
```

## Интеграция с основным workflow

### Модификация src/index.ts
```typescript
import { SPGLessonParser } from './kag/parser/SPGLessonParser';
import { EducationKAGAdapterImpl } from './kag/client/EducationKAGAdapter';

// В функции main()
async function main() {
  try {
    // Инициализация KAG
    const kagAdapter = new EducationKAGAdapterImpl();
    await kagAdapter.initialize();
    
    // Инициализация SPG парсера
    const spgParser = new SPGLessonParser(kagAdapter);
    
    // Остальная инициализация...
    await initializeBrowser();
    await loginToGetcourse();
    
    // Основной workflow с обработкой уроков через SPG
    await processLessonsWithSPG(spgParser);
    
  } catch (error) {
    console.error('❌ Error in main workflow:', error);
  }
}

async function processLessonsWithSPG(spgParser: SPGLessonParser) {
  try {
    // Получение списка уроков
    const lessonUrls = await getLessonUrls();
    
    for (const lessonUrl of lessonUrls) {
      console.log(`🔄 Processing lesson: ${lessonUrl}`);
      
      try {
        // Обработка и сохранение урока через SPG
        const lessonId = await spgParser.processAndStoreLesson(lessonUrl);
        console.log(`✅ Lesson processed: ${lessonId}`);
      } catch (error) {
        console.error(`❌ Error processing lesson ${lessonUrl}:`, error);
      }
    }
    
    // Запуск проверки домашних заданий
    await checkHomeworkWorkflow();
    
  } catch (error) {
    console.error('❌ Error in processLessonsWithSPG:', error);
  }
}
```

## Следующие шаги

1. **Создать NLP компоненты**: TextProcessor, ConceptRecognizer, RelationDetector
2. **Интегрировать AI сервис**: Настроить вызовы AI для извлечения концепций и отношений
3. **Тестирование**: Проверить работу извлечения знаний на реальных уроках
4. **Оптимизация**: Улучшить точность извлечения и обработки
5. **Масштабирование**: Настроить пакетную обработку уроков

## Преимущества данной адаптации

1. **Автоматизация**: Полностью автоматическое извлечение знаний
2. **Контекст**: Богатый контекст для каждого урока
3. **Связи**: Автоматическое определение связей между концепциями
4. **Масштабируемость**: Легко обрабатывать большие объемы уроков
5. **Точность**: Использование AI для повышения точности извлечения
6. **Интеграция**: Полная интеграция с существующим workflow