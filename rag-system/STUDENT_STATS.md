# 📊 Статистика студентов в GraphRAG

## 🎯 Обзор

После интеграции GraphRAG система собирает и анализирует данные о каждом студенте:
- Все сданные работы (принятые и отклоненные)
- Использованные концепции и технологии
- Пройденные уроки
- Схожесть работ с идеальными ответами
- Прогресс обучения

## 🔑 ID студента

Каждый студент получает уникальный ID при первой сдаче работы:

```typescript
const studentId = crypto
  .createHash('md5')
  .update(studentName + studentEmail)
  .digest('hex')
  .slice(0, 16);
```

**Пример**: `a1b2c3d4e5f6g7h8`

## 📈 Получение статистики

### 1️⃣ Из Neo4j (Граф знаний)

#### Общая статистика студента

```cypher
MATCH (s:Submission {studentId: 'a1b2c3d4e5f6g7h8'})
RETURN 
  count(s) as total_submissions,
  count(CASE WHEN s.status = 'accepted' THEN 1 END) as accepted,
  count(CASE WHEN s.status = 'rejected' THEN 1 END) as rejected,
  (count(CASE WHEN s.status = 'accepted' THEN 1 END) * 100.0 / count(s)) as acceptance_rate
```

#### Использованные концепции

```cypher
MATCH (s:Submission {studentId: 'a1b2c3d4e5f6g7h8'})-[:USES]->(c:Concept)
RETURN c.name as concept, count(s) as usage_count
ORDER BY usage_count DESC
```

#### Пройденные уроки

```cypher
MATCH (s:Submission {studentId: 'a1b2c3d4e5f6g7h8'})-[:FOR_LESSON]->(l:Lesson)
WHERE s.status = 'accepted'
RETURN DISTINCT l.id, l.title
ORDER BY l.title
```

#### Прогресс по времени

```cypher
MATCH (s:Submission {studentId: 'a1b2c3d4e5f6g7h8'})
RETURN s.submittedAt as date, s.status as status
ORDER BY s.submittedAt
```

#### Похожие студенты (по использованным концепциям)

```cypher
MATCH (s1:Submission {studentId: 'a1b2c3d4e5f6g7h8'})-[:USES]->(c:Concept)<-[:USES]-(s2:Submission)
WHERE s1.studentId <> s2.studentId
RETURN s2.studentId, s2.studentName, count(DISTINCT c) as common_concepts
ORDER BY common_concepts DESC
LIMIT 5
```

### 2️⃣ Из Supabase (Векторная БД)

#### TypeScript API

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Получить все работы студента
const { data: submissions } = await supabase
  .from('student_submissions')
  .select('*')
  .eq('student_id', 'a1b2c3d4e5f6g7h8')
  .order('created_at', { ascending: false });

// Статистика
const total = submissions.length;
const accepted = submissions.filter(s => s.status === 'accepted').length;
const avgSimilarity = submissions.reduce((sum, s) => 
  sum + (s.similarity_to_ideal || 0), 0) / total;

console.log(`Всего работ: ${total}`);
console.log(`Принято: ${accepted} (${(accepted / total * 100).toFixed(1)}%)`);
console.log(`Средняя схожесть с идеалом: ${(avgSimilarity * 100).toFixed(1)}%`);
```

#### Поиск похожих работ (векторный поиск)

```typescript
// Получить embedding текущей работы
const currentSubmission = await supabase
  .from('student_submissions')
  .select('embedding')
  .eq('id', 'submission-123')
  .single();

// Найти похожие работы других студентов
const { data: similarSubmissions } = await supabase.rpc(
  'match_submissions',
  {
    query_embedding: currentSubmission.embedding,
    match_threshold: 0.8,
    match_count: 5
  }
);

console.log('Похожие работы:', similarSubmissions);
```

## 🎨 Визуализация статистики

### Neo4j Browser

Откройте http://localhost:7474 и выполните:

```cypher
// Граф студента
MATCH path = (s:Submission {studentId: 'a1b2c3d4e5f6g7h8'})-[*1..2]-(n)
RETURN path
LIMIT 50
```

### Grafana + Neo4j

1. Установите Grafana:
```bash
docker run -d -p 3000:3000 --name grafana grafana/grafana
```

2. Добавьте Neo4j Data Source (плагин: `hadesarchitect-neo4j-datasource`)

3. Создайте дашборд с панелями:
   - **Acceptance Rate**: процент принятых работ
   - **Concepts Timeline**: использование концепций по времени
   - **Progress Chart**: количество работ по неделям

## 🤖 Использование статистики для проверки

### Персонализированная обратная связь

```typescript
import { GraphitiClient } from './graphiti_client';

const graphiti = new GraphitiClient();

