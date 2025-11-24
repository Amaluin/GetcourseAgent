#!/usr/bin/env ts-node
/**
 * Простой тест Neo4j с использованием JavaScript драйвера
 * Создает тестовые данные: урок, работу студента, концепции и связи
 */

import neo4j, { Driver, Session } from 'neo4j-driver';
import axios from 'axios';
import * as crypto from 'crypto';
import 'dotenv/config';

// Конфигурация
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

// Цвета для логов
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

// Тестовые данные
const testLesson = {
  id: 'test-lesson-001',
  title: 'Введение в GitHub Actions',
  content: 'GitHub Actions - это платформа для автоматизации рабочих процессов разработки. Вы можете создавать workflow для CI/CD, тестирования и деплоя.',
  summary: 'Урок о создании автоматизированных workflow в GitHub Actions для CI/CD процессов.'
};

const testSubmission = {
  id: 'test-submission-001',
  lessonId: 'test-lesson-001',
  assignmentId: 'test-assignment-001',
  studentId: 'test-student-001',
  studentName: 'Иван Тестовый',
  text: 'Я создал GitHub Actions workflow с автоматическими тестами. Настроил CI/CD pipeline.',
  status: 'accepted'
};

const concepts = [
  { name: 'GitHub Actions', description: 'Платформа автоматизации' },
  { name: 'Workflow', description: 'Автоматизированный процесс' },
  { name: 'CI/CD', description: 'Непрерывная интеграция и доставка' },
  { name: 'Runner', description: 'Среда выполнения workflow' }
];

// Neo4j драйвер
let driver: Driver;
let session: Session;

async function initNeo4j(): Promise<void> {
  driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );
  session = driver.session();
}

async function closeNeo4j(): Promise<void> {
  if (session) await session.close();
  if (driver) await driver.close();
}

