/**
 * Neo4j клиент для работы с GraphRAG
 */

import neo4j, { Driver, Session } from 'neo4j-driver';
import axios from 'axios';
import { config } from '../config';
import * as crypto from 'crypto';
import * as KnowledgeBase from './knowledge-base';
import { DetailedSection } from '../lesson-parser';

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
const GRAPHRAG_ENABLED = process.env.GRAPHRAG_ENABLED === 'true';

let driver: Driver | null = null;
let session: Session | null = null;

export interface LessonData {
  id: string;
  title: string;
  content: string;
  summary: string;
  videoUrls?: string[];
  imageUrls?: string[];
  detailedSections?: DetailedSection[];
}

export interface SubmissionData {
  id: string;
  lessonId: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  text: string;
  status: 'accepted' | 'rejected';
  imageUrls?: string[];
}

export interface ConceptData {
  name: string;
  description?: string;
}

/**
 * Инициализация Neo4j драйвера
 */
export async function initGraphRAG(): Promise<boolean> {
  if (!GRAPHRAG_ENABLED) {
    console.log('⏭️ GraphRAG отключен (GRAPHRAG_ENABLED=false)');
    return false;
  }

  try {
    driver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
    );
    session = driver.session();
    
    // Проверяем подключение
    await session.run('RETURN 1');
    console.log('✅ GraphRAG инициализирован (Neo4j подключен)');
    return true;
  } catch (error: any) {
    console.warn('⚠️ Не удалось подключиться к Neo4j:', error.message);
    console.warn('   GraphRAG будет отключен для этой сессии');
    return false;
  }
}

/**
 * Закрытие соединения с Neo4j
 */
export async function closeGraphRAG(): Promise<void> {
  if (session) await session.close();
  if (driver) await driver.close();
  console.log('✅ GraphRAG соединение закрыто');
}

/**
 * Создание embedding через Ollama
 */
async function createEmbedding(text: string): Promise<number[]> {
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
      model: OLLAMA_MODEL,
      prompt: text.slice(0, 8000)
    });
    return response.data.embedding;
  } catch (error) {
    console.warn('⚠️ Не удалось создать embedding:', error);
    return [];
  }
}

/**
 * Генерация ID студента на основе имени
 */
function generateStudentId(studentName: string): string {
  return crypto
    .createHash('md5')
    .update(studentName.toLowerCase().trim())
    .digest('hex')
    .slice(0, 16);
}

/**
 * Добавление урока в граф
 */
export async function addLesson(lesson: LessonData): Promise<boolean> {
  if (!session) return false;

  try {
    console.log(`📚 Добавляю урок "${lesson.title}" в GraphRAG...`);
    
    await session.run(`
      MERGE (l:Lesson {id: $id})
      SET l.title = $title,
          l.content = $content,
          l.summary = $summary,
          l.videoUrls = $videoUrls,
          l.imageUrls = $imageUrls,
          l.updated_at = datetime(),
          l.created_at = COALESCE(l.created_at, datetime())
      RETURN l
    `, {
      id: lesson.id,
      title: lesson.title,
      content: lesson.content.slice(0, 10000), // Ограничиваем размер
      summary: lesson.summary,
      videoUrls: lesson.videoUrls || [],
      imageUrls: lesson.imageUrls || []
    });
    
    console.log(`   ✅ Урок добавлен в граф`);
    
    // Добавляем детальные секции для базы знаний
    if (lesson.detailedSections && lesson.detailedSections.length > 0) {
      console.log(`   📊 Добавляю ${lesson.detailedSections.length} детальных секций...`);
      
      for (const section of lesson.detailedSections) {
        const sectionData: KnowledgeBase.LessonSection = {
          id: `${lesson.id}-section-${section.sectionNumber}`,
          lessonId: lesson.id,
          sectionNumber: section.sectionNumber,
          title: section.title,
          content: section.content,
          videoUrl: section.videoUrl,
          videoTitle: section.videoTitle,
          timestamp: section.timestamp,
          beforeVideo: section.beforeVideo,
          afterVideo: section.afterVideo,
          keywords: KnowledgeBase.extractKeywords(section.content)
        };
        
        await KnowledgeBase.saveLessonSection(session, sectionData);
      }
      
      console.log(`   ✅ Все секции добавлены в базу знаний`);
    }
    
    return true;
  } catch (error: any) {
    console.error('   ❌ Ошибка добавления урока:', error.message);
    return false;
  }
}

/**
 * Добавление работы студента в граф
 */
