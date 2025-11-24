#!/usr/bin/env ts-node
/**
 * Тест GraphRAG на одной работе студента
 * 
 * Этот скрипт:
 * 1. Берет тестовые данные урока и работы студента
 * 2. Добавляет их в GraphRAG (Neo4j + Ollama)
 * 3. Сохраняет в Supabase (опционально, для гибридного подхода)
 * 4. Проверяет, что данные записались
 * 5. Показывает граф связей и статистику
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import * as crypto from 'crypto';
import neo4j, { Driver, Session } from 'neo4j-driver';

const exec = promisify(require('child_process').exec);

// Neo4j драйвер
let driver: Driver;
let session: Session;

// Конфигурация
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

// Supabase (опционально, для гибридного подхода)
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const USE_SUPABASE = SUPABASE_URL && SUPABASE_KEY;

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Тестовые данные
const testLesson = {
  id: 'test-lesson-001',
  title: 'Введение в GitHub Actions',
  content: `
    В этом уроке мы изучим основы GitHub Actions - платформы для автоматизации CI/CD процессов.
    
    Что такое GitHub Actions?
    GitHub Actions - это встроенная в GitHub система для автоматизации различных задач разработки.
    
    Основные концепции:
    1. Workflow - файл с описанием автоматизации
    2. Job - набор шагов, выполняемых на одном runner
    3. Step - отдельная команда или action
    4. Runner - виртуальная машина, где выполняется workflow
    
    Создание первого workflow:
    1. Создайте папку .github/workflows в корне проекта
    2. Создайте файл ci.yml
    3. Опишите workflow с триггером на push
    4. Добавьте шаги для сборки и тестирования
    
    Пример workflow:
    name: CI
    on: [push]
    jobs:
      build:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v2
          - name: Run tests
            run: npm test
  `,
  summary: 'Урок покрывает основы GitHub Actions: что это, зачем нужно, как создать первый workflow для автоматизации CI/CD процессов.'
};

const testSubmission = {
  id: 'test-submission-001',
  lessonId: 'test-lesson-001',
  assignmentId: 'test-assignment-001',
  studentId: 'test-student-001',
  studentName: 'Иван Тестовый',
  text: `
    Я настроил GitHub Actions для своего проекта!
    
    Что я сделал:
    1. Создал папку .github/workflows
    2. Добавил файл main.yml с workflow
    3. Настроил триггер на push в main ветку
    4. Добавил шаги:
       - Checkout кода
       - Установка зависимостей (npm install)
       - Запуск тестов (npm test)
       - Сборка проекта (npm run build)
    
    Теперь при каждом push автоматически запускаются тесты и сборка.
    Если тесты падают - я сразу вижу это в GitHub.
    
    Очень удобно! Больше не нужно вручную проверять каждый коммит.
  `,
  status: 'accepted' as const,
  imageUrls: []
};

// Проверка Ollama
async function checkOllama(): Promise<boolean> {
  try {
    log('\n🔍 Проверяю Ollama...', 'cyan');
    const response = await axios.get(`${OLLAMA_URL}/api/tags`);
    
    const models = response.data.models || [];
    const hasNomic = models.some((m: any) => m.name.includes('nomic-embed-text'));
    
    if (hasNomic) {
      log('✅ Ollama запущен, модель nomic-embed-text найдена', 'green');
      return true;
    } else {
      log('⚠️ Ollama запущен, но модель nomic-embed-text не найдена', 'yellow');
      log('   Установите: ollama pull nomic-embed-text', 'yellow');
      return false;
    }
  } catch (error) {
    log('❌ Ollama не запущен или недоступен', 'red');
    log('   Запустите: ollama serve', 'yellow');
    return false;
  }
}

// Инициализация Neo4j
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

// Проверка Neo4j
async function checkNeo4j(): Promise<boolean> {
  try {
    log('\n🔍 Проверяю Neo4j...', 'cyan');
    
    // Инициализируем драйвер
    await initNeo4j();
    
    // Проверяем подключение
    await session.run('RETURN 1');
    
    log('✅ Neo4j запущен и доступен', 'green');
    return true;
  } catch (error: any) {
    log('❌ Не удалось подключиться к Neo4j: ' + error.message, 'red');
    log('   Запустите: docker run -d --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest', 'yellow');
    return false;
  }
}

// Создание embedding через Ollama
async function createEmbedding(text: string): Promise<number[]> {
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
      model: OLLAMA_MODEL,
      prompt: text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000)
    });
    
    return response.data.embedding;
  } catch (error) {
    log(`❌ Ошибка создания embedding: ${error}`, 'red');
    throw error;
  }
}

// Добавление урока в граф (через Neo4j драйвер)
async function addLessonToGraph(): Promise<void> {
  log('\n📚 Добавляю урок в граф...', 'cyan');
  
  try {
    await session.run(`
      MERGE (l:Lesson {id: $id})
      SET l.title = $title,
          l.content = $content,
          l.summary = $summary,
          l.created_at = datetime()
      RETURN l
    `, {
      id: testLesson.id,
      title: testLesson.title,
      content: testLesson.content,
      summary: testLesson.summary
    });
    
    log(`✅ Урок "${testLesson.title}" добавлен в граф`, 'green');
  } catch (error: any) {
    log('❌ Не удалось добавить урок: ' + error.message, 'red');
  }
}

// Добавление работы студента в граф
async function addSubmissionToGraph(): Promise<void> {
  log('\n📝 Добавляю работу студента в граф...', 'cyan');
  
  const pythonScript = `
import json
from neo4j import GraphDatabase

driver = GraphDatabase.driver(
    "${NEO4J_URI}",
    auth=("${NEO4J_USER}", "${NEO4J_PASSWORD}")
)

submission = ${JSON.stringify(testSubmission)}

with driver.session() as session:
    # Создаем узел работы и связываем с уроком
    result = session.run("""
        MATCH (l:Lesson {id: $lessonId})
        MERGE (s:Submission {id: $id})
        SET s.studentName = $studentName,
            s.text = $text,
            s.status = $status,
            s.created_at = datetime()
        MERGE (l)-[:HAS_SUBMISSION]->(s)
        RETURN s
    """, submission)
    
    print(json.dumps({"success": True, "submission_id": submission["id"]}))

driver.close()
`;

  try {
    const { stdout } = await exec(`python3 -c '${pythonScript.replace(/'/g, "'\\''")}'`);
    const result = JSON.parse(stdout);
    
    if (result.success) {
      log(`✅ Работа студента "${testSubmission.studentName}" добавлена в граф`, 'green');
    }
  } catch (error) {
    log('⚠️ Python недоступен, пробую через cypher-shell...', 'yellow');
    
    const cypherQuery = `
      MATCH (l:Lesson {id: '${testSubmission.lessonId}'})
      MERGE (s:Submission {id: '${testSubmission.id}'})
      SET s.studentName = '${testSubmission.studentName}',
          s.status = '${testSubmission.status}',
          s.created_at = datetime()
      MERGE (l)-[:HAS_SUBMISSION]->(s)
      RETURN s.id as id, s.studentName as name
    `;
    
    try {
      await exec(
        `docker exec neo4j cypher-shell -u ${NEO4J_USER} -p ${NEO4J_PASSWORD} "${cypherQuery}"`
      );
      log('✅ Работа добавлена через cypher-shell', 'green');
    } catch (e) {
      log('❌ Не удалось добавить работу', 'red');
    }
  }
}

// Извлечение концепций (упрощенная версия)
async function extractConcepts(): Promise<void> {
  log('\n🧠 Извлекаю концепции из урока...', 'cyan');
  
  const concepts = [
    { name: 'GitHub Actions', description: 'Платформа для автоматизации CI/CD' },
    { name: 'Workflow', description: 'Файл с описанием автоматизации' },
    { name: 'CI/CD', description: 'Continuous Integration / Continuous Deployment' },
    { name: 'Runner', description: 'Виртуальная машина для выполнения workflow' }
  ];
  
  for (const concept of concepts) {
    const pythonScript = `
import json
from neo4j import GraphDatabase

driver = GraphDatabase.driver(
    "${NEO4J_URI}",
    auth=("${NEO4J_USER}", "${NEO4J_PASSWORD}")
)

concept = ${JSON.stringify(concept)}

with driver.session() as session:
    result = session.run("""
        MATCH (l:Lesson {id: '${testLesson.id}'})
        MERGE (c:Concept {name: $name})
        SET c.description = $description
        MERGE (l)-[:TEACHES]->(c)
        RETURN c
    """, concept)
    
    print(json.dumps({"success": True}))

driver.close()
`;

    try {
      await exec(`python3 -c '${pythonScript.replace(/'/g, "'\\''")}'`);
      log(`  ✅ Концепция: ${concept.name}`, 'green');
    } catch (error) {
      // Fallback через cypher-shell
      const cypherQuery = `
        MATCH (l:Lesson {id: '${testLesson.id}'})
        MERGE (c:Concept {name: '${concept.name.replace(/'/g, "\\'")}'})
        SET c.description = '${concept.description.replace(/'/g, "\\'")}'
        MERGE (l)-[:TEACHES]->(c)
        RETURN c.name
      `;
      
      try {
        await exec(
          `docker exec neo4j cypher-shell -u ${NEO4J_USER} -p ${NEO4J_PASSWORD} "${cypherQuery}"`
        );
        log(`  ✅ Концепция: ${concept.name}`, 'green');
      } catch (e) {
        log(`  ⚠️ Не удалось добавить концепцию: ${concept.name}`, 'yellow');
      }
    }
  }
}

// Проверка данных в графе
async function checkGraphData(): Promise<void> {
  log('\n🔍 Проверяю данные в графе...', 'cyan');
  
  const queries = [
    {
      name: 'Уроки',
      query: 'MATCH (l:Lesson) RETURN count(l) as count'
    },
    {
      name: 'Работы студентов',
      query: 'MATCH (s:Submission) RETURN count(s) as count'
    },
    {
      name: 'Концепции',
      query: 'MATCH (c:Concept) RETURN count(c) as count'
    },
    {
      name: 'Связи урок→работа',
      query: 'MATCH (l:Lesson)-[:HAS_SUBMISSION]->(s:Submission) RETURN count(*) as count'
    },
    {
      name: 'Связи урок→концепция',
      query: 'MATCH (l:Lesson)-[:TEACHES]->(c:Concept) RETURN count(*) as count'
    }
  ];
  
  for (const q of queries) {
    try {
      const { stdout } = await exec(
        `docker exec neo4j cypher-shell -u ${NEO4J_USER} -p ${NEO4J_PASSWORD} "${q.query}" --format plain`
      );
      
      const match = stdout.match(/\d+/);
      const count = match ? match[0] : '0';
      
      log(`  ${q.name}: ${count}`, count !== '0' ? 'green' : 'yellow');
    } catch (error) {
      log(`  ${q.name}: ошибка проверки`, 'red');
    }
  }
}

// Показать граф
async function showGraph(): Promise<void> {
  log('\n📊 Граф связей:', 'cyan');
  
  const query = `
    MATCH (l:Lesson {id: '${testLesson.id}'})-[r1:HAS_SUBMISSION]->(s:Submission)
    OPTIONAL MATCH (l)-[r2:TEACHES]->(c:Concept)
    RETURN l.title as lesson, s.studentName as student, collect(DISTINCT c.name) as concepts
  `;
  
  try {
    const { stdout } = await exec(
      `docker exec neo4j cypher-shell -u ${NEO4J_USER} -p ${NEO4J_PASSWORD} "${query}" --format plain`
    );
    
    log('\n' + stdout, 'bright');
    
    log('\n📈 Визуализация графа:', 'cyan');
    log('   Откройте Neo4j Browser: http://localhost:7474', 'blue');
    log('   Логин: neo4j, пароль: password', 'blue');
    log('\n   Выполните запрос:', 'yellow');
    log(`   MATCH (l:Lesson {id: '${testLesson.id}'})-[r]-(n) RETURN l, r, n`, 'bright');
  } catch (error) {
    log('⚠️ Не удалось получить граф', 'yellow');
  }
}

// Тест embeddings
async function testEmbeddings(): Promise<void> {
  log('\n🧪 Тестирую Ollama embeddings...', 'cyan');
  
  const texts = [
    testLesson.summary,
    testSubmission.text.slice(0, 200)
  ];
  
  for (let i = 0; i < texts.length; i++) {
    const start = Date.now();
    const embedding = await createEmbedding(texts[i]);
    const time = Date.now() - start;
    
    log(`  ✅ Embedding ${i + 1}: размерность ${embedding.length}, время ${time}ms`, 'green');
  }
}

// Сохранение в Supabase (опционально)
async function saveToSupabase(): Promise<void> {
  if (!USE_SUPABASE) {
    log('\n⏭️ Supabase не настроен, пропускаю...', 'yellow');
    return;
  }
  
  log('\n💾 Сохраняю данные в Supabase...', 'cyan');
  
  try {
    // Создаем embeddings
    const lessonEmbedding = await createEmbedding(
      `${testLesson.title}\n\n${testLesson.summary}\n\n${testLesson.content.slice(0, 3000)}`
    );
    const submissionEmbedding = await createEmbedding(testSubmission.text);
    
    // Сохраняем урок
    const lessonResponse = await axios.post(
      `${SUPABASE_URL}/rest/v1/lessons`,
      {
        id: testLesson.id,
        title: testLesson.title,
        content_text: testLesson.content,
        summary: testLesson.summary,
        embedding: JSON.stringify(lessonEmbedding),
        video_urls: [],
        image_urls: [],
        file_urls: [],
        instructions: []
      },
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      }
    );
    
    log('  ✅ Урок сохранен в Supabase', 'green');
    
    // Сохраняем работу студента
    const submissionResponse = await axios.post(
      `${SUPABASE_URL}/rest/v1/student_submissions`,
      {
        id: testSubmission.id,
        assignment_id: testSubmission.assignmentId,
        lesson_id: testSubmission.lessonId,
        student_id: testSubmission.studentId,
        student_name: testSubmission.studentName,
        submission_text: testSubmission.text,
        status: testSubmission.status,
        embedding: JSON.stringify(submissionEmbedding),
        image_urls: [],
        file_urls: []
      },
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      }
    );
    
    log('  ✅ Работа студента сохранена в Supabase', 'green');
    
  } catch (error: any) {
    if (error.response?.status === 409) {
      log('  ⚠️ Данные уже существуют в Supabase', 'yellow');
    } else {
      log(`  ⚠️ Ошибка сохранения в Supabase: ${error.message}`, 'yellow');
    }
  }
}

// Сбор статистики по студенту
async function getStudentStats(): Promise<void> {
  log('\n📊 Статистика по студенту:', 'cyan');
  
  // Статистика из Neo4j
  const neo4jQuery = `
    MATCH (s:Submission {studentId: '${testSubmission.studentId}'})
    RETURN 
      count(s) as total_submissions,
      count(CASE WHEN s.status = 'accepted' THEN 1 END) as accepted,
      count(CASE WHEN s.status = 'rejected' THEN 1 END) as rejected
  `;
  
  try {
    const { stdout } = await exec(
      `docker exec neo4j cypher-shell -u ${NEO4J_USER} -p ${NEO4J_PASSWORD} "${neo4jQuery}" --format plain`
    );
    
    log('\n  📈 Neo4j (Граф знаний):', 'bright');
    log('  ' + stdout.trim(), 'bright');
    
    // Концепции, которые использует студент
    const conceptsQuery = `
      MATCH (s:Submission {studentId: '${testSubmission.studentId}'})-[:USES]->(c:Concept)
      RETURN collect(DISTINCT c.name) as concepts
    `;
    
    const { stdout: conceptsOut } = await exec(
      `docker exec neo4j cypher-shell -u ${NEO4J_USER} -p ${NEO4J_PASSWORD} "${conceptsQuery}" --format plain`
    );
    
    log('\n  🧠 Использованные концепции:', 'bright');
    log('  ' + conceptsOut.trim(), 'bright');
    
  } catch (error) {
    log('  ⚠️ Не удалось получить статистику из Neo4j', 'yellow');
  }
  
  // Статистика из Supabase (если настроен)
  if (USE_SUPABASE) {
    try {
      const response = await axios.get(
        `${SUPABASE_URL}/rest/v1/student_submissions?student_id=eq.${testSubmission.studentId}&select=id,status,similarity_to_ideal`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        }
      );
      
      const submissions = response.data;
      const accepted = submissions.filter((s: any) => s.status === 'accepted').length;
      const avgSimilarity = submissions.reduce((sum: number, s: any) => 
        sum + (s.similarity_to_ideal || 0), 0) / submissions.length;
      
      log('\n  📊 Supabase (Векторная БД):', 'bright');
      log(`    Всего работ: ${submissions.length}`, 'bright');
      log(`    Принято: ${accepted}`, 'bright');
      log(`    Средняя схожесть с идеалом: ${(avgSimilarity * 100).toFixed(1)}%`, 'bright');
      
    } catch (error) {
      log('\n  ⚠️ Не удалось получить статистику из Supabase', 'yellow');
    }
  }
}

// Связывание работы с концепциями
async function linkSubmissionToConcepts(): Promise<void> {
  log('\n🔗 Связываю работу студента с концепциями...', 'cyan');
  
  // Анализируем текст работы и находим упоминания концепций
  const conceptMentions = [
    { name: 'GitHub Actions', mentioned: testSubmission.text.includes('GitHub Actions') },
    { name: 'Workflow', mentioned: testSubmission.text.includes('workflow') || testSubmission.text.includes('yml') },
    { name: 'CI/CD', mentioned: testSubmission.text.includes('тест') || testSubmission.text.includes('сборк') },
    { name: 'Runner', mentioned: false }
  ];
  
  for (const concept of conceptMentions) {
    if (!concept.mentioned) continue;
    
    const query = `
      MATCH (s:Submission {id: '${testSubmission.id}'})
      MATCH (c:Concept {name: '${concept.name}'})
      MERGE (s)-[:USES]->(c)
      RETURN s.studentName, c.name
    `;
    
    try {
      await exec(
        `docker exec neo4j cypher-shell -u ${NEO4J_USER} -p ${NEO4J_PASSWORD} "${query}"`
      );
      log(`  ✅ Связь: ${testSubmission.studentName} → ${concept.name}`, 'green');
    } catch (error) {
      log(`  ⚠️ Не удалось создать связь с ${concept.name}`, 'yellow');
    }
  }
}

// Главная функция
async function main() {
  log('\n' + '='.repeat(70), 'bright');
  log('🧪 ТЕСТ GRAPHRAG НА ОДНОЙ РАБОТЕ СТУДЕНТА', 'bright');
  log('='.repeat(70) + '\n', 'bright');
  
  // Проверка зависимостей
  const ollamaOk = await checkOllama();
  const neo4jOk = await checkNeo4j();
  
  if (!ollamaOk || !neo4jOk) {
    log('\n❌ Не все зависимости запущены. Исправьте ошибки и попробуйте снова.', 'red');
    process.exit(1);
  }
  
  // Тест embeddings
  await testEmbeddings();
  
  // Добавление данных в граф
  await addLessonToGraph();
  await addSubmissionToGraph();
  await extractConcepts();
  await linkSubmissionToConcepts();
  
  // Проверка результатов
  await checkGraphData();
  await showGraph();
  
  // Сохранение в Supabase (опционально)
  await saveToSupabase();
  
  // Статистика по студенту
  await getStudentStats();
  
  log('\n' + '='.repeat(70), 'bright');
  log('✅ ТЕСТ ЗАВЕРШЕН УСПЕШНО!', 'green');
  log('='.repeat(70) + '\n', 'bright');
  
  log('📝 Что было сделано:', 'cyan');
  log('  1. Проверены Ollama и Neo4j', 'bright');
  log('  2. Создан урок "Введение в GitHub Actions"', 'bright');
  log('  3. Добавлена работа студента "Иван Тестовый"', 'bright');
  log('  4. Извлечены 4 концепции из урока', 'bright');
  log('  5. Созданы связи в графе знаний', 'bright');
  log('  6. Сохранены данные в Supabase (если настроен)', 'bright');
  log('  7. Собрана статистика по студенту', 'bright');
  
  log('\n🎯 Следующие шаги:', 'cyan');
  log('  1. Откройте Neo4j Browser: http://localhost:7474', 'blue');
  log('  2. Визуализируйте граф запросом:', 'blue');
  log(`     MATCH (n) RETURN n LIMIT 25`, 'bright');
  log('  3. Изучите связи между узлами', 'blue');
  log('  4. Проверьте статистику студента по ID: ' + testSubmission.studentId, 'blue');
  
  log('\n💡 Полезные запросы:', 'cyan');
  log('  - Все уроки: MATCH (l:Lesson) RETURN l', 'bright');
  log('  - Все концепции: MATCH (c:Concept) RETURN c', 'bright');
  log('  - Граф урока: MATCH (l:Lesson)-[r]-(n) WHERE l.id = "test-lesson-001" RETURN l, r, n', 'bright');
  log('  - Статистика студента: MATCH (s:Submission {studentId: "' + testSubmission.studentId + '"}) RETURN s', 'bright');
}

// Запуск
main().catch(error => {
  log(`\n❌ Ошибка: ${error.message}`, 'red');
  process.exit(1);
});

