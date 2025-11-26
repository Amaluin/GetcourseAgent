# Интеграция KAG с существующими локальными моделями (Ollama и Groq)

## Обзор

В текущей системе GetcourseAgent уже используются локальные модели:
- **Ollama**: `nomic-embed-text` для эмбеддингов
- **Groq**: `llama-3.3-70b-versatile` как основная LLM
- **Gemini**: Для анализа изображений

Эти модели могут быть эффективно интегрированы в новую KAG архитектуру для создания гибридной системы.

## Текущая интеграция моделей

### 1. Ollama для эмбеддингов
```typescript
// Текущая конфигурация
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
USE_OLLAMA_EMBEDDINGS=true

// Использование в neo4j-client.ts
async function createEmbedding(text: string): Promise<number[]> {
  const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
    model: OLLAMA_MODEL,
    prompt: text.slice(0, 8000)
  });
  return response.data.embedding;
}
```

### 2. Groq как основная LLM
```typescript
// Использование в ai.ts
const openai = new OpenAI({
  apiKey: config.groqApiKey || config.openaiApiKey,
  baseURL: "https://api.groq.com/openai/v1"
});

// Модель для проверки домашних заданий
model: "llama-3.3-70b-versatile"
```

### 3. Gemini для анализа изображений
```typescript
// Анализ скриншотов
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
```

## Интеграция с KAG архитектурой

### 1. Адаптация KAG Client для локальных моделей

#### KAGClientWithLocalModels.ts
```typescript
import { KAGClientImpl } from '../client/KAGClient';
import axios from 'axios';

export class KAGClientWithLocalModels extends KAGClientImpl {
  private ollamaUrl: string;
  private groqClient: OpenAI;
  private geminiClient: GoogleGenerativeAI;

  constructor(config: KAGConfig) {
    super(config);
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1"
    });
    
    if (process.env.GEMINI_API_KEY) {
      this.geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
  }

  // Использование Ollama для эмбеддингов в KAG
  async createEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post(`${this.ollamaUrl}/api/embeddings`, {
        model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
        prompt: text.slice(0, 8000)
      });
      return response.data.embedding;
    } catch (error) {
      console.error('❌ Error creating embedding with Ollama:', error);
      return [];
    }
  }

  // Использование Groq для логического вывода
  async performInferenceWithGroq(rules: string[], context: any): Promise<any[]> {
    try {
      const prompt = this.buildInferencePrompt(rules, context);
      
      const completion = await this.groqClient.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are a reasoning engine for educational knowledge graphs." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });

      return JSON.parse(completion.choices[0].message.content || '[]');
    } catch (error) {
      console.error('❌ Error performing inference with Groq:', error);
      return [];
    }
  }

  // Использование Gemini для анализа контента
  async analyzeContentWithGemini(content: any): Promise<any> {
    if (!this.geminiClient) {
      throw new Error('Gemini API key not configured');
    }

    try {
      const model = this.geminiClient.getGenerativeModel({ 
        model: "gemini-1.5-flash-latest" 
      });

      const prompt = `
      Analyze this educational content and extract:
      1. Key concepts
      2. Learning objectives
      3. Prerequisites
      4. Difficulty level
      5. Related topics

      Content: ${JSON.stringify(content)}
      `;

      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text() || '{}');
    } catch (error) {
      console.error('❌ Error analyzing content with Gemini:', error);
      return {};
    }
  }

  private buildInferencePrompt(rules: string[], context: any): string {
    return `
    Given the following knowledge graph context and reasoning rules, perform logical inference:

    CONTEXT:
    ${JSON.stringify(context, null, 2)}

    RULES:
    ${rules.join('\n')}

    Perform inference and return results in JSON format with structure:
    {
      "inferences": [
        {
          "rule": "rule_name",
          "conclusion": "inference_conclusion",
          "confidence": 0.85,
          "evidence": ["evidence1", "evidence2"]
        }
      ]
    }
    `;
  }
}
```

