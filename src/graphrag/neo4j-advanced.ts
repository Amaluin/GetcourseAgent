/**
 * Продвинутая работа с Neo4j для GraphRAG
 * - Хранение чанков с embeddings
 * - Трекинг студентов
 * - Semantic search
 * - Multi-hop queries
 */

import neo4j, { Driver, Session } from 'neo4j-driver';
import { Chunk } from './chunking';
import { cosineSimilarity, findTopSimilar } from './embeddings';

export interface LessonInfo {
  id: string;
  title?: string;
}

export interface StudentProgress {
  studentId: string;
  studentName: string;
  completedLessons: LessonInfo[]; // Теперь массив объектов с id и title
  totalSubmissions: number;
  avgScore?: number;
  lastActivityDate: Date;
  gcId?: string;
  gcUrl?: string;
}

export interface ChunkWithEmbedding extends Chunk {
  embedding?: number[];
}

export class Neo4jAdvancedClient {
  private driver: Driver;

  constructor(uri: string, username: string, password: string) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      encrypted: 'ENCRYPTION_OFF' as any
    });
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  /**
   * 1. ПРОДВИНУТЫЙ ЧАНКИНГ - Сохранение чанков в Neo4j
   * Если урок уже существует, старые чанки удаляются перед добавлением новых
   */
  async addLessonChunks(
    lessonId: string,
    lessonTitle: string,
    chunks: ChunkWithEmbedding[],
    replaceExisting: boolean = false
  ): Promise<void> {
    const session = this.driver.session();
    
    try {
      // Проверяем, существует ли урок
      const existingLesson = await session.run(
        `MATCH (l:Lesson {id: $lessonId}) RETURN l`,
        { lessonId }
      );

      const lessonExists = existingLesson.records.length > 0;

      // Если урок существует и нужно заменить - удаляем старые чанки
      if (lessonExists && replaceExisting) {
        console.log(`⚠️  Урок ${lessonId} уже существует, удаляю старые чанки...`);
        await session.run(
          `
          MATCH (l:Lesson {id: $lessonId})-[:HAS_CHUNK]->(c:Chunk)
          DETACH DELETE c
          `,
          { lessonId }
        );
      }

      // Если урок существует и НЕ нужно заменять - проверяем, есть ли уже чанки
      if (lessonExists && !replaceExisting) {
        const existingChunks = await session.run(
          `MATCH (l:Lesson {id: $lessonId})-[:HAS_CHUNK]->(c:Chunk) RETURN count(c) as count`,
          { lessonId }
        );
        const chunkCount = existingChunks.records[0]?.get('count').toNumber() || 0;
        
        if (chunkCount > 0) {
          console.log(`ℹ️  Урок ${lessonId} уже существует с ${chunkCount} чанками, пропускаю добавление (чтобы перезаписать, используйте replaceExisting=true)`);
          return;
        }
        // Если урока нет, но чанков нет - продолжаем добавление
        console.log(`ℹ️  Урок ${lessonId} существует, но чанков нет, добавляю...`);
      }

      // Создаем или обновляем урок
      await session.run(
        `
        MERGE (l:Lesson {id: $lessonId})
        SET l.title = $title,
            l.totalChunks = $totalChunks,
            l.updatedAt = datetime()
        `,
        {
          lessonId,
          title: lessonTitle,
          totalChunks: chunks.length
        }
      );

      // Добавляем каждый чанк
      for (const chunk of chunks) {
        await session.run(
          `
          MERGE (c:Chunk {id: $chunkId})
          SET c.text = $text,
              c.tokenCount = $tokenCount,
              c.chunkIndex = $chunkIndex,
              c.startIndex = $startIndex,
              c.endIndex = $endIndex,
              c.embedding = $embedding
          WITH c
          MATCH (l:Lesson {id: $lessonId})
          MERGE (l)-[r:HAS_CHUNK]->(c)
          SET r.chunkIndex = $chunkIndex
          `,
          {
            chunkId: chunk.id,
            text: chunk.text,
            tokenCount: chunk.tokenCount,
            chunkIndex: chunk.metadata.chunkIndex,
            startIndex: chunk.startIndex,
            endIndex: chunk.endIndex,
            embedding: chunk.embedding || [],
            lessonId
          }
        );
      }

      // Связываем последовательные чанки
      for (let i = 0; i < chunks.length - 1; i++) {
        await session.run(
          `
          MATCH (c1:Chunk {id: $chunk1Id})
          MATCH (c2:Chunk {id: $chunk2Id})
          MERGE (c1)-[r:NEXT_CHUNK]->(c2)
          `,
          {
            chunk1Id: chunks[i].id,
            chunk2Id: chunks[i + 1].id
          }
        );
      }

      console.log(`✅ Добавлено ${chunks.length} чанков для урока ${lessonId}`);
    } finally {
      await session.close();
    }
  }

  /**
   * Проверка существования урока в GraphRAG
   */
  async lessonExists(lessonId: string): Promise<boolean> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (l:Lesson {id: $lessonId})-[:HAS_CHUNK]->(c:Chunk) RETURN count(c) as count`,
        { lessonId }
      );
      const count = result.records[0]?.get('count').toNumber() || 0;
      return count > 0;
    } finally {
      await session.close();
    }
  }

  /**
   * Получение информации об уроке из GraphRAG
   */
  async getLessonInfo(lessonId: string): Promise<{ id: string; title: string; chunkCount: number } | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (l:Lesson {id: $lessonId})
        OPTIONAL MATCH (l)-[:HAS_CHUNK]->(c:Chunk)
        RETURN l.id as id, l.title as title, count(c) as chunkCount
        `,
        { lessonId }
      );
      
      if (result.records.length === 0) {
        return null;
      }
      
      const record = result.records[0];
      return {
        id: record.get('id'),
        title: record.get('title') || 'Без названия',
        chunkCount: record.get('chunkCount').toNumber()
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Проверка существования студента в GraphRAG
   */
  async studentExists(studentId: string): Promise<boolean> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Student {id: $studentId}) RETURN s`,
        { studentId }
      );
      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  /**
   * Получение информации о студенте (какие уроки он прошел)
   */
  async getStudentLessons(studentId: string): Promise<string[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (s:Student {id: $studentId})-[:COMPLETED]->(l:Lesson)
        RETURN collect(l.id) as lessonIds
        `,
        { studentId }
      );
      
      if (result.records.length === 0) {
        return [];
      }
      
      const lessonIds = result.records[0].get('lessonIds');
      return lessonIds || [];
    } finally {
      await session.close();
    }
  }

  /**
   * 2. ТРЕКИНГ СТУДЕНТОВ - Создание/обновление профиля студента
   */
  async addOrUpdateStudent(
    studentId: string,
    studentName: string,
    email?: string,
    gcId?: string,
    gcUrl?: string
  ): Promise<void> {
    const session = this.driver.session();
    
    try {
      await session.run(
        `
        MERGE (s:Student {id: $studentId})
        SET s.name = $name,
            s.email = COALESCE($email, s.email),
            s.gcId = COALESCE($gcId, s.gcId),
            s.gcUrl = COALESCE($gcUrl, s.gcUrl),
            s.lastActivityAt = datetime()
        `,
        {
          studentId,
          name: studentName,
          email: email || null,
          gcId: gcId || null,
          gcUrl: gcUrl || null
        }
      );

      console.log(`✅ Студент ${studentName} добавлен/обновлен`);
    } finally {
      await session.close();
    }
  }

  /**
   * Связывание студента с уроком (прохождение)
   * Использует MERGE, поэтому не создает дубликаты - просто обновляет дату если связь уже есть
   */
  async markLessonCompleted(
    studentId: string,
    lessonId: string,
    completionDate: Date = new Date()
  ): Promise<void> {
    const session = this.driver.session();
    
    try {
      // Проверяем, существует ли уже связь
      const existing = await session.run(
        `
        MATCH (s:Student {id: $studentId})-[r:COMPLETED]->(l:Lesson {id: $lessonId})
        RETURN r
        `,
        { studentId, lessonId }
      );

      if (existing.records.length > 0) {
        // Связь уже существует - обновляем дату
        await session.run(
          `
          MATCH (s:Student {id: $studentId})-[r:COMPLETED]->(l:Lesson {id: $lessonId})
          SET r.completedAt = datetime($completionDate),
              r.timestamp = $timestamp
          `,
          {
            studentId,
            lessonId,
            completionDate: completionDate.toISOString(),
            timestamp: completionDate.getTime()
          }
        );
        console.log(`ℹ️  Связь студент-урок уже существует, обновлена дата`);
      } else {
        // Создаем новую связь
        await session.run(
          `
          MATCH (s:Student {id: $studentId})
          MATCH (l:Lesson {id: $lessonId})
          MERGE (s)-[r:COMPLETED]->(l)
          SET r.completedAt = datetime($completionDate),
              r.timestamp = $timestamp
          `,
          {
            studentId,
            lessonId,
            completionDate: completionDate.toISOString(),
            timestamp: completionDate.getTime()
          }
        );
        console.log(`✅ Студент ${studentId} прошел урок ${lessonId}`);
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Связывание работы студента с ним
   * Использует MERGE, поэтому не создает дубликаты
   */
  async linkSubmissionToStudent(
    submissionId: string,
    studentId: string,
    studentName: string
  ): Promise<void> {
    const session = this.driver.session();
    
    try {
      // Создаем студента если его нет (MERGE не создаст дубликат)
      await this.addOrUpdateStudent(studentId, studentName);

      // Проверяем, существует ли уже связь
      const existing = await session.run(
        `
        MATCH (s:Student {id: $studentId})-[r:SUBMITTED]->(sub:Submission {id: $submissionId})
        RETURN r
        `,
        { studentId, submissionId }
      );

      if (existing.records.length > 0) {
        // Связь уже существует - обновляем дату
        await session.run(
          `
          MATCH (s:Student {id: $studentId})-[r:SUBMITTED]->(sub:Submission {id: $submissionId})
          SET r.submittedAt = datetime()
          `,
          { studentId, submissionId }
        );
        console.log(`ℹ️  Связь студент-работа уже существует, обновлена дата`);
      } else {
        // Создаем новую связь
        await session.run(
          `
          MATCH (s:Student {id: $studentId})
          MATCH (sub:Submission {id: $submissionId})
          MERGE (s)-[r:SUBMITTED]->(sub)
          SET r.submittedAt = datetime()
          `,
          {
            studentId,
            submissionId
          }
        );
        console.log(`✅ Работа ${submissionId} связана со студентом ${studentId}`);
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Поиск студента по имени, фамилии или ID из GetCourse (user-friendly поиск)
   */
  async findStudentByName(nameQuery: string): Promise<Array<{ id: string; name: string; email?: string; gcId?: string; gcUrl?: string }>> {
    const session = this.driver.session();
    
    try {
      // Пробуем найти по ID из GetCourse (если запрос похож на число)
      const isNumeric = /^\d+$/.test(nameQuery.trim());
      
      let result;
      if (isNumeric) {
        // Поиск по gcId
        result = await session.run(
          `
          MATCH (s:Student)
          WHERE s.gcId = $query
          RETURN s.id as id, s.name as name, s.email as email, s.gcId as gcId, s.gcUrl as gcUrl
          LIMIT 10
          `,
          { query: nameQuery.trim() }
        );
      } else {
        // Поиск по имени (частичное совпадение, регистронезависимо)
        // Ищем в имени, фамилии или полном имени
        result = await session.run(
          `
          MATCH (s:Student)
          WHERE s.name CONTAINS $nameQuery 
             OR s.name =~ $nameRegex
             OR toLower(s.name) CONTAINS toLower($nameQuery)
          RETURN s.id as id, s.name as name, s.email as email, s.gcId as gcId, s.gcUrl as gcUrl
          ORDER BY 
            CASE WHEN s.name = $nameQuery THEN 1 ELSE 2 END,
            CASE WHEN s.name STARTS WITH $nameQuery THEN 1 ELSE 2 END
          LIMIT 10
          `,
          {
            nameQuery: nameQuery,
            nameRegex: `(?i).*${nameQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`
          }
        );
      }

      return result.records.map(record => ({
        id: record.get('id'),
        name: record.get('name'),
        email: record.get('email'),
        gcId: record.get('gcId'),
        gcUrl: record.get('gcUrl')
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * 3. SEMANTIC SEARCH - Поиск релевантных чанков
   */
  async semanticSearchChunks(
    queryEmbedding: number[],
    topK: number = 5,
    lessonId?: string
  ): Promise<Array<{ chunk: Chunk; similarity: number }>> {
    const session = this.driver.session();
    
    try {
      // Получаем все чанки (с фильтром по уроку если указан)
      const query = lessonId
        ? `
          MATCH (l:Lesson {id: $lessonId})-[:HAS_CHUNK]->(c:Chunk)
          WHERE c.embedding IS NOT NULL AND size(c.embedding) > 0
          RETURN c
        `
        : `
          MATCH (c:Chunk)
          WHERE c.embedding IS NOT NULL AND size(c.embedding) > 0
          RETURN c
        `;

      const result = await session.run(query, { lessonId });

      // Вычисляем сходство
      const chunksWithSimilarity = result.records.map(record => {
        const node = record.get('c');
        const embedding = node.properties.embedding;
        const similarity = cosineSimilarity(queryEmbedding, embedding);

        return {
          chunk: {
            id: node.properties.id,
            text: node.properties.text,
            startIndex: node.properties.startIndex,
            endIndex: node.properties.endIndex,
            tokenCount: node.properties.tokenCount,
            metadata: {
              chunkIndex: node.properties.chunkIndex,
              totalChunks: 0
            }
          },
          similarity
        };
      });

      // Сортируем по убыванию схожести
      chunksWithSimilarity.sort((a, b) => b.similarity - a.similarity);

      return chunksWithSimilarity.slice(0, topK);
    } finally {
      await session.close();
    }
  }

  /**
   * Получить контекст вокруг релевантного чанка
   */
  async getChunkContext(chunkId: string, contextSize: number = 1): Promise<Chunk[]> {
    const session = this.driver.session();
    
    try {
      // Получаем предыдущие чанки
      const prevQuery = `
        MATCH path = (start:Chunk)-[:NEXT_CHUNK*0..${contextSize}]->(c:Chunk {id: $chunkId})
        RETURN start
        ORDER BY length(path) DESC
      `;
      
      const prevResult = await session.run(prevQuery, { chunkId });
      const prevChunks = prevResult.records.map(r => this.nodeToChunk(r.get('start')));

      // Получаем следующие чанки
      const nextQuery = `
        MATCH (c:Chunk {id: $chunkId})-[:NEXT_CHUNK*0..${contextSize}]->(end:Chunk)
        RETURN end
      `;
      
      const nextResult = await session.run(nextQuery, { chunkId });
      const nextChunks = nextResult.records.map(r => this.nodeToChunk(r.get('end')));

      // Объединяем (без дублирования центрального чанка)
      const allChunks = [...prevChunks, ...nextChunks.slice(1)];
      return allChunks;
    } finally {
      await session.close();
    }
  }

  /**
   * 4. СТАТИСТИКА СТУДЕНТА (с названиями уроков)
   */
  async getStudentProgress(studentId: string): Promise<StudentProgress | null> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(
        `
        MATCH (s:Student {id: $studentId})
        OPTIONAL MATCH (s)-[:COMPLETED]->(l:Lesson)
        OPTIONAL MATCH (s)-[:SUBMITTED]->(sub:Submission)
        RETURN s,
               collect(DISTINCT {id: l.id, title: l.title}) as completedLessons,
               count(DISTINCT sub) as totalSubmissions,
               avg(sub.score) as avgScore
        `,
        { studentId }
      );

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      const student = record.get('s');
      const completedLessonsData = record.get('completedLessons').filter((l: any) => l !== null && l.id !== null);
      const totalSubmissions = record.get('totalSubmissions').toNumber();
      const avgScore = record.get('avgScore');

      // Преобразуем в массив объектов с id и title
      const completedLessons = completedLessonsData.map((l: any) => ({
        id: l.id,
        title: l.title || l.id // Если title нет, используем id
      }));

      return {
        studentId,
        studentName: student.properties.name,
        completedLessons,
        totalSubmissions,
        avgScore: avgScore ? parseFloat(avgScore.toString()) : undefined,
        lastActivityDate: new Date(student.properties.lastActivityAt),
        gcId: student.properties.gcId,
        gcUrl: student.properties.gcUrl
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Получить все работы студента
   */
  async getStudentSubmissions(studentId: string): Promise<any[]> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(
        `
        MATCH (s:Student {id: $studentId})-[:SUBMITTED]->(sub:Submission)
        OPTIONAL MATCH (sub)-[:FOR_LESSON]->(l:Lesson)
        RETURN sub, l
        ORDER BY sub.createdAt DESC
        `,
        { studentId }
      );

      return result.records.map(record => {
        const sub = record.get('sub');
        const lesson = record.get('l');
        
        return {
          submissionId: sub.properties.id,
          lessonId: lesson ? lesson.properties.id : null,
          lessonTitle: lesson ? lesson.properties.title : null,
          createdAt: sub.properties.createdAt,
          score: sub.properties.score
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * 5. MULTI-HOP QUERIES - Сложные запросы через граф
   */
  
  /**
   * Найти студентов, изучавших похожие концепции
   */
  async findStudentsWithSimilarTopics(studentId: string, limit: number = 5): Promise<any[]> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(
        `
        MATCH (s1:Student {id: $studentId})-[:SUBMITTED]->(:Submission)-[:MENTIONS]->(c:Concept)
        MATCH (s2:Student)-[:SUBMITTED]->(:Submission)-[:MENTIONS]->(c)
        WHERE s1 <> s2
        WITH s2, count(DISTINCT c) as sharedConcepts
        ORDER BY sharedConcepts DESC
        LIMIT $limit
        RETURN s2.id as studentId, s2.name as studentName, sharedConcepts
        `,
        { studentId, limit }
      );

      return result.records.map(record => ({
        studentId: record.get('studentId'),
        studentName: record.get('studentName'),
        sharedConcepts: record.get('sharedConcepts').toNumber()
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Найти концепции, которые студент еще не изучал
   */
  async findUnlearnedConcepts(studentId: string, limit: number = 10): Promise<string[]> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(
        `
        MATCH (c:Concept)
        WHERE NOT EXISTS {
          MATCH (s:Student {id: $studentId})-[:SUBMITTED]->(:Submission)-[:MENTIONS]->(c)
        }
        RETURN c.name as conceptName
        LIMIT $limit
        `,
        { studentId, limit }
      );

      return result.records.map(record => record.get('conceptName'));
    } finally {
      await session.close();
    }
  }

  /**
   * Найти самые сложные концепции (где студенты чаще ошибаются)
   */
  async findDifficultConcepts(limit: number = 10): Promise<any[]> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(
        `
        MATCH (sub:Submission)-[:MENTIONS]->(c:Concept)
        WHERE sub.score IS NOT NULL
        WITH c, avg(sub.score) as avgScore, count(sub) as totalSubmissions
        WHERE totalSubmissions >= 3
        ORDER BY avgScore ASC
        LIMIT $limit
        RETURN c.name as conceptName, avgScore, totalSubmissions
        `,
        { limit }
      );

      return result.records.map(record => ({
        conceptName: record.get('conceptName'),
        avgScore: parseFloat(record.get('avgScore').toString()),
        totalSubmissions: record.get('totalSubmissions').toNumber()
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Reasoning chain - построить путь обучения
   */
  async buildLearningPath(
    studentId: string,
    targetConceptName: string
  ): Promise<string[]> {
    const session = this.driver.session();
    
    try {
      // Найти кратчайший путь от изученных концепций к целевой
      const result = await session.run(
        `
        MATCH (s:Student {id: $studentId})-[:SUBMITTED]->(:Submission)-[:MENTIONS]->(learned:Concept)
        MATCH (target:Concept {name: $targetConcept})
        MATCH path = shortestPath((learned)-[:RELATED_TO*..5]-(target))
        WHERE learned <> target
        RETURN [node in nodes(path) | node.name] as conceptPath
        ORDER BY length(path) ASC
        LIMIT 1
        `,
        { studentId, targetConcept: targetConceptName }
      );

      if (result.records.length > 0) {
        return result.records[0].get('conceptPath');
      }

      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Вспомогательные методы
   */
  
  private nodeToChunk(node: any): Chunk {
    return {
      id: node.properties.id,
      text: node.properties.text,
      startIndex: node.properties.startIndex,
      endIndex: node.properties.endIndex,
      tokenCount: node.properties.tokenCount,
      metadata: {
        chunkIndex: node.properties.chunkIndex,
        totalChunks: 0
      }
    };
  }

  /**
   * Визуализация графа студента
   */
  async getStudentGraph(studentId: string): Promise<any> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(
        `
        MATCH (s:Student {id: $studentId})
        OPTIONAL MATCH (s)-[r1:COMPLETED]->(l:Lesson)
        OPTIONAL MATCH (s)-[r2:SUBMITTED]->(sub:Submission)
        OPTIONAL MATCH (sub)-[r3:MENTIONS]->(c:Concept)
        RETURN s, collect(DISTINCT l) as lessons, 
               collect(DISTINCT sub) as submissions,
               collect(DISTINCT c) as concepts
        `,
        { studentId }
      );

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      
      return {
        student: record.get('s').properties,
        lessons: record.get('lessons').map((l: any) => l.properties),
        submissions: record.get('submissions').map((s: any) => s.properties),
        concepts: record.get('concepts').map((c: any) => c.properties)
      };
    } finally {
      await session.close();
    }
  }
}

