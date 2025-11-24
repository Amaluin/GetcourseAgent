#!/usr/bin/env ts-node
/**
 * Очистка уроков из базы знаний
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import neo4j from 'neo4j-driver';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

async function clearLessons() {
  console.log('🔮 Подключаюсь к Neo4j...');
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();

  try {
    // Удаляем уроки и все связанные секции
    console.log('🗑️  Удаляю уроки и секции...');
    await session.run(`
      MATCH (l:Lesson)
      OPTIONAL MATCH (l)-[:HAS_SECTION]->(s:LessonSection)
      OPTIONAL MATCH (s)-[:MENTIONS]->(k:Keyword)
      DETACH DELETE l, s
    `);
    
    // Удаляем ключевые слова без связей
    console.log('🗑️  Удаляю неиспользуемые ключевые слова...');
    await session.run(`
      MATCH (k:Keyword)
      WHERE NOT (k)<-[:MENTIONS]-()
      DELETE k
    `);
    
    console.log('✅ База знаний очищена!');
    console.log('💡 Теперь запустите: npm start');
    console.log('   Уроки будут загружены заново с детальными секциями.');
  } catch (error: any) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    await session.close();
    await driver.close();
  }
}

clearLessons().catch(console.error);


