#!/usr/bin/env ts-node
/**
 * Просмотр секций в базе знаний
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import neo4j from 'neo4j-driver';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

async function inspectSections() {
  console.log('🔮 Подключаюсь к Neo4j...');
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();

  try {
    const result = await session.run(`
      MATCH (l:Lesson)-[:HAS_SECTION]->(s:LessonSection)
      RETURN l.title as lessonTitle,
             s.sectionNumber as sectionNumber,
             s.title as sectionTitle,
             s.content as content,
             s.beforeVideo as beforeVideo,
             s.afterVideo as afterVideo,
             size(s.keywords) as keywordsCount,
             size(s.embedding) as embeddingSize
      ORDER BY l.title, s.sectionNumber
      LIMIT 5
    `);

    console.log(`\n📊 Найдено ${result.records.length} секций:\n`);
    console.log('='.repeat(70));

    for (const record of result.records) {
      console.log(`\n📚 Урок: ${record.get('lessonTitle')}`);
      console.log(`📍 Секция ${record.get('sectionNumber')}: ${record.get('sectionTitle')}`);
      console.log(`📝 Content (длина): ${record.get('content')?.length || 0} символов`);
      console.log(`   beforeVideo: ${record.get('beforeVideo')?.length || 0} символов`);
      console.log(`   afterVideo: ${record.get('afterVideo')?.length || 0} символов`);
      console.log(`🔑 Ключевых слов: ${record.get('keywordsCount')}`);
      console.log(`🔢 Embedding size: ${record.get('embeddingSize')}`);
      
      // Показываем первые 200 символов контента
      const content = record.get('content');
      if (content && content.length > 0) {
        console.log(`\n💬 Первые 200 символов:\n${content.substring(0, 200)}...`);
      } else {
        console.log(`\n⚠️ Контент пустой!`);
      }
      console.log('='.repeat(70));
    }

    // Показываем статистику
    const statsResult = await session.run(`
      MATCH (l:Lesson)
      OPTIONAL MATCH (l)-[:HAS_SECTION]->(s:LessonSection)
      RETURN 
        count(DISTINCT l) as lessonsCount,
        count(s) as sectionsCount,
        avg(size(s.content)) as avgContentLength
    `);

    const stats = statsResult.records[0];
    console.log(`\n\n📈 СТАТИСТИКА:`);
    console.log(`   Уроков: ${stats.get('lessonsCount')}`);
    console.log(`   Секций: ${stats.get('sectionsCount')}`);
    console.log(`   Средняя длина контента: ${Math.round(stats.get('avgContentLength') || 0)} символов`);

  } catch (error: any) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    await session.close();
    await driver.close();
  }
}

inspectSections().catch(console.error);