async function checkHomeworkWithStats(submission: any): Promise<any> {
  // Получаем статистику студента
  const stats = await graphiti.getStudentStats(submission.studentId);
  
  // Формируем контекст для AI
  const context = `
    Студент: ${submission.studentName}
    Всего работ: ${stats.total}
    Принято: ${stats.accepted}
    Процент успеха: ${stats.acceptanceRate}%
    
    Знакомые концепции: ${stats.concepts.join(', ')}
    Пройденные уроки: ${stats.lessons.map(l => l.title).join(', ')}
    
    Текущая работа:
    ${submission.text}
  `;
  
  // Отправляем в AI с учетом истории студента
  const feedback = await checkWithAI(context);
  
  // Если студент новичок (< 3 работ) - даем более подробные советы
  if (stats.total < 3) {
    feedback.comment += '\n\nПодсказка для новичка: ' + getBeginnerTip();
  }
  
  // Если студент опытный (> 10 работ) - ожидаем более высокого качества
  if (stats.total > 10 && stats.acceptanceRate > 80) {
    feedback.comment += '\n\nВы уже опытный студент! Попробуйте добавить...';
  }
  
  return feedback;
}
```

### Рекомендации на основе похожих студентов

```typescript
async function getRecommendations(studentId: string): Promise<string[]> {
  // Находим похожих студентов
  const similarStudents = await graphiti.findSimilarStudents(studentId, 5);
  
  // Смотрим, какие концепции они освоили, а текущий студент - нет
  const recommendations: string[] = [];
  
  for (const similar of similarStudents) {
    const theirConcepts = await graphiti.getStudentConcepts(similar.id);
    const myConcepts = await graphiti.getStudentConcepts(studentId);
    
    const newConcepts = theirConcepts.filter(c => !myConcepts.includes(c));
    recommendations.push(...newConcepts);
  }
  
  return [...new Set(recommendations)]; // Уникальные
}
```

## 📊 Примеры запросов

### Топ студентов по количеству принятых работ

```cypher
MATCH (s:Submission)
WHERE s.status = 'accepted'
RETURN s.studentId, s.studentName, count(s) as accepted_count
ORDER BY accepted_count DESC
LIMIT 10
```

### Самые популярные концепции

```cypher
MATCH (s:Submission)-[:USES]->(c:Concept)
RETURN c.name, count(s) as usage_count
ORDER BY usage_count DESC
LIMIT 10
```

### Студенты, которым нужна помощь (низкий процент принятия)

```cypher
MATCH (s:Submission)
WITH s.studentId as id, s.studentName as name,
     count(s) as total,
     count(CASE WHEN s.status = 'accepted' THEN 1 END) as accepted
WHERE total >= 3
WITH id, name, total, accepted, (accepted * 100.0 / total) as rate
WHERE rate < 50
RETURN id, name, total, accepted, rate
ORDER BY rate ASC
```

### Прогресс студента по неделям

```cypher
MATCH (s:Submission {studentId: 'a1b2c3d4e5f6g7h8'})
WITH s, date(s.submittedAt) as submission_date
WITH date.truncate('week', submission_date) as week, count(s) as count
RETURN week, count
ORDER BY week
```

## 🔄 Обновление статистики в реальном времени

```typescript
// В основном скрипте проверки (src/index.ts)
import { GraphitiClient } from './graphrag/graphiti_client';

const graphiti = new GraphitiClient();

for (const submission of submissions) {
  // Проверяем работу
  const feedback = await checkHomework(submission);
  
  // Сохраняем результат в граф
  await graphiti.addSubmission({
    id: submission.submissionId,
    lessonId: submission.lessonId,
    assignmentId: submission.assignmentId,
    studentId: submission.studentId,
    studentName: submission.studentName,
    text: submission.submissionText,
    status: feedback.status,
    imageUrls: submission.imageUrls,
    submittedAt: new Date().toISOString()
  });
  
  // Обновляем статистику студента
  const stats = await graphiti.getStudentStats(submission.studentId);
  console.log(`📊 ${submission.studentName}: ${stats.accepted}/${stats.total} работ принято`);
}
```

## 🎯 Следующие шаги

1. **Запустите тест**: `ts-node rag-system/test-single-submission.ts`
2. **Проверьте статистику**: Откройте Neo4j Browser и выполните запросы выше
3. **Интегрируйте в основной скрипт**: Добавьте сбор статистики в `src/index.ts`
4. **Создайте дашборд**: Настройте Grafana для визуализации прогресса студентов
5. **Персонализируйте проверку**: Используйте статистику для адаптации обратной связи

## 📚 Дополнительные ресурсы

- [Neo4j Cypher Manual](https://neo4j.com/docs/cypher-manual/current/)
- [Supabase Vector Search](https://supabase.com/docs/guides/ai/vector-search)
- [Grafana Neo4j Plugin](https://grafana.com/grafana/plugins/hadesarchitect-neo4j-datasource/)

---

**Готово!** Теперь у вас есть полная статистика по каждому студенту! 🎉



