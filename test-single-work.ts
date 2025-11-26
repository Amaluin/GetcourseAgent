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
        // Проверяем, есть ли урок уже в GraphRAG
        let lessonInRAG = false;
        if (graphRAG) {
          console.log(`\n🔍 Проверяю, есть ли урок в GraphRAG...`);
          lessonInRAG = await graphRAG.hasLesson(submission.lessonId);
          
          if (lessonInRAG) {
            const lessonInfo = await graphRAG.getLessonInfo(submission.lessonId);
            if (lessonInfo) {
              console.log(`   ✅ Урок найден в GraphRAG!`);
              console.log(`      📄 Название: ${lessonInfo.title}`);
              console.log(`      📊 Чанков: ${lessonInfo.chunkCount}`);
              console.log(`   ⚡ Пропускаю парсинг, использую данные из GraphRAG`);
            }
          } else {
            console.log(`   ❌ Урок не найден в GraphRAG, нужно парсить`);
          }
        }
        
        // Парсим урок только если его нет в GraphRAG
        if (!lessonInRAG) {
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
            }
          }
        } else {
          // Урок уже в GraphRAG, создаем минимальный lessonContent для совместимости
          const lessonInfo = await graphRAG!.getLessonInfo(submission.lessonId);
          if (lessonInfo) {
            submission.lessonContent = {
              lessonId: lessonInfo.id,
              title: lessonInfo.title,
              fullText: '', // Не нужен, т.к. данные в GraphRAG
              videoSections: [],
              summary: `Урок "${lessonInfo.title}" уже обработан в GraphRAG (${lessonInfo.chunkCount} чанков)`,
              imageUrls: [],
              fileUrls: []
            };
            console.log(`   ✅ Использую данные из GraphRAG для урока "${lessonInfo.title}"`);
          }
        }
        
        // Примечание: Студент будет проверен и обновлен в ШАГ 2 (перед проверкой задания)
        
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

    // ШАГ 2: Проверка и обновление студента в GraphRAG (ПЕРЕД проверкой задания)
    console.log('='.repeat(70));
    console.log('👤 ШАГ 2: ПРОВЕРКА И ОБНОВЛЕНИЕ СТУДЕНТА В GRAPHRAG');
    console.log('='.repeat(70));
    
    if (graphRAG) {
      const studentId = `student_${Buffer.from(submission.studentName).toString('base64').slice(0, 16)}`;
      
      // Извлекаем ID из URL если есть
      let gcId: string | undefined;
      if (submission.studentUrl) {
        console.log(`\n🔍 Извлекаю GetCourse ID из URL: ${submission.studentUrl}`);
        const patterns = [
          /(?:user[\/=]|id[=:]|user_id[=:])(\d+)/i,
          /\/user\/(\d+)/i,
          /user_id=(\d+)/i,
          /user=(\d+)/i,
          /\/pl\/teach\/control\/user\/view\?id=(\d+)/i,
          /\/teach\/control\/user\/view\?id=(\d+)/i
        ];
        
        for (const pattern of patterns) {
          const match = submission.studentUrl.match(pattern);
          if (match && match[1]) {
            gcId = match[1];
            console.log(`   ✅ GetCourse ID найден: ${gcId}`);
            break;
          }
        }
        
        if (!gcId) {
          console.log(`   ⚠️  Не удалось извлечь ID из URL`);
        }
      } else {
        console.log(`   ⚠️  Ссылка на профиль студента отсутствует`);
      }
      
      // Проверяем, существует ли студент
      console.log(`\n🔍 Проверяю, есть ли студент в GraphRAG...`);
      const studentExists = await graphRAG.hasStudent(studentId);
      
      if (studentExists) {
        console.log(`   ✅ Студент найден в GraphRAG`);
        
        // Получаем список пройденных уроков
        const completedLessons = await graphRAG.getStudentLessons(studentId);
        console.log(`   📚 Уроков пройдено: ${completedLessons.length}`);
        
        // Проверяем, проходил ли студент этот урок (если есть ID урока)
        if (submission.lessonId) {
          const hasThisLesson = completedLessons.includes(submission.lessonId);
          
          if (!hasThisLesson) {
            console.log(`   📖 Этот урок еще не пройден, добавляю...`);
            await graphRAG.markLessonCompleted(studentId, submission.lessonId);
            console.log(`   ✅ Урок добавлен к пройденным`);
          } else {
            console.log(`   ℹ️  Этот урок уже был пройден ранее`);
          }
        }
        
        // Обновляем информацию о студенте (ссылка, ID)
        console.log(`   🔄 Обновляю информацию о студенте...`);
        await graphRAG.addStudent(studentId, submission.studentName, undefined, gcId, submission.studentUrl);
        console.log(`   ✅ Информация обновлена`);
        if (submission.studentUrl) {
          console.log(`      🔗 Ссылка: ${submission.studentUrl}`);
        }
        if (gcId) {
          console.log(`      🆔 GetCourse ID: ${gcId}`);
        }
      } else {
        console.log(`   ❌ Студент не найден в GraphRAG, создаю нового...`);
        
        // Создаем нового студента
        await graphRAG.addStudent(studentId, submission.studentName, undefined, gcId, submission.studentUrl);
        console.log(`   ✅ Студент создан:`);
        console.log(`      Имя: ${submission.studentName}`);
        if (submission.studentUrl) {
          console.log(`      🔗 Ссылка: ${submission.studentUrl}`);
        } else {
          console.log(`      🔗 Ссылка: не указана`);
        }
        if (gcId) {
          console.log(`      🆔 GetCourse ID: ${gcId}`);
        } else {
          console.log(`      🆔 GetCourse ID: не найден`);
        }
        
        // Отмечаем урок как пройденный (если есть ID урока)
        if (submission.lessonId) {
          await graphRAG.markLessonCompleted(studentId, submission.lessonId);
          console.log(`   ✅ Урок отмечен как пройденный`);
        }
      }
    } else {
      console.log(`   ⚠️  GraphRAG не активен, пропускаю проверку студента`);
    }

    // ШАГ 3: Загрузка деталей задания
    console.log('\n' + '='.repeat(70));
    console.log('📋 ШАГ 3: ДЕТАЛИ ЗАДАНИЯ');
    console.log('='.repeat(70));
    
    await enrichSubmissionWithTaskDetails(submission, page);
    
    if (submission.idealAnswer) {
      console.log(`\n✅ Идеальный ответ получен (${submission.idealAnswer.length} символов)`);
      console.log(`   Первые 150 символов: ${submission.idealAnswer.slice(0, 150)}...`);
    } else {
      console.log(`\n⚠️  Идеальный ответ не найден`);
    }

    // ШАГ 4: SEMANTIC SEARCH
    console.log('\n' + '='.repeat(70));
    console.log('🔍 ШАГ 4: SEMANTIC SEARCH');
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

    // ШАГ 5: Проверка AI
    console.log('\n' + '='.repeat(70));
    console.log('🤖 ШАГ 5: ПРОВЕРКА AI');
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

    // ШАГ 6: Сохранение работы в GraphRAG
    if (graphRAG && submission.lessonId) {
      console.log('\n' + '='.repeat(70));
      console.log('💾 ШАГ 6: СОХРАНЕНИЕ РАБОТЫ В GRAPHRAG');
      console.log('='.repeat(70));
      
      const studentId = `student_${Buffer.from(submission.studentName).toString('base64').slice(0, 16)}`;
      
      // Связываем работу со студентом
      // (Студент уже проверен и обновлен в ШАГ 2)
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

