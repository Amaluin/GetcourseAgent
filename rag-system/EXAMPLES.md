# 📚 Примеры использования RAG системы

## Пример 1: Проверка работы с RAG

```typescript
import { checkHomeworkWithRAG } from './rag-integration';

async function checkWithRAG() {
  const submission = {
    id: 'sub-12345',
    lessonId: '345069174',
    assignmentId: 'assign-67890',
    studentId: 'student-111',
    studentName: 'Иван Петров',
    submissionText: `
      Я настроил GitHub Actions для автоматической сборки проекта.
      Создал workflow файл .github/workflows/build.yml с триггером на push.
      Добавил шаги для установки зависимостей и запуска тестов.
      Все работает, CI проходит успешно.
    `,
    imageUrls: [
      'https://example.com/screenshot1.png',
      'https://example.com/screenshot2.png'
    ],
    fileUrls: []
  };

  const result = await checkHomeworkWithRAG(submission);
  
  console.log('Статус:', result.status);
  console.log('Комментарий:', result.comment);
}

checkWithRAG();
```

**Вывод:**
```
🤖 Проверка работы студента Иван Петров с RAG...
✅ Урок 345069174 найден в кэше
📊 Контекст получен за 234мс (кэш: да)
🔍 Найдено 3 похожих работ
📈 Similarity с идеальным ответом: 87.3%
✅ Принятая работа сохранена в базу знаний

Статус: accept
Комментарий: Здравствуйте, Иван! Отличная работа! Вы правильно настроили...
```

## Пример 2: Сбор базы знаний для урока

```bash
# Базовый сбор
npm run build-knowledge -- --lesson-id=345069174

# С извлечением концепций
npm run build-knowledge -- --lesson-id=345069174 --extract-concepts

# Полный сбор с графом
npm run build-knowledge -- --lesson-id=345069174 --extract-concepts --build-graph
```

**Вывод:**
```
🏗️ Начинаю сбор базы знаний для урока 345069174...
✅ Урок 345069174 найден в кэше
📥 Получаю все работы по уроку...
✅ Найдено 47 работ
✅ Из них принятых: 35
🔄 Векторизую 35 работ...
   Обработано 10/35
   Обработано 20/35
   Обработано 30/35
💾 Сохраняю работы в БД...
🧠 Извлекаю концепции из урока...
   Найдено концепций: 8

✅ База знаний собрана!
   Уроков обработано: 1
   Работ сохранено: 35
   Концепций извлечено: 8
   Время: 45.3с
```

## Пример 3: Поиск похожих работ

```typescript
import { createEmbedding } from './embeddings';
import { findSimilarSubmissions } from './supabase-client';

async function findSimilar() {
  const studentText = "Я настроил Docker для проекта...";
  
  // Создаем embedding
  const embedding = await createEmbedding(studentText);
  
  // Ищем похожие работы
  const similar = await findSimilarSubmissions(
    embedding,
    'assign-67890',
    5 // топ-5
  );

  console.log(`Найдено ${similar.length} похожих работ:`);
  
  similar.forEach((match, i) => {
    console.log(`\n${i + 1}. Студент: ${match.studentName}`);
    console.log(`   Схожесть: ${(match.similarity * 100).toFixed(1)}%`);
    console.log(`   Работа: ${match.submissionText.slice(0, 100)}...`);
    console.log(`   Комментарий: ${match.aiComment.slice(0, 100)}...`);
  });
}

findSimilar();
```

**Вывод:**
```
Найдено 5 похожих работ:

1. Студент: Мария Сидорова
   Схожесть: 92.3%
   Работа: Я настроил Docker для проекта, создал Dockerfile с Node.js образом...
   Комментарий: Здравствуйте, Мария! Отлично! Вы правильно настроили Docker...

2. Студент: Петр Иванов
   Схожесть: 88.7%
   Работа: Настроил Docker контейнер для приложения, добавил docker-compose...
   Комментарий: Здравствуйте, Петр! Хорошая работа! Docker настроен корректно...

...
```

## Пример 4: Кэширование урока

