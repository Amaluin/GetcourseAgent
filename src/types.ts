import { LessonContent } from './lesson-parser';

export interface HomeworkSubmission {
  id: string;
  studentName: string;
  studentUrl?: string; // Ссылка на профиль студента в GetCourse
  text: string;
  imageUrls: string[];
  fileUrls: string[];
  assignmentTitle: string; // Название тренинга/урока
  lessonId?: string; // ID урока
  idealAnswer?: string; // Идеальный ответ из задания
  taskDescription?: string; // Описание задания
  lessonContent?: LessonContent; // Содержимое урока (выжимка)
}

export interface AIFeedback {
  comment: string; // Текст комментария для студента
  status: 'accept' | 'reject'; // Решение
}