export async function addSubmission(submission: SubmissionData): Promise<boolean> {
  if (!session) return false;

  try {
    const studentId = generateStudentId(submission.studentName);
    
    console.log(`📝 Добавляю работу студента "${submission.studentName}" в GraphRAG...`);
    
    await session.run(`
      // Находим или создаем урок
      MERGE (l:Lesson {id: $lessonId})
      
      // Создаем или обновляем работу
      MERGE (s:Submission {id: $id})
      SET s.studentId = $studentId,
          s.studentName = $studentName,
          s.text = $text,
          s.status = $status,
          s.imageUrls = $imageUrls,
          s.updated_at = datetime(),
          s.created_at = COALESCE(s.created_at, datetime())
      
      // Создаем связь: Работа -> Урок
      MERGE (s)-[:FOR_LESSON]->(l)
      
      // Создаем обратную связь: Урок -> Работа
      MERGE (l)-[:HAS_SUBMISSION]->(s)
      
      // Создаем или находим студента
      MERGE (st:Student {id: $studentId})
      SET st.name = $studentName,
          st.updated_at = datetime(),
          st.created_at = COALESCE(st.created_at, datetime())
      
      // Связываем студента с работой
      MERGE (st)-[:SUBMITTED]->(s)
      
      // Связываем студента с уроком (для статистики)
      MERGE (st)-[:STUDIES]->(l)
      
      RETURN s
    `, {
      id: submission.id,
      lessonId: submission.lessonId,
      studentId: studentId,
      studentName: submission.studentName,
      text: submission.text.slice(0, 5000), // Ограничиваем размер
      status: submission.status,
      imageUrls: submission.imageUrls || []
    });
    
    console.log(`   ✅ Работа студента добавлена (ID: ${studentId})`);
    return true;
  } catch (error: any) {
    console.error('   ❌ Ошибка добавления работы:', error.message);
    return false;
  }
}

/**
 * Извлечение и добавление концепций из урока
 */
export async function extractAndAddConcepts(lessonId: string, lessonContent: string): Promise<boolean> {
  if (!session) return false;

  try {
    console.log(`🧠 Извлекаю концепции из урока...`);
    
    // Простое извлечение ключевых слов (можно улучшить с помощью AI)
    const keywords = extractKeywords(lessonContent);
    
    for (const keyword of keywords.slice(0, 10)) { // Максимум 10 концепций
      try {
        await session.run(`
          // Создаем или находим концепцию
          MERGE (c:Concept {name: $name})
          SET c.created_at = COALESCE(c.created_at, datetime()),
              c.updated_at = datetime()
          
          WITH c
          MATCH (l:Lesson {id: $lessonId})
          
          // Связываем урок с концепцией
          MERGE (l)-[:TEACHES]->(c)
          
          // Создаем обратную связь для навигации
          MERGE (c)-[:TAUGHT_IN]->(l)
          
          RETURN c
        `, {
          name: keyword,
          lessonId: lessonId
        });
      } catch (e) {
        // Игнорируем ошибки для отдельных концепций
      }
    }
    
    console.log(`   ✅ Добавлено ${Math.min(keywords.length, 10)} концепций`);
    return true;
  } catch (error: any) {
    console.error('   ❌ Ошибка извлечения концепций:', error.message);
    return false;
  }
}

/**
 * Связывание работы студента с концепциями
 */
export async function linkSubmissionToConcepts(submissionId: string, submissionText: string): Promise<boolean> {
  if (!session) return false;

  try {
    // Находим упоминания концепций в тексте работы
    const result = await session.run(`
      MATCH (c:Concept)
      RETURN c.name as name
    `);
    
    const concepts = result.records.map(r => r.get('name'));
    let linkedCount = 0;
    
    for (const conceptName of concepts) {
      // Проверяем, упоминается ли концепция в тексте (регистронезависимо)
      if (submissionText.toLowerCase().includes(conceptName.toLowerCase())) {
        try {
          await session.run(`
            MATCH (s:Submission {id: $submissionId})
            MATCH (c:Concept {name: $conceptName})
            
            // Связываем работу с концепцией
            MERGE (s)-[:USES]->(c)
            
            // Создаем обратную связь
            MERGE (c)-[:USED_IN]->(s)
            
            // Также связываем студента с концепцией
            MATCH (st:Student)-[:SUBMITTED]->(s)
            MERGE (st)-[:KNOWS]->(c)
            
            RETURN s, c
          `, {
            submissionId: submissionId,
            conceptName: conceptName
          });
          linkedCount++;
        } catch (e) {
          // Игнорируем ошибки для отдельных связей
        }
      }
    }
    
    if (linkedCount > 0) {
      console.log(`   ✅ Связано с ${linkedCount} концепциями`);
    }
    return true;
  } catch (error: any) {
    console.error('   ⚠️ Ошибка связывания с концепциями:', error.message);
    return false;
  }
}

/**
 * Получение статистики студента
 */
export async function getStudentStats(studentName: string): Promise<any> {
  if (!session) return null;

  try {
    const studentId = generateStudentId(studentName);
    
    const result = await session.run(`
      MATCH (s:Submission {studentId: $studentId})
      RETURN 
        count(s) as total,
        count(CASE WHEN s.status = 'accepted' THEN 1 END) as accepted,
        count(CASE WHEN s.status = 'rejected' THEN 1 END) as rejected
    `, { studentId });
    
    if (result.records.length === 0) return null;
    
    const record = result.records[0];
    return {
      studentId,
      total: record.get('total').toNumber(),
      accepted: record.get('accepted').toNumber(),
      rejected: record.get('rejected').toNumber()
    };
  } catch (error) {
    return null;
  }
}

