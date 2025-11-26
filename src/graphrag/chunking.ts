/**
 * Продвинутый чанкинг текста для RAG
 * Разбивает текст на перекрывающиеся чанки с учетом границ предложений
 */

export interface Chunk {
  id: string;
  text: string;
  startIndex: number;
  endIndex: number;
  tokenCount: number;
  metadata: {
    lessonId?: string;
    sectionNumber?: number;
    chunkIndex: number;
    totalChunks: number;
  };
}

export interface ChunkingOptions {
  chunkSize: number;        // Размер чанка в токенах (по умолчанию 512)
  overlapSize: number;       // Размер перекрытия (по умолчанию 50)
  preserveSentences: boolean; // Сохранять границы предложений (по умолчанию true)
  minChunkSize: number;      // Минимальный размер чанка (по умолчанию 100)
}

/**
 * Приблизительный подсчет токенов (1 токен ≈ 4 символа для русского текста)
 */
export function estimateTokenCount(text: string): number {
  // Для более точного подсчета можно использовать tiktoken или gpt-tokenizer
  // Но для простоты используем эвристику:
  // - Русский текст: ~4 символа на токен
  // - Английский: ~3.5 символа на токен
  const avgCharsPerToken = 4;
  return Math.ceil(text.length / avgCharsPerToken);
}

/**
 * Разбивает текст на предложения
 */
export function splitIntoSentences(text: string): string[] {
  // Улучшенная регулярка для разбиения на предложения
  // Учитывает сокращения типа "т.д.", "т.п.", "и др."
  const sentences = text
    .replace(/([.!?])\s+(?=[А-ЯA-Z])/g, '$1|')  // Разделитель между предложениями
    .replace(/([.!?])$/g, '$1|')                 // Последнее предложение
    .split('|')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  return sentences;
}

/**
 * Основная функция чанкинга
 */
export function chunkText(
  text: string,
  options: Partial<ChunkingOptions> = {}
): Chunk[] {
  const {
    chunkSize = 512,
    overlapSize = 50,
    preserveSentences = true,
    minChunkSize = 100
  } = options;

  // Убираем лишние пробелы и переносы
  const cleanedText = text
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanedText) {
    return [];
  }

  const totalTokens = estimateTokenCount(cleanedText);
  
  // Если текст меньше размера чанка - возвращаем один чанк
  if (totalTokens <= chunkSize) {
    return [{
      id: generateChunkId(0),
      text: cleanedText,
      startIndex: 0,
      endIndex: cleanedText.length,
      tokenCount: totalTokens,
      metadata: {
        chunkIndex: 0,
        totalChunks: 1
      }
    }];
  }

  const chunks: Chunk[] = [];
  
  if (preserveSentences) {
    // Разбиваем с учетом границ предложений
    const sentences = splitIntoSentences(cleanedText);
    let currentChunk: string[] = [];
    let currentTokenCount = 0;
    let chunkStartIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceTokens = estimateTokenCount(sentence);

      // Если добавление предложения превысит размер чанка
      if (currentTokenCount + sentenceTokens > chunkSize && currentChunk.length > 0) {
        // Сохраняем текущий чанк
        const chunkText = currentChunk.join(' ');
        chunks.push({
          id: generateChunkId(chunks.length),
          text: chunkText,
          startIndex: chunkStartIndex,
          endIndex: chunkStartIndex + chunkText.length,
          tokenCount: currentTokenCount,
          metadata: {
            chunkIndex: chunks.length,
            totalChunks: 0 // Обновим позже
          }
        });

        // Создаем перекрытие (overlap)
        // Берем последние N токенов из текущего чанка
        const overlapSentences: string[] = [];
        let overlapTokens = 0;
        
        for (let j = currentChunk.length - 1; j >= 0 && overlapTokens < overlapSize; j--) {
          const s = currentChunk[j];
          overlapSentences.unshift(s);
          overlapTokens += estimateTokenCount(s);
        }

        // Начинаем новый чанк с перекрытием
        currentChunk = [...overlapSentences, sentence];
        currentTokenCount = overlapTokens + sentenceTokens;
        chunkStartIndex = chunks[chunks.length - 1].startIndex + 
          (chunks[chunks.length - 1].text.length - overlapSentences.join(' ').length);
      } else {
        currentChunk.push(sentence);
        currentTokenCount += sentenceTokens;
      }
    }

    // Добавляем последний чанк
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join(' ');
      if (estimateTokenCount(chunkText) >= minChunkSize) {
        chunks.push({
          id: generateChunkId(chunks.length),
          text: chunkText,
          startIndex: chunkStartIndex,
          endIndex: chunkStartIndex + chunkText.length,
          tokenCount: currentTokenCount,
          metadata: {
            chunkIndex: chunks.length,
            totalChunks: 0
          }
        });
      } else if (chunks.length > 0) {
        // Если последний чанк слишком маленький - добавляем к предыдущему
        const lastChunk = chunks[chunks.length - 1];
        lastChunk.text += ' ' + chunkText;
        lastChunk.endIndex = chunkStartIndex + chunkText.length;
        lastChunk.tokenCount += currentTokenCount;
      }
    }
  } else {
    // Простое разбиение по символам (без учета границ)
    const avgCharsPerToken = 4;
    const chunkSizeChars = chunkSize * avgCharsPerToken;
    const overlapSizeChars = overlapSize * avgCharsPerToken;

    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < cleanedText.length) {
      const endIndex = Math.min(startIndex + chunkSizeChars, cleanedText.length);
      const chunkText = cleanedText.slice(startIndex, endIndex);

      chunks.push({
        id: generateChunkId(chunkIndex),
        text: chunkText,
        startIndex,
        endIndex,
        tokenCount: estimateTokenCount(chunkText),
        metadata: {
          chunkIndex,
          totalChunks: 0
        }
      });

      startIndex += chunkSizeChars - overlapSizeChars;
      chunkIndex++;
    }
  }

  // Обновляем totalChunks для всех чанков
  const totalChunks = chunks.length;
  chunks.forEach(chunk => {
    chunk.metadata.totalChunks = totalChunks;
  });

  return chunks;
}

