# ⚡ Быстрый тест GraphRAG (5 минут)

## 1️⃣ Запустите сервисы

```bash
# Ollama
ollama serve

# Neo4j
docker run -d --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest

# Загрузите модель embeddings
ollama pull nomic-embed-text
```

## 2️⃣ Настройте .env

```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
USE_OLLAMA_EMBEDDINGS=true
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

## 3️⃣ Запустите тест

```bash
ts-node rag-system/test-single-submission.ts
```

## 4️⃣ Проверьте результат

Откройте http://localhost:7474 (логин: `neo4j`, пароль: `password`)

Выполните:
```cypher
MATCH (n) RETURN n LIMIT 25
```

## ✅ Готово!

Вы увидите:
- 🟦 Урок "Введение в GitHub Actions"
- 🟩 Работу студента "Иван Тестовый"
- 🟨 4 концепции (GitHub Actions, Workflow, CI/CD, Runner)
- 🔗 Связи между ними

**Статистика студента**: ID `a1b2c3d4e5f6g7h8`

**Подробнее**: [`RUN_TEST.md`](./RUN_TEST.md)