```typescript
import { getLessonFromCache, saveLessonToCache } from './supabase-client';
import { getLessonContent } from '../lesson-parser';
import { createEmbedding } from './embeddings';

async function cacheLesson(page: Page, lessonId: string) {
  // Проверяем кэш
  let lesson = await getLessonFromCache(lessonId);
  
  if (lesson) {
    console.log('✅ Урок найден в кэше');
    console.log(`   Название: ${lesson.title}`);
    console.log(`   Версия: ${lesson.version}`);
    return lesson;
  }

  // Парсим урок
  console.log('📚 Урок не в кэше, парсим...');
  const lessonContent = await getLessonContent(page, lessonId);

  // Создаем embedding
  const text = `${lessonContent.title}\n\n${lessonContent.summary}\n\n${lessonContent.textContent}`;
  const embedding = await createEmbedding(text.slice(0, 8000));

  // Сохраняем в кэш
  await saveLessonToCache({
    id: lessonId,
    title: lessonContent.title,
    url: `https://university.zerocoder.ru/teach/control/lesson/view/id/${lessonId}`,
    contentText: lessonContent.textContent,
    summary: lessonContent.summary,
    videoUrls: lessonContent.videoBlocks.map(v => v.videoUrl),
    imageUrls: lessonContent.imageUrls,
    fileUrls: lessonContent.fileUrls,
    instructions: lessonContent.instructions
  }, embedding);

  console.log('✅ Урок сохранен в кэш');
  
  return await getLessonFromCache(lessonId);
}
```

## Пример 5: Статистика и аналитика

```typescript
import { supabase } from './supabase-client';

async function getAnalytics() {
  // Статистика по урокам
  const { data: lessonStats } = await supabase
    .from('lesson_stats')
    .select('*')
    .order('submissions_count', { ascending: false })
    .limit(10);

  console.log('📊 Топ-10 уроков по количеству работ:');
  lessonStats?.forEach((stat, i) => {
    console.log(`${i + 1}. ${stat.title}`);
    console.log(`   Работ: ${stat.submissions_count}, Принято: ${stat.accepted_count}`);
    console.log(`   Средняя схожесть: ${(stat.avg_similarity * 100).toFixed(1)}%`);
  });

  // Топ концепций
  const { data: concepts } = await supabase
    .from('top_concepts')
    .select('*')
    .limit(10);

  console.log('\n🧠 Топ-10 концепций:');
  concepts?.forEach((concept, i) => {
    console.log(`${i + 1}. ${concept.concept_name} (${concept.category})`);
    console.log(`   Использований: ${concept.usage_count}`);
    console.log(`   Средняя оценка: ${(concept.avg_quality * 100).toFixed(1)}%`);
  });

  // Статистика кэша
  const { data: cacheStats } = await supabase
    .from('cache_stats')
    .select('entity_type, hit_count')
    .order('hit_count', { ascending: false })
    .limit(10);

  console.log('\n💾 Топ-10 кэшированных элементов:');
  cacheStats?.forEach((stat, i) => {
    console.log(`${i + 1}. ${stat.entity_type}: ${stat.hit_count} обращений`);
  });
}

getAnalytics();
```

**Вывод:**
```
📊 Топ-10 уроков по количеству работ:
1. Введение в GitHub Actions
   Работ: 47, Принято: 35
   Средняя схожесть: 82.3%
2. Docker для начинающих
   Работ: 39, Принято: 28
   Средняя схожесть: 78.9%
...

🧠 Топ-10 концепций:
1. GitHub Actions (tool)
   Использований: 47
   Средняя оценка: 85.2%
2. Docker (platform)
   Использований: 39
   Средняя оценка: 81.7%
...

💾 Топ-10 кэшированных элементов:
1. lesson: 127 обращений
2. lesson: 89 обращений
...
```

## Пример 6: Вычисление схожести работ

```typescript
import { createEmbedding, cosineSimilarity } from './embeddings';

