# SPG-Schema для образовательной доменной области GetcourseAgent

## Обзор

Данная SPG-Schema определяет семантическую модель для образовательной платформы GetCourse, основанную на фреймворке SPG (Semantic-enhanced Programmable Graph).

## Основные сущности (Entities)

### 1. Урок (Lesson)
```json
{
  "type": "Lesson",
  "properties": {
    "id": "string",
    "title": "string",
    "content": "text",
    "summary": "text",
    "duration": "integer",
    "difficulty": "enum",
    "created_at": "datetime",
    "updated_at": "datetime"
  },
  "constraints": {
    "required": ["id", "title", "content"],
    "unique": ["id"]
  }
}
```

### 2. Задание (Assignment)
```json
{
  "type": "Assignment",
  "properties": {
    "id": "string",
    "lesson_id": "string",
    "title": "string",
    "description": "text",
    "requirements": "array",
    "ideal_answer": "text",
    "max_attempts": "integer",
    "deadline": "datetime"
  },
  "constraints": {
    "required": ["id", "lesson_id", "title", "description"],
    "unique": ["id"],
    "foreign_key": ["lesson_id -> Lesson.id"]
  }
}
```

### 3. Студент (Student)
```json
{
  "type": "Student",
  "properties": {
    "id": "string",
    "name": "string",
    "email": "string",
    "registration_date": "datetime",
    "level": "enum",
    "progress": "float"
  },
  "constraints": {
    "required": ["id", "name"],
    "unique": ["id", "email"]
  }
}
```

### 4. Работа студента (Submission)
```json
{
  "type": "Submission",
  "properties": {
    "id": "string",
    "assignment_id": "string",
    "student_id": "string",
    "content": "text",
    "status": "enum",
    "submitted_at": "datetime",
    "score": "float",
    "feedback": "text"
  },
  "constraints": {
    "required": ["id", "assignment_id", "student_id", "content"],
    "unique": ["id"],
    "foreign_key": ["assignment_id -> Assignment.id", "student_id -> Student.id"]
  }
}
```

### 5. Концепция (Concept)
```json
{
  "type": "Concept",
  "properties": {
    "id": "string",
    "name": "string",
    "description": "text",
    "category": "enum",
    "difficulty": "enum",
    "prerequisites": "array"
  },
  "constraints": {
    "required": ["id", "name", "description"],
    "unique": ["id", "name"]
  }
}
```

### 6. Ресурс (Resource)
```json
{
  "type": "Resource",
  "properties": {
    "id": "string",
    "type": "enum",
    "url": "string",
    "title": "string",
    "description": "text",
    "format": "enum"
  },
  "constraints": {
    "required": ["id", "type", "url"],
    "unique": ["id"]
  }
}
```

## Отношения (Relationships)

### 1. СОДЕРЖИТ (CONTAINS)
- **От**: Lesson → Assignment
- **Семантика**: Урок содержит задания
- **Свойства**: order (integer), required (boolean)

### 2. ИЗУЧАЕТ (STUDIES)
- **От**: Student → Lesson
- **Семантика**: Студент изучает урок
- **Свойства**: progress (float), started_at (datetime), completed_at (datetime)

### 3. ВЫПОЛНЯЕТ (SUBMITS)
- **От**: Student → Assignment (через Submission)
- **Семантика**: Студент выполняет задание
- **Свойства**: attempts (integer), time_spent (integer)

### 4. ОЦЕНИВАЕТ (EVALUATES)
- **От**: Submission → Concept
- **Семантика**: Работа демонстрирует знание концепции
- **Свойства**: mastery_level (float), evidence (text)

### 5. ПРЕДПОЛАГАЕТ (REQUIRES)
- **От**: Concept → Concept
- **Семантика**: Одна концепция требует знания другой
- **Свойства**: strength (float), description (text)

### 6. ИСПОЛЬЗУЕТ (USES)
- **От**: Lesson → Resource
- **Семантика**: Урок использует ресурс
- **Свойства**: purpose (enum), importance (float)

### 7. ОБУЧАЕТ (TEACHES)
- **От**: Lesson → Concept
- **Семантика**: Урок обучает концепции
- **Свойства**: depth (float), method (enum)

## Эволюционная модель (Evolution Model)

### Версионирование уроков
```json
{
  "evolution": "Lesson",
  "versioning": {
    "field": "updated_at",
    "strategy": "timestamp",
    "retention": {
      "versions": 10,
      "period": "1y"
    }
  },
  "migration": {
    "auto": true,
    "conflict_resolution": "latest"
  }
}
```