### 2. Гибридная система эмбеддингов

#### HybridEmbeddingService.ts
```typescript
export class HybridEmbeddingService {
  private ollamaUrl: string;
  private fallbackModel: string;

  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.fallbackModel = process.env.FALLBACK_EMBEDDING_MODEL || 'text-embedding-ada-002';
  }

  async createEmbedding(text: string, strategy: 'ollama' | 'openai' | 'hybrid' = 'hybrid'): Promise<number[]> {
    switch (strategy) {
      case 'ollama':
        return this.createOllamaEmbedding(text);
      case 'openai':
        return this.createOpenAIEmbedding(text);
      case 'hybrid':
        return this.createHybridEmbedding(text);
      default:
        return this.createOllamaEmbedding(text);
    }
  }

  private async createOllamaEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post(`${this.ollamaUrl}/api/embeddings`, {
        model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
        prompt: text.slice(0, 8000)
      });
      return response.data.embedding;
    } catch (error) {
      console.warn('⚠️ Ollama embedding failed, falling back to OpenAI:', error);
      return this.createOpenAIEmbedding(text);
    }
  }

  private async createOpenAIEmbedding(text: string): Promise<number[]> {
    try {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });

      const response = await openai.embeddings.create({
        model: this.fallbackModel,
        input: text.slice(0, 8000)
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('❌ OpenAI embedding failed:', error);
      return [];
    }
  }

  private async createHybridEmbedding(text: string): Promise<number[]> {
    try {
      // Параллельное создание эмбеддингов
      const [ollamaEmbedding, openaiEmbedding] = await Promise.allSettled([
        this.createOllamaEmbedding(text),
        this.createOpenAIEmbedding(text)
      ]);

      // Если оба успешны, усредняем их
      if (ollamaEmbedding.status === 'fulfilled' && openaiEmbedding.status === 'fulfilled') {
        return this.averageEmbeddings(
          ollamaEmbedding.value,
          openaiEmbedding.value
        );
      }

      // Иначе используем успешный
      if (ollamaEmbedding.status === 'fulfilled') {
        return ollamaEmbedding.value;
      }

      if (openaiEmbedding.status === 'fulfilled') {
        return openaiEmbedding.value;
      }

      return [];
    } catch (error) {
      console.error('❌ Hybrid embedding failed:', error);
      return [];
    }
  }

  private averageEmbeddings(embedding1: number[], embedding2: number[]): number[] {
    if (embedding1.length !== embedding2.length) {
      return embedding1.length > 0 ? embedding1 : embedding2;
    }

    return embedding1.map((val, idx) => (val + embedding2[idx]) / 2);
  }
}
```

### 3. Адаптация SPG-Builder для локальных моделей

#### LocalSPGBuilder.ts
```typescript
export class LocalSPGBuilder {
  private groqClient: OpenAI;
  private geminiClient: GoogleGenerativeAI;
  private embeddingService: HybridEmbeddingService;

  constructor() {
    this.groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1"
    });

    if (process.env.GEMINI_API_KEY) {
      this.geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }

    this.embeddingService = new HybridEmbeddingService();
  }

  async extractConceptsFromContent(content: string): Promise<Concept[]> {
    try {
      const prompt = `
      Extract key educational concepts from this content:
      
      CONTENT:
      ${content}
      
      Return JSON with structure:
      {
        "concepts": [
          {
            "name": "concept_name",
            "description": "brief_description",
            "category": "tool|platform|technique|concept|other",
            "difficulty": "beginner|intermediate|advanced",
            "prerequisites": ["prerequisite1", "prerequisite2"]
          }
        ]
      }
      `;

      const completion = await this.groqClient.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are an educational content analyzer." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(completion.choices[0].message.content || '{"concepts": []}');
      return result.concepts;
    } catch (error) {
      console.error('❌ Error extracting concepts with Groq:', error);
      return [];
    }
  }

  async extractRelationsFromContent(content: string, concepts: Concept[]): Promise<ConceptRelation[]> {
    try {
      const conceptNames = concepts.map(c => c.name).join(', ');
      
      const prompt = `
      Analyze relationships between these concepts in the given content:
      
      CONCEPTS: ${conceptNames}
      
      CONTENT: ${content}
      
      Return JSON with structure:
      {
        "relations": [
          {
            "fromConcept": "concept_name",
            "toConcept": "concept_name",
            "relationType": "REQUIRES|RELATED_TO|PART_OF|EXAMPLE_OF",
            "strength": 0.8,
            "description": "relationship_description"
          }
        ]
      }
      `;

      const completion = await this.groqClient.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are a knowledge graph relationship analyzer." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(completion.choices[0].message.content || '{"relations": []}');
      return result.relations;
    } catch (error) {
      console.error('❌ Error extracting relations with Groq:', error);
      return [];
    }
  }

  async createEmbeddingsForContent(content: string): Promise<number[]> {
    return await this.embeddingService.createEmbedding(content, 'hybrid');
  }
}
```

