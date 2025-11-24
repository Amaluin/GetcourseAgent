/**
 * Клиент для работы с Supabase
 * 
 * Пример использования:
 * const lesson = await getLessonFromCache('345069174');
 * await saveLessonToCache(lessonData);
 * const similar = await findSimilarSubmissions(embedding, assignmentId);
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  Lesson, 
  LessonInput, 
  Assignment, 
  AssignmentInput,
  StudentSubmission,
  SubmissionInput,
  LessonMatch,
  SubmissionMatch,
  ConceptMatch
} from './types';

// Конфигурация
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const SIMILARITY_THRESHOLD = parseFloat(process.env.SIMILARITY_THRESHOLD || '0.7');

// Создаем клиент Supabase
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// LESSONS (Уроки)
// ============================================

/**
 * Получить урок из кэша по ID
 */
export async function getLessonFromCache(lessonId: string): Promise<Lesson | null> {
  try {
    const { data, error } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Урок не найден
        return null;
      }
      throw error;
    }

    // Обновляем статистику кэша
    await updateCacheStats('lesson', lessonId);

    return data as Lesson;
  } catch (error) {
    console.error('❌ Ошибка при получении урока из кэша:', error);
    return null;
  }
}

/**
 * Сохранить урок в кэш
 */
export async function saveLessonToCache(
  lesson: LessonInput,
  embedding: number[]
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('lessons')
      .upsert({
        id: lesson.id,
        title: lesson.title,
        url: lesson.url,
        content_text: lesson.contentText,
        summary: lesson.summary,
        embedding: embedding,
        video_urls: lesson.videoUrls || [],
        image_urls: lesson.imageUrls || [],
        file_urls: lesson.fileUrls || [],
        instructions: lesson.instructions || [],
        updated_at: new Date().toISOString()
      });

    if (error) throw error;

    console.log(`✅ Урок ${lesson.id} сохранен в кэш`);
    return true;
  } catch (error) {
    console.error('❌ Ошибка при сохранении урока в кэш:', error);
    return false;
  }
}

/**
 * Найти похожие уроки
 */
export async function findSimilarLessons(
  queryEmbedding: number[],
  limit: number = 5
): Promise<LessonMatch[]> {
  try {
    const { data, error } = await supabase.rpc('match_lessons', {
      query_embedding: queryEmbedding,
      match_threshold: SIMILARITY_THRESHOLD,
      match_count: limit
    });

    if (error) throw error;

    return data as LessonMatch[];
  } catch (error) {
    console.error('❌ Ошибка при поиске похожих уроков:', error);
    return [];
  }
}

// ============================================
// ASSIGNMENTS (Задания)
// ============================================

/**
 * Получить задание по ID
 */
export async function getAssignment(assignmentId: string): Promise<Assignment | null> {
  try {
    const { data, error } = await supabase
      .from('assignments')
      .select('*')
      .eq('id', assignmentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data as Assignment;
  } catch (error) {
    console.error('❌ Ошибка при получении задания:', error);
    return null;
  }
}

/**
 * Сохранить задание
 */
export async function saveAssignment(
  assignment: AssignmentInput,
  embedding: number[]
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('assignments')
      .upsert({
        id: assignment.id,
        lesson_id: assignment.lessonId,
        title: assignment.title,
        description: assignment.description,
        ideal_answer: assignment.idealAnswer,
        requirements: assignment.requirements || [],
        embedding: embedding
      });

    if (error) throw error;

    console.log(`✅ Задание ${assignment.id} сохранено`);
    return true;
  } catch (error) {
    console.error('❌ Ошибка при сохранении задания:', error);
    return false;
  }
}

// ============================================
// STUDENT SUBMISSIONS (Работы студентов)
// ============================================

/**
 * Получить работу студента по ID
 */