/**
 * Проверка существования урока в графе
 */
export async function lessonExists(lessonId: string): Promise<boolean> {
  if (!session) return false;

  try {
    const result = await session.run(`
      MATCH (l:Lesson {id: $lessonId})
      RETURN count(l) as count
    `, { lessonId });
    
    return result.records[0].get('count').toNumber() > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Получение контекста урока для проверки работы
 */
export async function getLessonContext(lessonId: string, submissionText: string): Promise<string> {
  if (!session) return '';

  try {
    // Получаем урок и связанные концепции
    const result = await session.run(`
      MATCH (l:Lesson {id: $lessonId})
      OPTIONAL MATCH (l)-[:HAS_CONCEPT]->(c:Concept)
      RETURN l.title as title, 
             l.summary as summary,
             collect(DISTINCT c.name) as concepts
    `, { lessonId });

    if (result.records.length === 0) return '';

    const record = result.records[0];
    const title = record.get('title');
    const summary = record.get('summary');
    const concepts = record.get('concepts');

    // Ищем похожие принятые работы других студентов
    const similarSubmissions = await session.run(`
      MATCH (s:Submission)-[:FOR_LESSON]->(l:Lesson {id: $lessonId})
      WHERE s.status = 'accepted'
      RETURN s.text as text, s.studentName as studentName
      LIMIT 3
    `, { lessonId });

    let context = `📚 КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ:\n\n`;
    context += `Урок: "${title}"\n\n`;
    context += `Краткое содержание урока:\n${summary}\n\n`;
    
    if (concepts.length > 0) {
      context += `Ключевые концепции урока:\n${concepts.join(', ')}\n\n`;
    }

    if (similarSubmissions.records.length > 0) {
      context += `Примеры успешных работ других студентов:\n`;
      similarSubmissions.records.forEach((rec, idx) => {
        const text = rec.get('text').slice(0, 200);
        context += `${idx + 1}. ${text}...\n`;
      });
      context += `\n`;
    }

    return context;
  } catch (error: any) {
    console.warn('⚠️ Не удалось получить контекст из GraphRAG:', error.message);
    return '';
  }
}

/**
 * Получение рекомендаций для студента на основе его истории
 */
export async function getStudentRecommendations(studentName: string, lessonId: string): Promise<string> {
  if (!session) return '';

  try {
    const studentId = generateStudentId(studentName);
    
    // Получаем статистику студента
    const stats = await getStudentStats(studentName);
    if (!stats) return '';

    // Находим концепции, которые студент еще не использовал
    const result = await session.run(`
      MATCH (l:Lesson {id: $lessonId})-[:HAS_CONCEPT]->(c:Concept)
      WHERE NOT EXISTS {
        MATCH (s:Submission {studentId: $studentId})-[:USES]->(c)
      }
      RETURN c.name as concept
      LIMIT 3
    `, { lessonId, studentId });

    if (result.records.length === 0) return '';

    const unusedConcepts = result.records.map(r => r.get('concept'));
    
    let recommendations = `\n💡 ПЕРСОНАЛЬНЫЕ РЕКОМЕНДАЦИИ:\n`;
    recommendations += `Вы уже сдали ${stats.total} работ (${stats.accepted} принято).\n`;
    
    if (unusedConcepts.length > 0) {
      recommendations += `Обратите внимание на эти концепции из урока: ${unusedConcepts.join(', ')}.\n`;
    }

    return recommendations;
  } catch (error) {
    return '';
  }
}

/**
 * Поиск в базе знаний
 */
export async function searchKnowledge(query: string, limit: number = 5): Promise<any[]> {
  if (!session) return [];
  return KnowledgeBase.searchKnowledge(session, query, limit);
}

/**
 * Поиск по ключевому слову
 */
export async function searchByKeyword(keyword: string, limit: number = 10): Promise<any[]> {
  if (!session) return [];
  return KnowledgeBase.searchByKeyword(session, keyword, limit);
}

/**
 * Форматирование результатов поиска
 */
export function formatSearchResults(results: any[]): string {
  return KnowledgeBase.formatSearchResults(results);
}

/**
 * Простое извлечение ключевых слов из текста
 */
function extractKeywords(text: string): string[] {
  // Список стоп-слов (можно расширить)
  const stopWords = new Set([
    'и', 'в', 'на', 'с', 'по', 'для', 'как', 'что', 'это', 'вы', 'мы',
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with'
  ]);
  
  // Извлекаем слова длиннее 3 символов
  const words = text
    .toLowerCase()
    .match(/[а-яёa-z]{4,}/gi) || [];
  
  // Подсчитываем частоту
  const frequency: Record<string, number> = {};
  words.forEach(word => {
    if (!stopWords.has(word)) {
      frequency[word] = (frequency[word] || 0) + 1;
    }
  });
  
  // Сортируем по частоте и возвращаем топ
  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 20);
}