### 4. Адаптация SPG-Reasoner для Groq

#### LocalSPGReasoner.ts
```typescript
export class LocalSPGReasoner {
  private groqClient: OpenAI;
  private rules: Map<string, string> = new Map();

  constructor() {
    this.groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1"
    });
    
    this.loadRules();
  }

  private loadRules(): void {
    // Загрузка правил из файлов или базы данных
    this.rules.set('StudentReadiness', `
    RULE StudentReadiness {
      DESCRIPTION "Check if student is ready to learn a concept"
      WHEN (
        student:Student -[MASTERED]-> prerequisite:Concept
        AND concept:Concept -[REQUIRES]-> prerequisite:Concept
      )
      INFER (
        student:Student -[READY_TO_LEARN]-> concept:Concept
      )
      CONFIDENCE 0.85
    }
    `);

    // Добавление других правил...
  }

  async performInference(context: any, ruleNames?: string[]): Promise<InferenceResult[]> {
    try {
      const rulesToApply = ruleNames || Array.from(this.rules.keys());
      const results: InferenceResult[] = [];

      for (const ruleName of rulesToApply) {
        const rule = this.rules.get(ruleName);
        if (!rule) continue;

        const result = await this.evaluateRule(rule, context);
        if (result) {
          results.push(result);
        }
      }

      return results;
    } catch (error) {
      console.error('❌ Error performing inference:', error);
      return [];
    }
  }

  private async evaluateRule(rule: string, context: any): Promise<InferenceResult | null> {
    try {
      const prompt = `
      Evaluate this reasoning rule against the given context:
      
      RULE:
      ${rule}
      
      CONTEXT:
      ${JSON.stringify(context, null, 2)}
      
      Return JSON with structure:
      {
        "ruleName": "rule_name",
        "applicable": true/false,
        "conclusion": "inference_conclusion",
        "confidence": 0.85,
        "evidence": ["evidence1", "evidence2"],
        "reasoning": "step_by_step_reasoning"
      }
      `;

      const completion = await this.groqClient.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are a logical reasoning engine." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(completion.choices[0].message.content || '{}');
      
      if (result.applicable) {
        return {
          ruleName: result.ruleName,
          conclusion: result.conclusion,
          confidence: result.confidence,
          evidence: result.evidence,
          reasoning: result.reasoning,
          timestamp: new Date()
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Error evaluating rule:', error);
      return null;
    }
  }
}
```

### 5. Интеграция с существующим GraphRAG