export async function getSubmission(submissionId: string): Promise<StudentSubmission | null> {
  try {
    const { data, error } = await supabase
      .from('student_submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data as StudentSubmission;
  } catch (error) {
    console.error('❌ Ошибка при получении работы:', error);
    return null;
  }
}

/**
 * Сохранить работу студента
 */
export async function saveSubmission(
  submission: SubmissionInput,
  embedding: number[],
  status: 'accepted' | 'rejected' | 'pending',
  aiComment?: string,
  similarityToIdeal?: number
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('student_submissions')
      .upsert({
        id: submission.id,
        assignment_id: submission.assignmentId,
        lesson_id: submission.lessonId,
        student_id: submission.studentId,
        student_name: submission.studentName,
        submission_text: submission.submissionText,
        image_urls: submission.imageUrls || [],
        file_urls: submission.fileUrls || [],
        status: status,
        ai_comment: aiComment,
        embedding: embedding,
        similarity_to_ideal: similarityToIdeal,
        checked_at: new Date().toISOString()
      });

    if (error) throw error;

    console.log(`✅ Работа ${submission.id} сохранена (${status})`);
    return true;
  } catch (error) {
    console.error('❌ Ошибка при сохранении работы:', error);
    return false;
  }
}

/**
 * Найти похожие принятые работы
 */
export async function findSimilarSubmissions(
  queryEmbedding: number[],
  assignmentId: string,
  limit: number = 5
): Promise<SubmissionMatch[]> {
  try {
    const { data, error } = await supabase.rpc('match_accepted_submissions', {
      query_embedding: queryEmbedding,
      target_assignment_id: assignmentId,
      match_threshold: SIMILARITY_THRESHOLD,
      match_count: limit
    });

    if (error) throw error;

    return data as SubmissionMatch[];
  } catch (error) {
    console.error('❌ Ошибка при поиске похожих работ:', error);
    return [];
  }
}

/**
 * Получить все принятые работы по заданию
 */
export async function getAcceptedSubmissions(
  assignmentId: string
): Promise<StudentSubmission[]> {
  try {
    const { data, error } = await supabase
      .from('student_submissions')
      .select('*')
      .eq('assignment_id', assignmentId)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data as StudentSubmission[];
  } catch (error) {
    console.error('❌ Ошибка при получении принятых работ:', error);
    return [];
  }
}

// ============================================
// CONCEPTS (Концепции)
// ============================================

/**
 * Найти концепции в тексте
 */
export async function findRelatedConcepts(
  queryEmbedding: number[],
  limit: number = 10
): Promise<ConceptMatch[]> {
  try {
    const { data, error } = await supabase.rpc('match_concepts', {
      query_embedding: queryEmbedding,
      match_threshold: 0.8, // Более высокий порог для концепций
      match_count: limit
    });

    if (error) throw error;

    return data as ConceptMatch[];
  } catch (error) {
    console.error('❌ Ошибка при поиске концепций:', error);
    return [];
  }
}

// ============================================
// CACHE STATS (Статистика кэша)
// ============================================

/**
 * Обновить статистику использования кэша
 */
async function updateCacheStats(
  entityType: 'lesson' | 'assignment' | 'submission',
  entityId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('cache_stats')
      .upsert({
        entity_type: entityType,
        entity_id: entityId,
        last_accessed: new Date().toISOString()
      }, {
        onConflict: 'entity_type,entity_id'
      });

    if (error) throw error;
  } catch (error) {
    // Не критично, просто логируем
    console.warn('⚠️ Не удалось обновить статистику кэша:', error);
  }
}

/**
 * Получить статистику по урокам
 */
export async function getLessonStats() {
  try {
    const { data, error } = await supabase
      .from('lesson_stats')
      .select('*')
      .order('submissions_count', { ascending: false })
      .limit(20);

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('❌ Ошибка при получении статистики:', error);
    return [];
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Проверить подключение к Supabase
 */
export async function testConnection(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('lessons')
      .select('id')
      .limit(1);

    if (error) throw error;

    console.log('✅ Подключение к Supabase успешно');
    return true;
  } catch (error) {
    console.error('❌ Ошибка подключения к Supabase:', error);
    return false;
  }
}

/**
 * Пример использования
 */
async function example() {
  // Проверка подключения
  await testConnection();

  // Получение урока из кэша
  const lesson = await getLessonFromCache('345069174');
  if (lesson) {
    console.log(`Урок найден: ${lesson.title}`);
  } else {
    console.log('Урок не найден в кэше');
  }

  // Поиск похожих работ (нужен embedding)
  // const embedding = await createEmbedding("текст работы студента");
  // const similar = await findSimilarSubmissions(embedding, 'assignment-123', 5);
  // console.log(`Найдено ${similar.length} похожих работ`);

  // Статистика
  const stats = await getLessonStats();
  console.log('Топ уроков по количеству работ:', stats);
}

// Раскомментируйте для тестирования
// example();




