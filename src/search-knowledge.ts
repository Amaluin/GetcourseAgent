#!/usr/bin/env ts-node
/**
 * CLI для поиска в базе знаний
 * Использование: ts-node src/search-knowledge.ts "ваш запрос"
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Явно загружаем .env из корня проекта
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import * as GraphRAG from './graphrag/neo4j-client';

async function main() {
  const query = process.argv[2];
  
  if (!query) {
    console.log('❌ Укажите запрос для поиска');
    console.log('Использование: ts-node src/search-knowledge.ts "ваш запрос"');
    console.log('\nПримеры:');
    console.log('  ts-node src/search-knowledge.ts "GitHub Actions"');
    console.log('  ts-node src/search-knowledge.ts "как создать workflow"');
    console.log('  ts-node src/search-knowledge.ts "что такое CI/CD"');
    process.exit(1);
  }

  console.log('🔮 Инициализация GraphRAG...');
  const initialized = await GraphRAG.initGraphRAG();
  
  if (!initialized) {
    console.log('❌ Не удалось подключиться к Neo4j');
    console.log('   Убедитесь, что Neo4j запущен и GRAPHRAG_ENABLED=true в .env');
    process.exit(1);
  }

  console.log(`\n🔍 Поиск: "${query}"\n`);
  console.log('='.repeat(70));
  
  try {
    // Семантический поиск
    const results = await GraphRAG.searchKnowledge(query, 5);
    
    if (results.length === 0) {
      console.log('\n❌ Ничего не найдено');
      console.log('💡 Попробуйте:');
      console.log('   - Использовать другие ключевые слова');
      console.log('   - Сделать запрос более конкретным');
      console.log('   - Убедиться, что уроки загружены в базу знаний');
    } else {
      const formatted = GraphRAG.formatSearchResults(results);
      console.log(formatted);
      
      // Показываем детали первого результата
      if (results.length > 0) {
        const topResult = results[0];
        console.log('='.repeat(70));
        console.log('📖 ДЕТАЛИ САМОГО РЕЛЕВАНТНОГО РЕЗУЛЬТАТА:\n');
        console.log(`Урок: ${topResult.lessonTitle}`);
        console.log(`Секция ${topResult.sectionNumber}: ${topResult.sectionTitle}`);
        
        if (topResult.videoUrl) {
          console.log(`\n🎥 Видео: ${topResult.videoTitle || 'Без названия'}`);
          console.log(`🔗 ${topResult.videoUrl}`);
        }
        
        console.log(`\n📝 Полное содержание секции:`);
        console.log(topResult.content);
        console.log('\n' + '='.repeat(70));
      }
    }
  } catch (error: any) {
    console.error('❌ Ошибка поиска:', error.message);
  } finally {
    await GraphRAG.closeGraphRAG();
  }
}

main().catch(console.error);


