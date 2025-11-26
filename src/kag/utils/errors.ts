// Классы ошибок для KAG системы

export class KAGError extends Error {
  public readonly code?: string;
  public readonly details?: any;
  public readonly timestamp: Date;

  constructor(message: string, code?: string, details?: any) {
    super(message);
    this.name = 'KAGError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();

    // Сохранение правильного stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

export class KAGConnectionError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'KAGConnectionError';
  }
}

export class KAGSchemaError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'SCHEMA_ERROR', details);
    this.name = 'KAGSchemaError';
  }
}

export class KAGReasoningError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'REASONING_ERROR', details);
    this.name = 'KAGReasoningError';
  }
}

export class KAGValidationError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'KAGValidationError';
  }
}

export class KAGNotFoundError extends KAGError {
  constructor(entityType: string, entityId: string, details?: any) {
    super(`${entityType} with id '${entityId}' not found`, 'NOT_FOUND', details);
    this.name = 'KAGNotFoundError';
  }
}

export class KAGTimeoutError extends KAGError {
  constructor(operation: string, timeoutMs: number, details?: any) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 'TIMEOUT', details);
    this.name = 'KAGTimeoutError';
  }
}

export class KAGAuthenticationError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHENTICATION_ERROR', details);
    this.name = 'KAGAuthenticationError';
  }
}

export class KAGAuthorizationError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHORIZATION_ERROR', details);
    this.name = 'KAGAuthorizationError';
  }
}

export class KAGConfigurationError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIGURATION_ERROR', details);
    this.name = 'KAGConfigurationError';
  }
}

export class KAGDatabaseError extends KAGError {
  constructor(message: string, details?: any) {
    super(message, 'DATABASE_ERROR', details);
    this.name = 'KAGDatabaseError';
  }
}

export class KAGAPIError extends KAGError {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number, details?: any) {
    super(message, 'API_ERROR', details);
    this.name = 'KAGAPIError';
    this.statusCode = statusCode;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode
    };
  }
}

// Утилиты для работы с ошибками

export function isKAGError(error: any): error is KAGError {
  return error instanceof KAGError;
}

export function getErrorMessage(error: any): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

export function getErrorDetails(error: any): any {
  if (isKAGError(error)) {
    return error.details;
  }
  return undefined;
}

export function formatError(error: any): string {
  if (isKAGError(error)) {
    let formatted = `[${error.code}] ${error.message}`;
    if (error.details) {
      formatted += `\nDetails: ${JSON.stringify(error.details, null, 2)}`;
    }
    return formatted;
  }
  return getErrorMessage(error);
}

// Обработчик ошибок с повторными попытками
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000,
  shouldRetry: (error: any) => boolean = () => true
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      // Экспоненциальная задержка
      const delay = delayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Обработчик ошибок с таймаутом
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string = 'Operation'
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new KAGTimeoutError(operationName, timeoutMs)),
        timeoutMs
      )
    )
  ]);
}

// Безопасное выполнение с обработкой ошибок
export async function safeExecute<T>(
  operation: () => Promise<T>,
  fallback: T,
  onError?: (error: any) => void
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (onError) {
      onError(error);
    }
    return fallback;
  }
}

// Валидация и выброс ошибки при неудаче
export function validate(condition: boolean, message: string, details?: any): void {
  if (!condition) {
    throw new KAGValidationError(message, details);
  }
}

// Проверка существования значения
export function assertExists<T>(
  value: T | null | undefined,
  entityType: string,
  entityId: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new KAGNotFoundError(entityType, entityId);
  }
}

// Обертка для асинхронных операций с логированием ошибок
export async function logErrors<T>(
  operation: () => Promise<T>,
  context: string,
  logger?: { error: (message: string, error: any) => void }
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (logger) {
      logger.error(`Error in ${context}`, error);
    }
    throw error;
  }
}