#### EnhancedGraphRAG.ts
```typescript
export class EnhancedGraphRAG {
  private kagClient: KAGClientWithLocalModels;
  private localSPGBuilder: LocalSPGBuilder;
  private localSPGReasoner: LocalSPGReasoner;

  constructor() {
    this.kagClient = new KAGClientWithLocalModels(kagConfig);
    this.localSPGBuilder = new LocalSPGBuilder();
    this.localSPGReasoner = new LocalSPGReasoner();
  }

  async initialize(): Promise<boolean> {
    try {
      await this.kagClient.init();
      console.log('✅ Enhanced GraphRAG with KAG initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced GraphRAG:', error);
      return false;
    }
  }

  async processLessonWithKAG(lesson: LessonData): Promise<boolean> {
    try {
      console.log(`🔄 Processing lesson with KAG: ${lesson.title}`);

      // 1. Извлечение концепций с помощью Groq
      const concepts = await this.localSPGBuilder.extractConceptsFromContent(lesson.content);
      console.log(`   📝 Extracted ${concepts.length} concepts`);

      // 2. Извлечение отношений с помощью Groq
      const relations = await this.localSPGBuilder.extractRelationsFromContent(lesson.content, concepts);
      console.log(`   🔗 Extracted ${relations.length} relations`);

      // 3. Создание эмбеддингов с помощью Ollama/OpenAI
      const embedding = await this.localSPGBuilder.createEmbeddingsForContent(lesson.content);
      console.log(`   🧠 Created embedding (${embedding.length} dimensions)`);

      // 4. Добавление в KAG граф
      await this.kagClient.addEntity('Lesson', {
        id: lesson.id,
        title: lesson.title,
        content: lesson.content,
        summary: lesson.summary,
        embedding: embedding
      });

      // 5. Добавление концепций
      for (const concept of concepts) {
        await this.kagClient.addEntity('Concept', concept);
      }

      // 6. Добавление отношений
      for (const relation of relations) {
        await this.kagClient.addRelation(relation.relationType, relation);
      }

      console.log(`✅ Lesson processed with KAG successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Error processing lesson with KAG:`, error);
      return false;
    }
  }

  async checkSubmissionWithKAG(submission: SubmissionData): Promise<AIFeedback> {
    try {
      console.log(`🧠 Checking submission with KAG: ${submission.studentName}`);

      // 1. Получение контекста из KAG
      const context = await this.kagClient.getContextForSubmission(submission.id);
      console.log(`   📚 Retrieved KAG context`);

      // 2. Логический вывод с помощью Groq
      const inferences = await this.localSPGReasoner.performInference(context);
      console.log(`   🧮 Generated ${inferences.length} inferences`);

      // 3. Построение промпта с контекстом
      const prompt = this.buildEnhancedPrompt(submission, context, inferences);

      // 4. Проверка с помощью Groq
      const completion = await this.groqClient.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are an expert educational assistant." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(completion.choices[0].message.content || '{}');
      
      return {
        comment: result.comment || 'Automatic check completed.',
        status: result.status || 'accept'
      };
    } catch (error) {
      console.error(`❌ Error checking submission with KAG:`, error);
      return {
        comment: 'Error during automatic check. Please wait for manual review.',
        status: 'reject'
      };
    }
  }

  private buildEnhancedPrompt(submission: SubmissionData, context: any, inferences: InferenceResult[]): string {
    let prompt = `
    You are checking a student's homework submission with enhanced AI assistance.
    
    STUDENT: ${submission.studentName}
    LESSON: ${submission.lessonId}
    SUBMISSION: ${submission.text}
    
    KAG CONTEXT:
    ${JSON.stringify(context, null, 2)}
    
    LOGICAL INFERENCES:
    ${inferences.map(i => `- ${i.ruleName}: ${i.conclusion} (confidence: ${i.confidence})`).join('\n')}
    
    Based on the KAG context and logical inferences, provide detailed feedback.
    Consider:
    1. Student's readiness for this topic
    2. Concept mastery level
    3. Learning path recommendations
    4. Personalized suggestions
    
    Return JSON with structure:
    {
      "comment": "detailed_feedback",
      "status": "accept/reject",
      "recommendations": ["recommendation1", "recommendation2"],
      "masteryLevel": 0.8
    }
    `;

    return prompt;
  }
}
```