/**
 * Генерирует уникальный ID для чанка
 */
function generateChunkId(index: number): string {
  const timestamp = Date.now();
  return `chunk_${timestamp}_${index}`;
}

/**
 * Чанкинг с метаданными урока
 */
export function chunkLesson(
  lessonId: string,
  sectionNumber: number,
  text: string,
  options: Partial<ChunkingOptions> = {}
): Chunk[] {
  const chunks = chunkText(text, options);
  
  // Добавляем метаданные урока
  return chunks.map(chunk => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      lessonId,
      sectionNumber
    }
  }));
}

/**
 * Объединяет несколько чанков обратно в текст
 */
export function mergeChunks(chunks: Chunk[]): string {
  return chunks.map(c => c.text).join('\n\n');
}

/**
 * Находит чанк, содержащий определенную позицию в тексте
 */
export function findChunkByPosition(chunks: Chunk[], position: number): Chunk | null {
  return chunks.find(c => position >= c.startIndex && position < c.endIndex) || null;
}

/**
 * Получает контекст вокруг чанка (предыдущий + текущий + следующий)
 */
export function getChunkContext(chunks: Chunk[], chunkIndex: number, contextSize: number = 1): Chunk[] {
  const start = Math.max(0, chunkIndex - contextSize);
  const end = Math.min(chunks.length, chunkIndex + contextSize + 1);
  return chunks.slice(start, end);
}

/**
 * Статистика чанкинга
 */
export interface ChunkingStats {
  totalChunks: number;
  totalTokens: number;
  avgTokensPerChunk: number;
  minTokens: number;
  maxTokens: number;
  totalOverlapTokens: number;
}

export function getChunkingStats(chunks: Chunk[]): ChunkingStats {
  if (chunks.length === 0) {
    return {
      totalChunks: 0,
      totalTokens: 0,
      avgTokensPerChunk: 0,
      minTokens: 0,
      maxTokens: 0,
      totalOverlapTokens: 0
    };
  }

  const tokenCounts = chunks.map(c => c.tokenCount);
  const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);
  
  // Примерная оценка перекрытий
  let totalOverlapTokens = 0;
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    const curr = chunks[i];
    const overlapChars = prev.endIndex - curr.startIndex;
    if (overlapChars > 0) {
      totalOverlapTokens += estimateTokenCount(prev.text.slice(-overlapChars));
    }
  }

  return {
    totalChunks: chunks.length,
    totalTokens,
    avgTokensPerChunk: Math.round(totalTokens / chunks.length),
    minTokens: Math.min(...tokenCounts),
    maxTokens: Math.max(...tokenCounts),
    totalOverlapTokens
  };
}

