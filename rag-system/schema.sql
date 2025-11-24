-- ============================================
-- Supabase Schema для GetCourse RAG System
-- ============================================

-- Включаем расширение для векторов
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 1. Таблица уроков
-- ============================================
CREATE TABLE lessons (
  id TEXT PRIMARY KEY,                    -- lessonId из GetCourse
  title TEXT NOT NULL,
  url TEXT,
  content_text TEXT,                      -- Полный текст урока
  summary TEXT,                           -- AI-саммари
  embedding VECTOR(1536),                 -- OpenAI ada-002 embedding
  video_urls TEXT[],
  image_urls TEXT[],
  file_urls TEXT[],
  instructions TEXT[],
  metadata JSONB,                         -- Дополнительные данные
  content_hash TEXT,                      -- Хэш контента для отслеживания изменений
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INTEGER DEFAULT 1
);

-- Индекс для векторного поиска (cosine similarity)
CREATE INDEX lessons_embedding_idx ON lessons 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Индекс для быстрого поиска по ID
CREATE INDEX lessons_id_idx ON lessons(id);

-- ============================================
-- 2. Таблица заданий
-- ============================================
CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  lesson_id TEXT REFERENCES lessons(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,                       -- Текст задания
  ideal_answer TEXT,                      -- Идеальный ответ
  requirements TEXT[],                    -- Список требований
  embedding VECTOR(1536),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX assignments_lesson_id_idx ON assignments(lesson_id);
CREATE INDEX assignments_embedding_idx ON assignments 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 50);

-- ============================================
-- 3. Таблица работ студентов
-- ============================================
CREATE TABLE student_submissions (
  id TEXT PRIMARY KEY,                    -- submissionId из GetCourse
  assignment_id TEXT REFERENCES assignments(id) ON DELETE CASCADE,
  lesson_id TEXT REFERENCES lessons(id) ON DELETE CASCADE,
  student_id TEXT,                        -- Анонимизированный ID студента
  student_name TEXT,                      -- Имя (можно анонимизировать)
  submission_text TEXT,
  image_urls TEXT[],
  file_urls TEXT[],
  status TEXT CHECK (status IN ('accepted', 'rejected', 'pending')),
  ai_comment TEXT,
  ai_verdict TEXT,
  embedding VECTOR(1536),
  similarity_to_ideal FLOAT,              -- Похожесть на идеальный ответ
  similarity_to_best FLOAT,               -- Похожесть на лучшую работу
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  checked_at TIMESTAMP
);

CREATE INDEX submissions_assignment_idx ON student_submissions(assignment_id);
CREATE INDEX submissions_lesson_idx ON student_submissions(lesson_id);
CREATE INDEX submissions_status_idx ON student_submissions(status);
CREATE INDEX submissions_embedding_idx ON student_submissions 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================
-- 4. Таблица концепций (для GraphRAG)
-- ============================================
CREATE TABLE lesson_concepts (
  id SERIAL PRIMARY KEY,
  lesson_id TEXT REFERENCES lessons(id) ON DELETE CASCADE,
  concept_name TEXT NOT NULL,             -- Например: "GitHub Actions", "Docker"
  description TEXT,
  category TEXT,                          -- Категория: "tool", "platform", "concept"
  embedding VECTOR(1536),
  mentioned_count INTEGER DEFAULT 1,
  importance_score FLOAT DEFAULT 0.5,     -- 0.0 - 1.0
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX concepts_lesson_idx ON lesson_concepts(lesson_id);
CREATE INDEX concepts_name_idx ON lesson_concepts(concept_name);
CREATE INDEX concepts_embedding_idx ON lesson_concepts 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 50);

-- ============================================
-- 5. Таблица связей концепций с работами
-- ============================================
CREATE TABLE submission_concepts (
  submission_id TEXT REFERENCES student_submissions(id) ON DELETE CASCADE,
  concept_id INTEGER REFERENCES lesson_concepts(id) ON DELETE CASCADE,
  usage_quality FLOAT DEFAULT 0.5,        -- Насколько хорошо применена концепция
  PRIMARY KEY (submission_id, concept_id)
);

CREATE INDEX submission_concepts_submission_idx ON submission_concepts(submission_id);
CREATE INDEX submission_concepts_concept_idx ON submission_concepts(concept_id);

