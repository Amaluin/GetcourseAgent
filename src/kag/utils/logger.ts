// Логгер для KAG системы
import { KAG_SETTINGS } from './config';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR'
};

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1b[36m', // Cyan
  [LogLevel.INFO]: '\x1b[32m',  // Green
  [LogLevel.WARN]: '\x1b[33m',  // Yellow
  [LogLevel.ERROR]: '\x1b[31m'  // Red
};

const RESET_COLOR = '\x1b[0m';

class KAGLogger {
  private static instance: KAGLogger;
  private minLevel: LogLevel;
  private enableConsole: boolean;
  private enableFile: boolean;
  private filePath?: string;

  private constructor() {
    const levelName = KAG_SETTINGS.logging.level.toUpperCase();
    this.minLevel = LogLevel[levelName as keyof typeof LogLevel] || LogLevel.INFO;
    this.enableConsole = KAG_SETTINGS.logging.enableConsole;
    this.enableFile = KAG_SETTINGS.logging.enableFile;
    this.filePath = KAG_SETTINGS.logging.filePath;
  }

  static getInstance(): KAGLogger {
    if (!KAGLogger.instance) {
      KAGLogger.instance = new KAGLogger();
    }
    return KAGLogger.instance;
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level];
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ') : '';
    
    return `[${timestamp}] [${levelName}] [KAG] ${message}${formattedArgs}`;
  }

  private formatConsoleMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level];
    const color = LOG_LEVEL_COLORS[level];
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ') : '';
    
    return `${color}[${timestamp}] [${levelName}] [KAG]${RESET_COLOR} ${message}${formattedArgs}`;
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (level < this.minLevel) {
      return;
    }

    // Вывод в консоль
    if (this.enableConsole) {
      const consoleMessage = this.formatConsoleMessage(level, message, ...args);
      
      switch (level) {
        case LogLevel.DEBUG:
        case LogLevel.INFO:
          console.log(consoleMessage);
          break;
        case LogLevel.WARN:
          console.warn(consoleMessage);
          break;
        case LogLevel.ERROR:
          console.error(consoleMessage);
          break;
      }
    }

    // Запись в файл (если включено)
    if (this.enableFile && this.filePath) {
      const fileMessage = this.formatMessage(level, message, ...args);
      this.writeToFile(fileMessage);
    }
  }

  private writeToFile(message: string): void {
    // Простая реализация записи в файл
    // В продакшене можно использовать более продвинутые библиотеки
    try {
      const fs = require('fs');
      const path = require('path');
      
      if (this.filePath) {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.appendFileSync(this.filePath, message + '\n');
      }
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  error(message: string, error?: any, ...args: any[]): void {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, {
        message: error.message,
        stack: error.stack,
        ...args
      });
    } else {
      this.log(LogLevel.ERROR, message, error, ...args);
    }
  }

  success(message: string, ...args: any[]): void {
    this.info(`✅ ${message}`, ...args);
  }

  // Специальные методы для различных операций
  operation(operationName: string, details?: any): void {
    this.info(`🔄 Operation: ${operationName}`, details);
  }

  performance(operationName: string, durationMs: number, details?: any): void {
    this.debug(`⚡ Performance: ${operationName} took ${durationMs}ms`, details);
  }

  apiCall(method: string, url: string, statusCode?: number): void {
    const status = statusCode ? ` [${statusCode}]` : '';
    this.debug(`🌐 API Call: ${method} ${url}${status}`);
  }

  database(operation: string, details?: any): void {
    this.debug(`💾 Database: ${operation}`, details);
  }

  inference(ruleName: string, confidence: number, details?: any): void {
    this.info(`🧠 Inference: ${ruleName} (confidence: ${confidence})`, details);
  }

  recommendation(entityId: string, count: number, details?: any): void {
    this.info(`🎯 Recommendations for ${entityId}: ${count} items`, details);
  }
}

// Экспорт singleton instance
export const logger = KAGLogger.getInstance();

// Экспорт класса для тестирования
export { KAGLogger };

// Удобные функции для быстрого использования
export const debug = (message: string, ...args: any[]) => logger.debug(message, ...args);
export const info = (message: string, ...args: any[]) => logger.info(message, ...args);
export const warn = (message: string, ...args: any[]) => logger.warn(message, ...args);
export const error = (message: string, err?: any, ...args: any[]) => logger.error(message, err, ...args);
export const success = (message: string, ...args: any[]) => logger.success(message, ...args);

