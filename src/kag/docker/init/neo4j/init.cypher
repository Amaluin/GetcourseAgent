// Инициализация Neo4j для образовательной доменной области GetcourseAgent

// ============================================
// СОЗДАНИЕ ОГРАНИЧЕНИЙ (CONSTRAINTS)
// ============================================

// Ограничения уникальности для сущностей
CREATE CONSTRAINT lesson_id_unique IF NOT EXISTS FOR (l:Lesson) REQUIRE l.id IS UNIQUE;
CREATE CONSTRAINT assignment_id_unique IF NOT EXISTS FOR (a:Assignment) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT student_id_unique IF NOT EXISTS FOR (s:Student) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT submission_id_unique IF NOT EXISTS FOR (sub:Submission) REQUIRE sub.id IS UNIQUE;
CREATE CONSTRAINT concept_id_unique IF NOT EXISTS FOR (c:Concept) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT resource_id_unique IF NOT EXISTS FOR (r:Resource) REQUIRE r.id IS UNIQUE;

// Ограничения существования для обязательных полей
CREATE CONSTRAINT lesson_title_exists IF NOT EXISTS FOR (l:Lesson) REQUIRE l.title IS NOT NULL;
CREATE CONSTRAINT assignment_title_exists IF NOT EXISTS FOR (a:Assignment) REQUIRE a.title IS NOT NULL;
CREATE CONSTRAINT student_name_exists IF NOT EXISTS FOR (s:Student) REQUIRE s.name IS NOT NULL;
CREATE CONSTRAINT concept_name_exists IF NOT EXISTS FOR (c:Concept) REQUIRE c.name IS NOT NULL;

// ============================================
// СОЗДАНИЕ ИНДЕКСОВ
// ============================================

// Индексы для оптимизации запросов по свойствам
CREATE INDEX lesson_title_idx IF NOT EXISTS FOR (l:Lesson) ON (l.title);
CREATE INDEX lesson_difficulty_idx IF NOT EXISTS FOR (l:Lesson) ON (l.difficulty);
CREATE INDEX lesson_created_at_idx IF NOT EXISTS FOR (l:Lesson) ON (l.created_at);

CREATE INDEX student_level_idx IF NOT EXISTS FOR (s:Student) ON (s.level);
CREATE INDEX student_progress_idx IF NOT EXISTS FOR (s:Student) ON (s.progress);
CREATE INDEX student_email_idx IF NOT EXISTS FOR (s:Student) ON (s.email);

CREATE INDEX concept_category_idx IF NOT EXISTS FOR (c:Concept) ON (c.category);
CREATE INDEX concept_difficulty_idx IF NOT EXISTS FOR (c:Concept) ON (c.difficulty);
CREATE INDEX concept_name_idx IF NOT EXISTS FOR (c:Concept) ON (c.name);

CREATE INDEX assignment_lesson_id_idx IF NOT EXISTS FOR (a:Assignment) ON (a.lesson_id);
CREATE INDEX assignment_title_idx IF NOT EXISTS FOR (a:Assignment) ON (a.title);

CREATE INDEX submission_status_idx IF NOT EXISTS FOR (sub:Submission) ON (sub.status);
CREATE INDEX submission_submitted_at_idx IF NOT EXISTS FOR (sub:Submission) ON (sub.submitted_at);
CREATE INDEX submission_student_id_idx IF NOT EXISTS FOR (sub:Submission) ON (sub.student_id);
CREATE INDEX submission_assignment_id_idx IF NOT EXISTS FOR (sub:Submission) ON (sub.assignment_id);

CREATE INDEX resource_type_idx IF NOT EXISTS FOR (r:Resource) ON (r.type);
CREATE INDEX resource_url_idx IF NOT EXISTS FOR (r:Resource) ON (r.url);

// ============================================
// СОЗДАНИЕ ПОЛНОТЕКСТОВЫХ ИНДЕКСОВ
// ============================================

// Полнотекстовый поиск по урокам
CREATE FULLTEXT INDEX lesson_fulltext_idx IF NOT EXISTS 
FOR (l:Lesson) 
ON EACH [l.title, l.content, l.summary];

// Полнотекстовый поиск по концепциям
CREATE FULLTEXT INDEX concept_fulltext_idx IF NOT EXISTS 
FOR (c:Concept) 
ON EACH [c.name, c.description];

// Полнотекстовый поиск по заданиям
CREATE FULLTEXT INDEX assignment_fulltext_idx IF NOT EXISTS 
FOR (a:Assignment) 
ON EACH [a.title, a.description];

// Полнотекстовый поиск по работам студентов
CREATE FULLTEXT INDEX submission_fulltext_idx IF NOT EXISTS 
FOR (sub:Submission) 
ON EACH [sub.content, sub.feedback];

// ============================================
// СОЗДАНИЕ НАЧАЛЬНЫХ УЗЛОВ
// ============================================

// Системный администратор
MERGE (admin:Student {id: 'system_admin'})
ON CREATE SET 
    admin.name = 'System Administrator',
    admin.email = 'admin@getcourseagent.local',
    admin.level = 'advanced',
    admin.progress = 100.0,
    admin.registration_date = datetime(),
    admin.created_at = datetime(),
    admin.updated_at = datetime();

// Вводный урок
MERGE (intro:Lesson {id: 'system_intro'})
ON CREATE SET 
    intro.title = 'Введение в систему',
    intro.content = 'Добро пожаловать в систему GetcourseAgent с KAG!',
    intro.summary = 'Вводный урок для новых пользователей',
    intro.difficulty = 'beginner',
    intro.duration = 30,
    intro.created_at = datetime(),
    intro.updated_at = datetime();

// Базовые концепции
MERGE (kag:Concept {id: 'concept_kag'})
ON CREATE SET 
    kag.name = 'Knowledge Augmented Generation',
    kag.description = 'Технология генерации с использованием графа знаний',
    kag.category = 'concept',
    kag.difficulty = 'intermediate',
    kag.created_at = datetime(),
    kag.updated_at = datetime();

MERGE (graphdb:Concept {id: 'concept_graphdb'})
ON CREATE SET 
    graphdb.name = 'Graph Database',
    graphdb.description = 'База данных на основе графов для хранения связанных данных',
    graphdb.category = 'platform',
    graphdb.difficulty = 'beginner',
    graphdb.created_at = datetime(),
    graphdb.updated_at = datetime();

// Связь между концепциями (KAG требует знания Graph Database)
MERGE (kag)-[r:REQUIRES]->(graphdb)
ON CREATE SET 
    r.strength = 0.9,
    r.description = 'KAG использует графовые базы данных для хранения знаний';

// Связь урока с концепциями
MERGE (intro)-[t1:TEACHES]->(kag)
ON CREATE SET 
    t1.depth = 1,
    t1.method = 'theory';

MERGE (intro)-[t2:TEACHES]->(graphdb)
ON CREATE SET 
    t2.depth = 2,
    t2.method = 'demonstration';

// ============================================
// СОЗДАНИЕ ВСПОМОГАТЕЛЬНЫХ ФУНКЦИЙ
// ============================================

// Функция для получения статистики по графу
// (будет использоваться для мониторинга)

// ============================================
// ВЫВОД ИНФОРМАЦИИ
// ============================================

// Подсчет созданных узлов
MATCH (n)
RETURN 
    labels(n)[0] as NodeType,
    count(n) as Count
ORDER BY Count DESC;

// Подсчет созданных отношений
MATCH ()-[r]->()
RETURN 
    type(r) as RelationType,
    count(r) as Count
ORDER BY Count DESC;