-- ============================================
-- 6. Таблица кэша (для метаданных)
-- ============================================
CREATE TABLE cache_stats (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,              -- 'lesson', 'assignment', 'submission'
  entity_id TEXT NOT NULL,
  hit_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX cache_stats_entity_idx ON cache_stats(entity_type, entity_id);

-- ============================================
-- ФУНКЦИИ для векторного поиска
-- ============================================

-- Поиск похожих уроков
CREATE OR REPLACE FUNCTION match_lessons(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  summary TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lessons.id,
    lessons.title,
    lessons.summary,
    1 - (lessons.embedding <=> query_embedding) AS similarity
  FROM lessons
  WHERE 1 - (lessons.embedding <=> query_embedding) > match_threshold
  ORDER BY lessons.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Поиск похожих принятых работ
CREATE OR REPLACE FUNCTION match_accepted_submissions(
  query_embedding VECTOR(1536),
  target_assignment_id TEXT,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id TEXT,
  student_name TEXT,
  submission_text TEXT,
  ai_comment TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    student_submissions.id,
    student_submissions.student_name,
    student_submissions.submission_text,
    student_submissions.ai_comment,
    1 - (student_submissions.embedding <=> query_embedding) AS similarity
  FROM student_submissions
  WHERE 
    student_submissions.assignment_id = target_assignment_id
    AND student_submissions.status = 'accepted'
    AND 1 - (student_submissions.embedding <=> query_embedding) > match_threshold
  ORDER BY student_submissions.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Поиск концепций в тексте
CREATE OR REPLACE FUNCTION match_concepts(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.8,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id INTEGER,
  concept_name TEXT,
  description TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lesson_concepts.id,
    lesson_concepts.concept_name,
    lesson_concepts.description,
    1 - (lesson_concepts.embedding <=> query_embedding) AS similarity
  FROM lesson_concepts
  WHERE 1 - (lesson_concepts.embedding <=> query_embedding) > match_threshold
  ORDER BY lesson_concepts.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- ТРИГГЕРЫ для автоматического обновления
-- ============================================

-- Обновление updated_at при изменении урока
CREATE OR REPLACE FUNCTION update_lesson_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lesson_update_trigger
BEFORE UPDATE ON lessons
FOR EACH ROW
EXECUTE FUNCTION update_lesson_timestamp();

-- Обновление статистики кэша
CREATE OR REPLACE FUNCTION update_cache_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO cache_stats (entity_type, entity_id, hit_count, last_accessed)
  VALUES ('lesson', NEW.id, 1, NOW())
  ON CONFLICT (entity_type, entity_id) 
  DO UPDATE SET 
    hit_count = cache_stats.hit_count + 1,
    last_accessed = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS для аналитики
-- ============================================

-- Статистика по урокам
CREATE VIEW lesson_stats AS
SELECT 
  l.id,
  l.title,
  COUNT(DISTINCT a.id) as assignments_count,
  COUNT(DISTINCT s.id) as submissions_count,
  COUNT(DISTINCT CASE WHEN s.status = 'accepted' THEN s.id END) as accepted_count,
  AVG(s.similarity_to_ideal) as avg_similarity,
  l.created_at,
  l.updated_at
FROM lessons l
LEFT JOIN assignments a ON a.lesson_id = l.id
LEFT JOIN student_submissions s ON s.lesson_id = l.id
GROUP BY l.id, l.title, l.created_at, l.updated_at;

-- Топ концепций
CREATE VIEW top_concepts AS
SELECT 
  c.concept_name,
  c.category,
  COUNT(DISTINCT sc.submission_id) as usage_count,
  AVG(sc.usage_quality) as avg_quality,
  c.importance_score
FROM lesson_concepts c
LEFT JOIN submission_concepts sc ON sc.concept_id = c.id
GROUP BY c.id, c.concept_name, c.category, c.importance_score
ORDER BY usage_count DESC, avg_quality DESC;

-- ============================================
-- Row Level Security (RLS) - опционально
-- ============================================

-- Включаем RLS для защиты данных
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_submissions ENABLE ROW LEVEL SECURITY;

-- Политика: только аутентифицированные пользователи
CREATE POLICY "Allow authenticated access" ON lessons
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated access" ON assignments
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated access" ON student_submissions
  FOR ALL TO authenticated USING (true);

-- ============================================
-- Начальные данные (примеры)
-- ============================================

-- Вставка тестового урока (без embedding, добавится через API)
INSERT INTO lessons (id, title, url, content_text, summary)
VALUES (
  'test-lesson-1',
  'Введение в GitHub Actions',
  'https://university.zerocoder.ru/teach/control/lesson/view/id/test-lesson-1',
  'В этом уроке мы изучим основы GitHub Actions...',
  'Урок покрывает основы CI/CD с GitHub Actions'
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Полезные запросы
-- ============================================

-- Найти уроки без кэша
-- SELECT id, title FROM lessons WHERE embedding IS NULL;

-- Статистика по принятым работам
-- SELECT lesson_id, COUNT(*) as accepted_count 
-- FROM student_submissions 
-- WHERE status = 'accepted' 
-- GROUP BY lesson_id 
-- ORDER BY accepted_count DESC;

-- Найти студентов с лучшими работами
-- SELECT student_name, COUNT(*) as accepted_count, AVG(similarity_to_ideal) as avg_quality
-- FROM student_submissions
-- WHERE status = 'accepted'
-- GROUP BY student_name
-- ORDER BY accepted_count DESC, avg_quality DESC
-- LIMIT 10;




