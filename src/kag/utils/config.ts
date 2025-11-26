// Конфигурация для KAG системы
import { KAGConfig } from '../types/education-entities';

export const KAG_CONFIG: KAGConfig = {
  server: {
    url: process.env.OPENSPG_SERVER_URL || 'http://localhost:8887',
    timeout: parseInt(process.env.OPENSPG_TIMEOUT || '30000')
  },
  database: {
    type: 'neo4j',
    connection: {
      host: process.env.OPENSPG_NEO4J_HOST || 'localhost',
      port: parseInt(process.env.OPENSPG_NEO4J_PORT || '7688'),
      username: process.env.OPENSPG_NEO4J_USERNAME || 'neo4j',
      password: process.env.OPENSPG_NEO4J_PASSWORD || 'neo4j@openspg',
      database: process.env.OPENSPG_NEO4J_DATABASE || 'neo4j'
    }
  },
  schema: {
    file: process.env.OPENSPG_SCHEMA_FILE || './src/kag/docker/schema/education-schema.json',
    version: '1.0.0'
  },
  reasoning: {
    enabled: process.env.OPENSPG_REASONING_ENABLED !== 'false',
    rules: process.env.OPENSPG_RULES?.split(',') || [
      'StudentReadiness',
      'AssignmentDifficulty',
      'ConceptPrerequisites'
    ],
    confidence: parseFloat(process.env.OPENSPG_CONFIDENCE || '0.8')
  }
};

// Дополнительные настройки
export const KAG_SETTINGS = {
  // Настройки кэширования
  cache: {
    enabled: process.env.KAG_CACHE_ENABLED !== 'false',
    ttl: parseInt(process.env.KAG_CACHE_TTL || '3600'), // 1 час
    maxSize: parseInt(process.env.KAG_CACHE_MAX_SIZE || '1000')
  },
  
  // Настройки логирования
  logging: {
    level: process.env.KAG_LOG_LEVEL || 'info', // debug, info, warn, error
    enableConsole: process.env.KAG_LOG_CONSOLE !== 'false',
    enableFile: process.env.KAG_LOG_FILE === 'true',
    filePath: process.env.KAG_LOG_FILE_PATH || './logs/kag.log'
  },
  
  // Настройки производительности
  performance: {
    maxConcurrentRequests: parseInt(process.env.KAG_MAX_CONCURRENT || '10'),
    requestTimeout: parseInt(process.env.KAG_REQUEST_TIMEOUT || '30000'),
    retryAttempts: parseInt(process.env.KAG_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.KAG_RETRY_DELAY || '1000')
  },
  
  // Настройки поиска
  search: {
    defaultLimit: parseInt(process.env.KAG_SEARCH_LIMIT || '10'),
    maxLimit: parseInt(process.env.KAG_SEARCH_MAX_LIMIT || '100'),
    minSimilarity: parseFloat(process.env.KAG_MIN_SIMILARITY || '0.7')
  },
  
  // Настройки вывода
  inference: {
    minConfidence: parseFloat(process.env.KAG_MIN_CONFIDENCE || '0.7'),
    maxInferences: parseInt(process.env.KAG_MAX_INFERENCES || '50'),
    enableParallel: process.env.KAG_PARALLEL_INFERENCE !== 'false'
  }
};

// Валидация конфигурации
export function validateConfig(config: KAGConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Проверка URL сервера
  if (!config.server.url) {
    errors.push('Server URL is required');
  }
  
  // Проверка подключения к базе данных
  if (!config.database.connection.host) {
    errors.push('Database host is required');
  }
  
  if (!config.database.connection.port || config.database.connection.port < 1 || config.database.connection.port > 65535) {
    errors.push('Database port must be between 1 and 65535');
  }
  
  if (!config.database.connection.username) {
    errors.push('Database username is required');
  }
  
  if (!config.database.connection.password) {
    errors.push('Database password is required');
  }
  
  // Проверка схемы
  if (!config.schema.file) {
    errors.push('Schema file path is required');
  }
  
  // Проверка правил вывода
  if (config.reasoning.enabled && (!config.reasoning.rules || config.reasoning.rules.length === 0)) {
    errors.push('At least one reasoning rule is required when reasoning is enabled');
  }
  
  if (config.reasoning.confidence < 0 || config.reasoning.confidence > 1) {
    errors.push('Reasoning confidence must be between 0 and 1');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Получение конфигурации с валидацией
export function getValidatedConfig(): KAGConfig {
  const validation = validateConfig(KAG_CONFIG);
  
  if (!validation.valid) {
    throw new Error(`Invalid KAG configuration:\n${validation.errors.join('\n')}`);
  }
  
  return KAG_CONFIG;
}

// Экспорт для использования в других модулях
export default KAG_CONFIG;