async function compareSubmissions() {
  const submission1 = "Я настроил GitHub Actions для CI/CD...";
  const submission2 = "Создал workflow для автоматической сборки...";
  const submission3 = "Настроил Docker контейнер для приложения...";

  // Создаем embeddings
  const emb1 = await createEmbedding(submission1);
  const emb2 = await createEmbedding(submission2);
  const emb3 = await createEmbedding(submission3);

  // Вычисляем схожесть
  const sim12 = cosineSimilarity(emb1, emb2);
  const sim13 = cosineSimilarity(emb1, emb3);
  const sim23 = cosineSimilarity(emb2, emb3);

  console.log('Схожесть работ:');
  console.log(`Работа 1 ↔ Работа 2: ${(sim12 * 100).toFixed(1)}%`);
  console.log(`Работа 1 ↔ Работа 3: ${(sim13 * 100).toFixed(1)}%`);
  console.log(`Работа 2 ↔ Работа 3: ${(sim23 * 100).toFixed(1)}%`);
}

compareSubmissions();
```

**Вывод:**
```
Схожесть работ:
Работа 1 ↔ Работа 2: 89.3%  (обе про GitHub Actions)
Работа 1 ↔ Работа 3: 45.7%  (разные темы)
Работа 2 ↔ Работа 3: 42.1%  (разные темы)
```

## Пример 7: Батч-обработка работ

```typescript
import { batchCreateEmbeddings } from './embeddings';
import { saveSubmission } from './supabase-client';

async function batchProcess(submissions: any[]) {
  console.log(`🔄 Обработка ${submissions.length} работ батчами...`);

  // Создаем embeddings батчами по 10
  const texts = submissions.map(s => s.submissionText);
  const embeddings = await batchCreateEmbeddings(texts, 10);

  // Сохраняем в БД
  for (let i = 0; i < submissions.length; i++) {
    const submission = submissions[i];
    const embedding = embeddings[i];

    await saveSubmission(
      {
        id: submission.id,
        assignmentId: submission.assignmentId,
        lessonId: submission.lessonId,
        studentId: submission.studentId,
        studentName: submission.studentName,
        submissionText: submission.submissionText,
        imageUrls: submission.imageUrls || [],
        fileUrls: submission.fileUrls || []
      },
      embedding,
      submission.status,
      submission.aiComment
    );

    if ((i + 1) % 10 === 0) {
      console.log(`   Обработано ${i + 1}/${submissions.length}`);
    }
  }

  console.log('✅ Батч-обработка завершена');
}
```

## Пример 8: Обновление устаревшего кэша

```typescript
import { supabase } from './supabase-client';
import { getLessonContent } from '../lesson-parser';
import { createEmbedding } from './embeddings';

async function refreshStaleCache(page: Page) {
  // Находим уроки, которые не обновлялись больше 30 дней
  const { data: staleLessons } = await supabase
    .from('lessons')
    .select('id, title, updated_at')
    .lt('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  console.log(`🔄 Найдено ${staleLessons?.length || 0} устаревших уроков`);

  for (const lesson of staleLessons || []) {
    console.log(`   Обновляю урок: ${lesson.title}`);

    // Парсим заново
    const lessonContent = await getLessonContent(page, lesson.id);
    
    // Создаем новый embedding
    const text = `${lessonContent.title}\n\n${lessonContent.summary}\n\n${lessonContent.textContent}`;
    const embedding = await createEmbedding(text.slice(0, 8000));

    // Обновляем в БД
    await supabase
      .from('lessons')
      .update({
        content_text: lessonContent.textContent,
        summary: lessonContent.summary,
        embedding: embedding,
        updated_at: new Date().toISOString()
      })
      .eq('id', lesson.id);
  }

  console.log('✅ Кэш обновлен');
}
```

## Пример 9: Экспорт данных для анализа

```typescript
import { supabase } from './supabase-client';
import * as fs from 'fs';

async function exportData() {
  // Экспортируем все принятые работы
  const { data: submissions } = await supabase
    .from('student_submissions')
    .select(`
      id,
      student_name,
      submission_text,
      similarity_to_ideal,
      created_at,
      lessons (title),
      assignments (title)
    `)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false });

  // Сохраняем в JSON
  fs.writeFileSync(
    'export-accepted-submissions.json',
    JSON.stringify(submissions, null, 2)
  );

  console.log(`✅ Экспортировано ${submissions?.length} работ`);

  // Экспортируем статистику в CSV
  const { data: stats } = await supabase
    .from('lesson_stats')
    .select('*');

  const csv = [
    'ID,Title,Submissions,Accepted,Avg Similarity',
    ...stats!.map(s => 
      `${s.id},"${s.title}",${s.submissions_count},${s.accepted_count},${s.avg_similarity}`
    )
  ].join('\n');

  fs.writeFileSync('export-lesson-stats.csv', csv);

  console.log('✅ Статистика экспортирована в CSV');
}

