/**
 * Тест Advanced GraphRAG на одной реальной работе из GetCourse
 * 
 * Использование:
 * npm run test:single-work
 * 
 * Или с указанием ID работы:
 * SUBMISSION_ID=123 npm run test:single-work
 */

import { initBrowser, closeBrowser, saveSession } from './src/browser';
import { loginToGetCourse } from './src/auth';
import { config } from './src/config';
import { getUncheckedSubmissions, enrichSubmissionWithTaskDetails, postCommentAndVerdict } from './src/parser';
import { checkHomework } from './src/ai';
import { getLessonContent } from './src/lesson-parser';
import { createGraphRAGFromEnv, GraphRAG } from './src/graphrag';

const DRY_RUN = true; // Только заполняем комментарий, не отправляем и не помечаем как проверенную
const MAX_SUBMISSIONS = 1; // Только одна работа

async function main() {
  console.log('🧪 Тест Advanced GraphRAG на одной реальной работе\n');
  console.log('='.repeat(70));
  
  // Инициализация GraphRAG
  let graphRAG: GraphRAG | null = null;
  try {
    console.log('\n🔮 Инициализация Advanced GraphRAG...');
    graphRAG = createGraphRAGFromEnv();
    console.log('✅ GraphRAG успешно инициализирован\n');
  } catch (error: any) {
    console.error('❌ Ошибка инициализации GraphRAG:', error.message);
    console.log('⚠️  Продолжаю без GraphRAG...\n');
  }

  const { page } = await initBrowser();

  try {
    // 1. Авторизация
    console.log('🔐 Авторизация в GetCourse...');
    await loginToGetCourse(page);
    await saveSession();
    console.log('✅ Авторизация успешна\n');

    // 2. Переход в ленту ответов
    console.log(`📋 Переход в ленту ответов: ${config.gcStreamUrl}`);
    await page.goto(config.gcStreamUrl);
    await page.waitForLoadState('domcontentloaded');
    console.log('✅ Лента ответов загружена\n');

    // 3. Поиск заданий
    console.log('🔍 Поиск непроверенных работ...');
    const submissions = await getUncheckedSubmissions(page);
    
    if (submissions.length === 0) {
      console.log('❌ Новых ответов не найдено.');
      return;
    }

    console.log(`✅ Найдено работ: ${submissions.length}`);
    console.log(`📝 Будет обработано: ${Math.min(submissions.length, MAX_SUBMISSIONS)}\n`);

    // 4. Обработка первой работы
    const submission = submissions[0];
    
    console.log('='.repeat(70));
    console.log('📋 ИНФОРМАЦИЯ О РАБОТЕ:');
    console.log('='.repeat(70));
    console.log(`🎓 Студент: ${submission.studentName}`);
    console.log(`📝 Задание: ${submission.assignmentTitle}`);
    console.log(`🆔 ID работы: ${submission.id}`);
    console.log(`🆔 ID урока: ${submission.lessonId || 'не указан'}`);
    
    if (submission.text) {
      console.log(`\n💬 Ответ студента (первые 200 символов):`);
      console.log(submission.text.slice(0, 200) + '...\n');
    } else {
      console.log(`💬 Ответ студента: [Текст отсутствует]\n`);
    }

    // ШАГ 1: Загрузка и обработка урока
    if (submission.lessonId) {
      console.log('='.repeat(70));
      console.log('📚 ШАГ 1: ОБРАБОТКА УРОКА');
      console.log('='.repeat(70));
      
      try {
        // Парсим урок
        console.log(`\n📖 Подготовка к парсингу урока`);
        console.log(`   🆔 ID урока: ${submission.lessonId}`);
        console.log(`   📝 Название задания: ${submission.assignmentTitle}`);
        console.log(`   👤 Студент: ${submission.studentName}`);
        console.log(`   ⏱️  Начало парсинга: ${new Date().toLocaleTimeString()}`);
        console.log(`\n   ⏳ Вызываю функцию getLessonContent()...\n`);
        
        const parsingStartTime = Date.now();
        submission.lessonContent = await getLessonContent(page, submission.lessonId);
        const parsingTime = Date.now() - parsingStartTime;
        
        console.log(`\n   ✅ Парсинг урока завершен`);
        console.log(`   ⏱️  Время парсинга: ${parsingTime}ms (${(parsingTime / 1000).toFixed(1)} сек)`);
        
        if (!submission.lessonContent) {
          console.log('⚠️  Не удалось получить содержимое урока');
        } else {
          console.log(`✅ Урок успешно проанализирован!`);
          console.log(`   📄 Название: ${submission.lessonContent.title}`);
          console.log(`   📝 Длина текста: ${submission.lessonContent.fullText.length} символов`);
          
          // Сохраняем урок в GraphRAG с chunking + embeddings
          if (graphRAG) {
            console.log(`\n🧩 Обработка урока в GraphRAG:`);
            console.log(`   - Chunking (512 токенов + overlap 50)...`);
            
            const result = await graphRAG.addLesson(
              submission.lessonId,
              submission.lessonContent.title,
              submission.lessonContent.fullText,
              0
            );
            
            console.log(`   ✅ Урок добавлен:`);
            console.log(`      📄 Чанков: ${result.chunks}`);
            console.log(`      🔤 Токенов: ${result.tokens}`);
            console.log(`      📊 Средний размер: ${Math.round(result.tokens / result.chunks)} токенов`);
            
            // Добавляем студента (с ссылкой на профиль)
            const studentId = `student_${Buffer.from(submission.studentName).toString('base64').slice(0, 16)}`;
            
            // Извлекаем ID из URL если есть
            let gcId: string | undefined;
            if (submission.studentUrl) {
              const idMatch = submission.studentUrl.match(/(?:user[\/=]|id[=:]|user_id[=:])(\d+)/i);
              if (idMatch) {
                gcId = idMatch[1];
              }
            }
            
            await graphRAG.addStudent(studentId, submission.studentName, undefined, gcId, submission.studentUrl);
            console.log(`   ✅ Студент добавлен: ${submission.studentName}`);
            if (submission.studentUrl) {
              console.log(`      🔗 Ссылка: ${submission.studentUrl}`);
            }
            if (gcId) {
              console.log(`      🆔 GetCourse ID: ${gcId}`);
            }
            
            // Отмечаем урок как пройденный
            await graphRAG.markLessonCompleted(studentId, submission.lessonId);
            console.log(`   ✅ Урок отмечен как пройденный`);
          }
        }
        
        // Возвращаемся в ленту
        console.log(`\n🔙 Возвращаюсь в ленту ответов...`);
        await page.goto(config.gcStreamUrl);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1000);
        
      } catch (error: any) {
        console.error(`❌ Ошибка при загрузке урока:`, error.message);
        console.log(`⚠️  Продолжаю проверку без контекста урока...\n`);
      }
    } else {
      console.log('⚠️  ID урока не найден, пропускаю анализ урока\n');
    }

    // ШАГ 2: Загрузка деталей задания
    console.log('='.repeat(70));
    console.log('📋 ШАГ 2: ДЕТАЛИ ЗАДАНИЯ');
    console.log('='.repeat(70));
    
    await enrichSubmissionWithTaskDetails(submission, page);
    
    if (submission.idealAnswer) {
      console.log(`\n✅ Идеальный ответ получен (${submission.idealAnswer.length} символов)`);
      console.log(`   Первые 150 символов: ${submission.idealAnswer.slice(0, 150)}...`);
    } else {
      console.log(`\n⚠️  Идеальный ответ не найден`);
    }

    // ШАГ 3: SEMANTIC SEARCH
    console.log('\n' + '='.repeat(70));
    console.log('🔍 ШАГ 3: SEMANTIC SEARCH');
    console.log('='.repeat(70));
    
    let graphRAGContext = '';
    
    if (graphRAG && submission.lessonId) {
      // Формируем запрос для поиска
      const searchQuery = `
        ${submission.assignmentTitle || ''}
        ${submission.idealAnswer || ''}
        ${submission.text || ''}
      `.trim();
      
      console.log(`\n🔎 Поиск релевантного контекста...`);
      console.log(`   Запрос: "${searchQuery.slice(0, 100)}..."`);
      
      // Ищем релевантные чанки
      const results = await graphRAG.search(searchQuery, {
        topK: 5,
        minSimilarity: 0.4,
        includeContext: true,
        lessonId: submission.lessonId
      });
      
      if (results.length > 0) {
        console.log(`\n✅ Найдено ${results.length} релевантных секций:`);
        results.forEach((r, i) => {
          console.log(`\n   ${i + 1}. [Релевантность: ${(r.similarity * 100).toFixed(1)}%]`);
          console.log(`      ${r.chunk.text.slice(0, 120).replace(/\n/g, ' ')}...`);
          if (r.context && r.context.length > 1) {
            console.log(`      📎 Контекст: ${r.context.length} чанков`);
          }
        });
        
        // Формируем контекст для LLM
        graphRAGContext = await graphRAG.getContextForLLM(searchQuery, {
          topK: 5,
          lessonId: submission.lessonId
        });
        
        console.log(`\n📝 Сгенерированный контекст для LLM: ${graphRAGContext.length} символов`);
      } else {
        console.log(`\n⚠️  Релевантные секции не найдены (попробуйте уменьшить minSimilarity)`);
      }
      
      // Статистика студента
      const studentId = `student_${Buffer.from(submission.studentName).toString('base64').slice(0, 16)}`;
      const progress = await graphRAG.getStudentProgress(studentId);
      
      if (progress) {
        console.log(`\n📊 Статистика студента ${submission.studentName}:`);
        console.log(`   📚 Уроков пройдено: ${progress.completedLessons.length}`);
        console.log(`   📝 Всего работ: ${progress.totalSubmissions}`);
        if (progress.avgScore !== undefined) {
          console.log(`   ⭐ Средний балл: ${progress.avgScore.toFixed(1)}`);
        }
        console.log(`   📅 Последняя активность: ${progress.lastActivityDate.toLocaleDateString()}`);
      }
    } else {
      console.log(`\n⚠️  GraphRAG не активен или урок не найден`);
    }

    // ШАГ 4: Проверка AI
    console.log('\n' + '='.repeat(70));
    console.log('🤖 ШАГ 4: ПРОВЕРКА AI');
    console.log('='.repeat(70));
    
    console.log(`\n🧠 Отправка запроса к AI...`);
    console.log(`   Контекст из GraphRAG: ${graphRAGContext.length > 0 ? '✅ Да' : '❌ Нет'}`);
    if (graphRAGContext.length > 0) {
      console.log(`   Размер контекста: ${graphRAGContext.length} символов`);
    }
    
    const feedback = await checkHomework(submission, graphRAGContext);
    
    console.log(`\n✅ Результат проверки:`);
    console.log(`   📊 Вердикт: ${feedback.status.toUpperCase()}`);
    console.log(`   💬 Комментарий (первые 300 символов):`);
    console.log(`   ${feedback.comment.slice(0, 300)}...`);
    console.log(`   📏 Полная длина комментария: ${feedback.comment.length} символов`);

    // ШАГ 5: Сохранение в GraphRAG
    if (graphRAG && submission.lessonId) {
      console.log('\n' + '='.repeat(70));
      console.log('💾 ШАГ 5: СОХРАНЕНИЕ В GRAPHRAG');
      console.log('='.repeat(70));
      
      const studentId = `student_${Buffer.from(submission.studentName).toString('base64').slice(0, 16)}`;
      
      // Связываем работу со студентом
      await graphRAG.linkSubmissionToStudent(
        submission.id,
        studentId,
        submission.studentName
      );
      
      console.log(`\n✅ Работа сохранена в GraphRAG`);
      console.log(`   Связь: (Student)-[:SUBMITTED]->(Submission)`);
      
      // Advanced queries
      console.log(`\n🔍 Advanced Queries:`);
      
      try {
        const similarStudents = await graphRAG.findSimilarStudents(studentId, 3);
        if (similarStudents.length > 0) {
          console.log(`\n   👥 Похожие студенты:`);
          similarStudents.forEach(s => {
            console.log(`      - ${s.studentName} (${s.sharedConcepts} общих концепций)`);
          });
        } else {
          console.log(`   👥 Похожие студенты: не найдено (нужно больше данных)`);
        }
      } catch (error) {
        console.log(`   👥 Похожие студенты: ошибка (возможно нет концепций)`);
      }
      
      try {
        const unlearnedConcepts = await graphRAG.findUnlearnedConcepts(studentId, 5);
        if (unlearnedConcepts.length > 0) {
          console.log(`\n   📖 Рекомендуемые концепции:`);
          unlearnedConcepts.forEach(c => console.log(`      - ${c}`));
        } else {
          console.log(`   📖 Рекомендуемые концепции: все изучены (или нет концепций)`);
        }
      } catch (error) {
        console.log(`   📖 Рекомендуемые концепции: ошибка`);
      }
    }

    // Итоговая статистика
    if (graphRAG) {
      console.log('\n' + '='.repeat(70));
      console.log('📊 СТАТИСТИКА СИСТЕМЫ');
      console.log('='.repeat(70));
      
      const systemStats = graphRAG.getSystemStats();
      console.log(`\n🧠 Embeddings:`);
      console.log(`   Provider: ${systemStats.embedding.provider}`);
      console.log(`   Dimension: ${systemStats.embedding.dimension}`);
      console.log(`   Cache size: ${systemStats.embedding.size} embeddings`);
    }

    // ШАГ 6: Заполнение комментария (без отправки)
    console.log('\n' + '='.repeat(70));
    console.log('📝 ШАГ 6: ЗАПОЛНЕНИЕ КОММЕНТАРИЯ (БЕЗ ОТПРАВКИ)');
    console.log('='.repeat(70));
    
    console.log(`\n📝 Заполнение поля комментария (режим draft - без отправки)...`);
    try {
      // Используем 'draft' чтобы только заполнить поле, но не отправлять
      await postCommentAndVerdict(page, submission.id, feedback.comment, 'draft');
      console.log(`✅ Комментарий заполнен в поле (НЕ отправлен)`);
      console.log(`   Вердикт: ${feedback.status.toUpperCase()}`);
      console.log(`   Длина комментария: ${feedback.comment.length} символов`);
      console.log(`   ⚠️  Работа НЕ помечена как проверенная`);
      console.log(`   ⚠️  Комментарий НЕ отправлен (только заполнено поле)`);
    } catch (error: any) {
      console.error(`❌ Ошибка при заполнении комментария:`, error.message);
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ ТЕСТ ЗАВЕРШЕН УСПЕШНО!');
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error('\n🔥 Критическая ошибка:', error.message);
    console.error(error.stack);
  } finally {
    // Закрываем соединения
    if (graphRAG) {
      await graphRAG.close();
      console.log('\n✅ GraphRAG соединение закрыто');
    }
    
    console.log('\n🏁 Работа завершена.');
    if (config.headless) {
      await closeBrowser();
    } else {
      console.log('ℹ️  Браузер оставлен открытым для отладки.');
    }
  }
}

// Запуск
main().catch(console.error);

