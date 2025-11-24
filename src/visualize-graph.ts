#!/usr/bin/env ts-node
/**
 * Визуализация структуры графа GraphRAG
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import neo4j from 'neo4j-driver';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

async function visualizeGraph() {
  console.log('🔮 Подключаюсь к Neo4j...\n');
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();

  try {
    // 1. Статистика узлов
    console.log('📊 СТАТИСТИКА УЗЛОВ:');
    console.log('='.repeat(70));
    
    const nodesResult = await session.run(`
      MATCH (n)
      RETURN labels(n)[0] as label, count(n) as count
      ORDER BY count DESC
    `);

    for (const record of nodesResult.records) {
      const label = record.get('label');
      const count = record.get('count').toNumber();
      console.log(`   ${label.padEnd(20)} : ${count}`);
    }

    // 2. Статистика связей
    console.log('\n📊 СТАТИСТИКА СВЯЗЕЙ (Relationships):');
    console.log('='.repeat(70));
    
    const relsResult = await session.run(`
      MATCH ()-[r]->()
      RETURN type(r) as type, count(r) as count
      ORDER BY count DESC
    `);

    if (relsResult.records.length === 0) {
      console.log('   ⚠️ НЕТ СВЯЗЕЙ! Граф не связан!');
    } else {
      for (const record of relsResult.records) {
        const type = record.get('type');
        const count = record.get('count').toNumber();
        console.log(`   ${type.padEnd(20)} : ${count}`);
      }
    }

    // 3. Примеры связей
    console.log('\n🔗 ПРИМЕРЫ СВЯЗЕЙ:');
    console.log('='.repeat(70));
    
    const examplesResult = await session.run(`
      MATCH (a)-[r]->(b)
      RETURN labels(a)[0] as from, type(r) as rel, labels(b)[0] as to
      LIMIT 10
    `);

    for (const record of examplesResult.records) {
      const from = record.get('from');
      const rel = record.get('rel');
      const to = record.get('to');
      console.log(`   (${from})-[:${rel}]->(${to})`);
    }

    // 4. Детальная структура графа
    console.log('\n🗺️ СТРУКТУРА ГРАФА:');
    console.log('='.repeat(70));

    // Lessons
    const lessonsResult = await session.run(`
      MATCH (l:Lesson)
      OPTIONAL MATCH (l)-[:HAS_SECTION]->(s:LessonSection)
      OPTIONAL MATCH (l)-[:TEACHES]->(c:Concept)
      OPTIONAL MATCH (l)-[:HAS_SUBMISSION]->(sub:Submission)
      RETURN l.id as id, 
             l.title as title,
             count(DISTINCT s) as sections,
             count(DISTINCT c) as concepts,
             count(DISTINCT sub) as submissions
      LIMIT 5
    `);

    console.log('\n📚 Уроки:');
    for (const record of lessonsResult.records) {
      console.log(`   ID: ${record.get('id')}`);
      console.log(`   Название: ${record.get('title')}`);
      console.log(`   Секций: ${record.get('sections').toNumber()}`);
      console.log(`   Концепций: ${record.get('concepts').toNumber()}`);
      console.log(`   Работ студентов: ${record.get('submissions').toNumber()}`);
      console.log('');
    }

    // Students
    const studentsResult = await session.run(`
      MATCH (st:Student)
      OPTIONAL MATCH (st)-[:SUBMITTED]->(s:Submission)
      OPTIONAL MATCH (st)-[:KNOWS]->(c:Concept)
      OPTIONAL MATCH (st)-[:STUDIES]->(l:Lesson)
      RETURN st.name as name,
             count(DISTINCT s) as submissions,
             count(DISTINCT c) as concepts,
             count(DISTINCT l) as lessons
      LIMIT 5
    `);

    console.log('👥 Студенты:');
    for (const record of studentsResult.records) {
      console.log(`   Имя: ${record.get('name')}`);
      console.log(`   Работ: ${record.get('submissions').toNumber()}`);
      console.log(`   Знает концепций: ${record.get('concepts').toNumber()}`);
      console.log(`   Изучает уроков: ${record.get('lessons').toNumber()}`);
      console.log('');
    }

    // Concepts
    const conceptsResult = await session.run(`
      MATCH (c:Concept)
      OPTIONAL MATCH (c)<-[:TEACHES]-(l:Lesson)
      OPTIONAL MATCH (c)<-[:USES]-(s:Submission)
      OPTIONAL MATCH (c)<-[:KNOWS]-(st:Student)
      RETURN c.name as name,
             count(DISTINCT l) as lessons,
             count(DISTINCT s) as submissions,
             count(DISTINCT st) as students
      ORDER BY lessons DESC, students DESC
      LIMIT 10
    `);

    console.log('💡 Топ-10 Концепций:');
    for (const record of conceptsResult.records) {
      console.log(`   "${record.get('name')}"`);
      console.log(`     Преподается в ${record.get('lessons').toNumber()} уроках`);
      console.log(`     Используется в ${record.get('submissions').toNumber()} работах`);
      console.log(`     Знают ${record.get('students').toNumber()} студентов`);
      console.log('');
    }

    // 5. Cypher запросы для Neo4j Browser
    console.log('\n📋 CYPHER ЗАПРОСЫ ДЛЯ ВИЗУАЛИЗАЦИИ:');
    console.log('='.repeat(70));
    console.log('\n// 1. Показать всю структуру графа:');
    console.log('MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100');
    
    console.log('\n// 2. Показать урок со всеми связями:');
    console.log('MATCH (l:Lesson)-[r]-(n) WHERE l.id = "345277484" RETURN l, r, n');
    
    console.log('\n// 3. Показать студента со всеми связями:');
    console.log('MATCH (st:Student)-[r]-(n) RETURN st, r, n LIMIT 50');
    
    console.log('\n// 4. Показать концепции и где они используются:');
    console.log('MATCH (c:Concept)-[r]-(n) RETURN c, r, n LIMIT 100');
    
    console.log('\n// 5. Показать путь от студента к концепциям через работы:');
    console.log('MATCH path = (st:Student)-[:SUBMITTED]->(:Submission)-[:USES]->(c:Concept)');
    console.log('RETURN path LIMIT 20');

  } catch (error: any) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    await session.close();
    await driver.close();
  }
}

visualizeGraph().catch(console.error);