exportData();
```

## Пример 10: Мониторинг производительности

```typescript
import { supabase } from './supabase-client';

async function monitorPerformance() {
  console.log('📊 Мониторинг производительности RAG системы\n');

  // 1. Размер БД
  const { data: dbSize } = await supabase.rpc('pg_database_size', {
    database_name: 'postgres'
  });
  console.log(`💾 Размер БД: ${(dbSize / 1024 / 1024).toFixed(2)} MB`);

  // 2. Количество записей
  const tables = ['lessons', 'assignments', 'student_submissions', 'lesson_concepts'];
  for (const table of tables) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    console.log(`   ${table}: ${count} записей`);
  }

  // 3. Cache hit rate
  const { data: cacheStats } = await supabase
    .from('cache_stats')
    .select('hit_count');
  
  const totalHits = cacheStats?.reduce((sum, s) => sum + s.hit_count, 0) || 0;
  console.log(`\n💾 Всего обращений к кэшу: ${totalHits}`);

  // 4. Средняя схожесть
  const { data: avgSim } = await supabase
    .from('student_submissions')
    .select('similarity_to_ideal')
    .not('similarity_to_ideal', 'is', null);

  const avgSimilarity = avgSim?.reduce((sum, s) => sum + s.similarity_to_ideal, 0) / avgSim.length;
  console.log(`📈 Средняя схожесть с идеалом: ${(avgSimilarity * 100).toFixed(1)}%`);

  // 5. Топ студентов
  const { data: topStudents } = await supabase
    .from('student_submissions')
    .select('student_name, similarity_to_ideal')
    .eq('status', 'accepted')
    .order('similarity_to_ideal', { ascending: false })
    .limit(5);

  console.log('\n🏆 Топ-5 студентов по качеству работ:');
  topStudents?.forEach((s, i) => {
    console.log(`${i + 1}. ${s.student_name}: ${(s.similarity_to_ideal * 100).toFixed(1)}%`);
  });
}

monitorPerformance();
```

---

## Полезные SQL запросы

### Найти дубликаты работ
```sql
SELECT 
  s1.id, 
  s2.id, 
  s1.student_name,
  s2.student_name,
  1 - (s1.embedding <=> s2.embedding) as similarity
FROM student_submissions s1
JOIN student_submissions s2 ON s1.id < s2.id
WHERE 
  s1.assignment_id = s2.assignment_id
  AND 1 - (s1.embedding <=> s2.embedding) > 0.95
ORDER BY similarity DESC;
```

### Найти студентов с самыми оригинальными решениями
```sql
WITH avg_similarities AS (
  SELECT 
    s1.id,
    s1.student_name,
    AVG(1 - (s1.embedding <=> s2.embedding)) as avg_sim
  FROM student_submissions s1
  JOIN student_submissions s2 ON s1.id != s2.id AND s1.assignment_id = s2.assignment_id
  WHERE s1.status = 'accepted'
  GROUP BY s1.id, s1.student_name
)
SELECT * FROM avg_similarities
ORDER BY avg_sim ASC
LIMIT 10;
```

### Найти уроки, требующие обновления кэша
```sql
SELECT 
  id,
  title,
  updated_at,
  EXTRACT(DAY FROM NOW() - updated_at) as days_old
FROM lessons
WHERE updated_at < NOW() - INTERVAL '30 days'
ORDER BY updated_at ASC;
```