### Адаптивное обучение
```json
{
  "evolution": "Student",
  "adaptation": {
    "based_on": ["submissions", "progress", "time_spent"],
    "updates": ["level", "recommendations"],
    "frequency": "weekly"
  }
}
```

## Правила вывода (Inference Rules)

### 1. Правило готовности студента
```
IF Student.level >= Concept.difficulty 
AND NOT EXISTS (Student -[EVALUATES]-> Concept)
THEN RECOMMEND Concept TO Student
```

### 2. Правило сложности задания
```
IF Assignment -[REQUIRES]-> Concept.concept_prerequisites
AND Student -[EVALUATES]-> Concept.mastery_level < 0.7
THEN INCREASE Assignment.difficulty FOR Student
```

### 3. Правило рекомендаций ресурсов
```
IF Student -[STUDIES]-> Lesson
AND Lesson -[USES]-> Resource
AND Student.progress < 0.5
THEN RECOMMEND Resource TO Student
```

## KGDSL (Knowledge Graph Domain Specific Language)

### Определение сущностей
```
ENTITY Lesson {
  id: STRING PRIMARY KEY
  title: STRING REQUIRED
  content: TEXT REQUIRED
  summary: TEXT
  duration: INTEGER
  difficulty: ENUM [beginner, intermediate, advanced]
  created_at: DATETIME
  updated_at: DATETIME
}

ENTITY Assignment {
  id: STRING PRIMARY KEY
  lesson_id: STRING FOREIGN KEY REFERENCES Lesson(id)
  title: STRING REQUIRED
  description: TEXT REQUIRED
  requirements: ARRAY
  ideal_answer: TEXT
  max_attempts: INTEGER DEFAULT 3
  deadline: DATETIME
}
```

### Определение отношений
```
RELATION CONTAINS(Lesson, Assignment) {
  order: INTEGER DEFAULT 1
  required: BOOLEAN DEFAULT true
}

RELATION STUDIES(Student, Lesson) {
  progress: FLOAT DEFAULT 0.0
  started_at: DATETIME
  completed_at: DATETIME
}
```

### Правила в KGDSL
```
RULE StudentReadiness {
  WHEN Student.level >= Concept.difficulty 
  AND NOT EXISTS (Student -[EVALUATES]-> Concept)
  THEN RECOMMEND Concept TO Student
  CONFIDENCE 0.8
}

RULE AssignmentDifficulty {
  WHEN Assignment -[REQUIRES]-> Concept.prerequisites
  AND Student -[EVALUATES]-> Concept.mastery_level < 0.7
  THEN INCREASE Assignment.difficulty FOR Student
  CONFIDENCE 0.9
}
```

## Интеграция с KAG

### 1. SPG-Builder интеграция
```python
# Пример кода для интеграции с SPG-Builder
from openspg.builder import KnowledgeBuilder

builder = KnowledgeBuilder(schema="education-schema.json")

# Добавление урока
lesson = builder.add_entity("Lesson", {
    "id": "lesson_001",
    "title": "Введение в GitHub Actions",
    "content": "В этом уроке мы изучим основы CI/CD...",
    "difficulty": "beginner"
})

# Добавление концепций
concepts = builder.extract_concepts(lesson.content)
for concept in concepts:
    builder.add_entity("Concept", concept)
    builder.add_relation("TEACHES", lesson.id, concept.id)
```

### 2. SPG-Reasoner интеграция
```python
# Пример кода для интеграции с SPG-Reasoner
from openspg.reasoner import Reasoner

reasoner = Reasoner(schema="education-schema.json")

# Применение правил вывода
results = reasoner.infer(rules=[
    "StudentReadiness",
    "AssignmentDifficulty"
])

# Получение рекомендаций
recommendations = reasoner.recommend(
    entity_id="student_001",
    relation_type="RECOMMEND"
)
```

## Следующие шаги

1. **Создать TypeScript интерфейсы** для всех сущностей и отношений
2. **Реализовать SPG-Builder клиент** для интеграции с парсером уроков
3. **Настроить OpenSPG Server** с данной схемой
4. **Интегрировать SPG-Reasoner** с основным агентом
5. **Создать KNext компоненты** для образовательных сценариев

## Преимущества данной схемы

1. **Семантическая ясность**: Явное определение всех сущностей и отношений
2. **Расширяемость**: Легко добавлять новые типы сущностей и отношения
3. **Эволюционность**: Поддержка версионирования и адаптации
4. **Выводимость**: Правила для автоматической генерации рекомендаций
5. **Интегрируемость**: Совместимость с KAG компонентами