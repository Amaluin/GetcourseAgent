export interface HomeworkSubmission {
  id: string;
  studentName: string;
  text: string;
  imageUrls: string[];
  fileUrls: string[];
  assignmentTitle: string; // Название тренинга/урока
  idealAnswer?: string; // Идеальный ответ из задания
  taskDescription?: string; // Описание задания
}

export interface AIFeedback {
  comment: string; // Текст комментария для студента
  status: 'accept' | 'reject'; // Решение
}