// Проверка Ollama
async function checkOllama(): Promise<boolean> {
  log('\n🔍 Проверяю Ollama...', 'cyan');
  
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`);
    const models = response.data.models || [];
    const hasModel = models.some((m: any) => m.name.includes(OLLAMA_MODEL));
    
    if (hasModel) {
      log(`✅ Ollama запущен, модель ${OLLAMA_MODEL} найдена`, 'green');
      return true;
    } else {
      log(`⚠️ Модель ${OLLAMA_MODEL} не найдена`, 'yellow');
      log(`   Установите: ollama pull ${OLLAMA_MODEL}`, 'yellow');
      return false;
    }
  } catch (error) {
    log('❌ Ollama не запущен или недоступен', 'red');
    log('   Запустите: ollama serve', 'yellow');
    return false;
  }
}

// Проверка Neo4j
async function checkNeo4j(): Promise<boolean> {
  log('\n🔍 Проверяю Neo4j...', 'cyan');
  
  try {
    await initNeo4j();
    await session.run('RETURN 1');
    log('✅ Neo4j запущен и доступен', 'green');
    return true;
  } catch (error: any) {
    log('❌ Не удалось подключиться к Neo4j: ' + error.message, 'red');
    log('   Запустите: docker run -d --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest', 'yellow');
    return false;
  }
}

// Создание embedding
async function createEmbedding(text: string): Promise<number[]> {
  const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
    model: OLLAMA_MODEL,
    prompt: text.slice(0, 8000)
  });
  return response.data.embedding;
}

// Тест embeddings
async function testEmbeddings(): Promise<void> {
  log('\n🧪 Тестирую Ollama embeddings...', 'cyan');
  
  const texts = [testLesson.summary, testSubmission.text.slice(0, 200)];
  
  for (let i = 0; i < texts.length; i++) {
    const start = Date.now();
    const embedding = await createEmbedding(texts[i]);
    const time = Date.now() - start;
    log(`  ✅ Embedding ${i + 1}: размерность ${embedding.length}, время ${time}ms`, 'green');
  }
}

// Добавление урока
async function addLesson(): Promise<void> {
  log('\n📚 Добавляю урок в граф...', 'cyan');
  
  try {
    await session.run(`
      MERGE (l:Lesson {id: $id})
      SET l.title = $title,
          l.content = $content,
          l.summary = $summary,
          l.created_at = datetime()
      RETURN l
    `, testLesson);
    
    log(`✅ Урок "${testLesson.title}" добавлен`, 'green');
  } catch (error: any) {
    log('❌ Ошибка: ' + error.message, 'red');
  }
}

// Добавление работы студента
async function addSubmission(): Promise<void> {
  log('\n📝 Добавляю работу студента в граф...', 'cyan');
  
  try {
    await session.run(`
      MATCH (l:Lesson {id: $lessonId})
      MERGE (s:Submission {id: $id})
      SET s.studentId = $studentId,
          s.studentName = $studentName,
          s.text = $text,
          s.status = $status,
          s.created_at = datetime()
      MERGE (s)-[:FOR_LESSON]->(l)
      RETURN s
    `, testSubmission);
    
    log(`✅ Работа студента "${testSubmission.studentName}" добавлена`, 'green');
  } catch (error: any) {
    log('❌ Ошибка: ' + error.message, 'red');
  }
}

// Добавление концепций
async function addConcepts(): Promise<void> {
  log('\n🧠 Добавляю концепции в граф...', 'cyan');
  
  for (const concept of concepts) {
    try {
      await session.run(`
        MERGE (c:Concept {name: $name})
        SET c.description = $description,
            c.created_at = datetime()
        WITH c
        MATCH (l:Lesson {id: $lessonId})
        MERGE (l)-[:HAS_CONCEPT]->(c)
        RETURN c
      `, {
        name: concept.name,
        description: concept.description,
        lessonId: testLesson.id
      });
      
      log(`  ✅ Концепция: ${concept.name}`, 'green');
    } catch (error: any) {
      log(`  ⚠️ Не удалось добавить: ${concept.name}`, 'yellow');
    }
  }
}

// Связывание работы с концепциями
async function linkSubmissionToConcepts(): Promise<void> {
  log('\n🔗 Связываю работу с концепциями...', 'cyan');
  
  const conceptMentions = [
    { name: 'GitHub Actions', mentioned: testSubmission.text.includes('GitHub Actions') },
    { name: 'Workflow', mentioned: testSubmission.text.includes('workflow') },
    { name: 'CI/CD', mentioned: testSubmission.text.includes('CI/CD') }
  ];
  
  for (const { name, mentioned } of conceptMentions) {
    if (!mentioned) continue;
    
    try {
      await session.run(`
        MATCH (s:Submission {id: $submissionId})
        MATCH (c:Concept {name: $conceptName})
        MERGE (s)-[:USES]->(c)
        RETURN s, c
      `, {
        submissionId: testSubmission.id,
        conceptName: name
      });
      
      log(`  ✅ Связь: ${testSubmission.studentName} → ${name}`, 'green');
    } catch (error: any) {
      log(`  ⚠️ Не удалось создать связь с ${name}`, 'yellow');
    }
  }
}

// Проверка данных
async function checkData(): Promise<void> {
  log('\n🔍 Проверяю данные в графе...', 'cyan');
  
  try {
    const result = await session.run(`
      MATCH (l:Lesson) WITH count(l) as lessons
      MATCH (s:Submission) WITH lessons, count(s) as submissions
      MATCH (c:Concept) WITH lessons, submissions, count(c) as concepts
      MATCH ()-[r]->() WITH lessons, submissions, concepts, count(r) as relationships
      RETURN lessons, submissions, concepts, relationships
    `);
    
    const record = result.records[0];
    log(`  Уроков: ${record.get('lessons')}`, 'bright');
    log(`  Работ студентов: ${record.get('submissions')}`, 'bright');
    log(`  Концепций: ${record.get('concepts')}`, 'bright');
    log(`  Связей: ${record.get('relationships')}`, 'bright');
  } catch (error: any) {
    log('  ⚠️ Ошибка проверки: ' + error.message, 'yellow');
  }
}

// Статистика студента
async function getStudentStats(): Promise<void> {
  log('\n📊 Статистика студента "' + testSubmission.studentName + '":', 'cyan');
  log('   ID: ' + testSubmission.studentId, 'bright');
  
  try {
    // Общая статистика
    const statsResult = await session.run(`
      MATCH (s:Submission {studentId: $studentId})
      RETURN 
        count(s) as total,
        count(CASE WHEN s.status = 'accepted' THEN 1 END) as accepted,
        count(CASE WHEN s.status = 'rejected' THEN 1 END) as rejected
    `, { studentId: testSubmission.studentId });
    
    const stats = statsResult.records[0];
    log(`\n  📈 Статистика:`, 'blue');
    log(`    Всего работ: ${stats.get('total')}`, 'bright');
    log(`    Принято: ${stats.get('accepted')}`, 'bright');
    log(`    Отклонено: ${stats.get('rejected')}`, 'bright');
    
    // Использованные концепции
    const conceptsResult = await session.run(`
      MATCH (s:Submission {studentId: $studentId})-[:USES]->(c:Concept)
      RETURN c.name as concept
      ORDER BY c.name
    `, { studentId: testSubmission.studentId });
    
    if (conceptsResult.records.length > 0) {
      log(`\n  🧠 Использованные концепции:`, 'blue');
      conceptsResult.records.forEach(record => {
        log(`    - ${record.get('concept')}`, 'bright');
      });
    }
    
    // Пройденные уроки
    const lessonsResult = await session.run(`
      MATCH (s:Submission {studentId: $studentId})-[:FOR_LESSON]->(l:Lesson)
      RETURN DISTINCT l.title as lesson
      ORDER BY lesson
    `, { studentId: testSubmission.studentId });
    
    if (lessonsResult.records.length > 0) {
      log(`\n  📚 Пройденные уроки:`, 'blue');
      lessonsResult.records.forEach(record => {
        log(`    - ${record.get('lesson')}`, 'bright');
      });
    }
  } catch (error: any) {
    log('  ⚠️ Ошибка получения статистики: ' + error.message, 'yellow');
  }
}

// Главная функция
async function main() {
  log('\n' + '='.repeat(70), 'bright');
  log('🧪 ТЕСТ NEO4J + GRAPHRAG', 'bright');
  log('='.repeat(70) + '\n', 'bright');
  
  // Проверка зависимостей
  const ollamaOk = await checkOllama();
  const neo4jOk = await checkNeo4j();
  
  if (!ollamaOk || !neo4jOk) {
    log('\n❌ Не все зависимости запущены. Исправьте ошибки и попробуйте снова.', 'red');
    await closeNeo4j();
    process.exit(1);
  }
  
  // Тест embeddings
  await testEmbeddings();
  
  // Добавление данных
  await addLesson();
  await addSubmission();
  await addConcepts();
  await linkSubmissionToConcepts();
  
  // Проверка результатов
  await checkData();
  await getStudentStats();
  
  // Закрываем соединение
  await closeNeo4j();
  
  log('\n' + '='.repeat(70), 'bright');
  log('✅ ТЕСТ ЗАВЕРШЕН УСПЕШНО!', 'green');
  log('='.repeat(70) + '\n', 'bright');
  
  log('🎯 Следующие шаги:', 'cyan');
  log('  1. Откройте Neo4j Browser: http://localhost:7474', 'blue');
  log('  2. Визуализируйте граф:', 'blue');
  log('     MATCH (n) RETURN n LIMIT 25', 'bright');
  log('  3. Граф студента:', 'blue');
  log(`     MATCH path = (s:Submission {studentId: "${testSubmission.studentId}"})-[*1..2]-(n) RETURN path LIMIT 50`, 'bright');
}

// Запуск
main().catch(error => {
  log(`\n❌ Ошибка: ${error.message}`, 'red');
  closeNeo4j();
  process.exit(1);
});