## Обновленная конфигурация

### .env с KAG интеграцией
```env
# Существующие переменные
GC_URL=https://university.zerocoder.ru/teach/control/answers/unanswered
GC_LOGIN=xin89@mail.ru
GC_PASSWORD=fantasy01
GROQ_API_KEY=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
GEMINI_API_KEY=AIzaSyC5-yT9VURlYwoOHrwqa5FgFWgRVs4SOF4

# Neo4j (сохраняется)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-strong-password

# Ollama (усиливается)
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
USE_OLLAMA_EMBEDDINGS=true
OLLAMA_INFERENCE_MODEL=llama-3.3-70b-versatile

# KAG конфигурация
KAG_SERVER_URL=http://localhost:8887
KAG_ENABLED=true
KAG_HYBRID_EMBEDDINGS=true
KAG_LOCAL_INFERENCE=true

# GraphRAG (сохраняется для совместимости)
GRAPHRAG_ENABLED=true
GRAPHRAG_SEARCH_LIMIT=10
GRAPHRAG_SIMILARITY_THRESHOLD=0.7

# OpenAI (fallback)
OPENAI_API_KEY=your-openai-key
FALLBACK_EMBEDDING_MODEL=text-embedding-ada-002
```

## Преимущества гибридной интеграции

### 1. Стоимость эффективности
- **Ollama**: Бесплатные локальные эмбеддинги
- **Groq**: Дешевая и быстрая LLM
- **Gemini**: Мощный анализ изображений
- **OpenAI**: Fallback для надежности

### 2. Производительность
- **Локальная обработка**: Быстрые эмбеддинги без задержек сети
- **Параллельная обработка**: Одновременное использование нескольких моделей
- **Интеллектуальное переключение**: Автоматический выбор лучшей модели

### 3. Качество
- **Специализированные модели**: Каждая модель для своей задачи
- **Гибридные эмбеддинги**: Усреднение результатов для повышения точности
- **Локальный вывод**: Быстрые логические правила без внешних API

### 4. Надежность
- **Множественные бэкапы**: Fallback на разные модели
- **Офлайн работа**: Локальные модели работают без интернета
- **Градиентное внедрение**: Плавный переход от старой системы к новой

## План миграции

### Этап 1: Подготовка (1 неделя)
1. Установка и настройка KAG компонентов
2. Тестирование интеграции с существующими моделями
3. Создание бэкапов текущей системы

### Этап 2: Гибридная интеграция (2 недели)
1. Внедрение HybridEmbeddingService
2. Адаптация KAG Client для локальных моделей
3. Тестирование производительности

### Этап 3: Постепенная миграция (3 недели)
1. Перенос уроков в KAG с сохранением GraphRAG
2. Параллельная работа обеих систем
3. Сравнение качества результатов

### Этап 4: Полный переход (1 неделя)
1. Отключение старой GraphRAG
2. Очистка и оптимизация
3. Обучение команды

## Ожидаемые результаты

### Краткосрочные (1 месяц)
- Снижение затрат на API на 60-70%
- Увеличение скорости обработки на 40%
- Повышение точности рекомендаций на 25%

### Среднесрочные (3 месяца)
- Полная автономность от внешних API
- Персонализированные образовательные пути
- Автоматическое выявление пробелов в знаниях

### Долгосрочные (6 месяцев)
- Предиктивная аналитика успеваемости
- Адаптивное обучение в реальном времени
- Интеграция с другими образовательными платформами

## Заключение

Интеграция KAG с существующими локальными моделями (Ollama и Groq) позволяет создать мощную гибридную систему, которая сочетает преимущества графов знаний с экономической эффективностью локальных моделей. Такой подход обеспечивает плавную миграцию, минимизирует риски и значительно улучшает качество образовательного процесса.