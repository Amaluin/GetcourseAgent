// Основной клиент для работы с OpenSPG API
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { 
  KAGClient, 
  KAGConfig, 
  KAGQuery, 
  KAGResult, 
  SearchOptions,
  KAGInferenceResult,
  KAGRecommendation
} from '../types/education-entities';
import { logger } from '../utils/logger';
import { 
  KAGConnectionError, 
  KAGSchemaError, 
  KAGAPIError,
  withRetry,
  withTimeout
} from '../utils/errors';
import { getValidatedConfig } from '../utils/config';

export class KAGClientImpl implements KAGClient {
  private httpClient: AxiosInstance;
  private config: KAGConfig;
  private initialized: boolean = false;

  constructor(config?: KAGConfig) {
    this.config = config || getValidatedConfig();
    this.httpClient = this.createHttpClient();
  }

  private createHttpClient(): AxiosInstance {
    return axios.create({
      baseURL: this.config.server.url,
      timeout: this.config.server.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  async init(config?: KAGConfig): Promise<boolean> {
    try {
      logger.operation('Initializing KAG Client');

      if (config) {
        this.config = config;
        this.httpClient = this.createHttpClient();
      }

      // Проверка здоровья сервера с повторными попытками
      await withRetry(
        async () => {
          const healthResponse = await this.httpClient.get('/api/v1/health');
          if (healthResponse.status !== 200) {
            throw new KAGConnectionError(
              `OpenSPG server health check failed: ${healthResponse.status}`
            );
          }
        },
        3,
        2000
      );

      logger.success('OpenSPG server is healthy');

      // Загрузка схемы
      await this.loadSchema();

      // Загрузка правил вывода (если включено)
      if (this.config.reasoning.enabled) {
        await this.loadReasoningRules();
      }

      this.initialized = true;
      logger.success('KAG Client initialized successfully');
      return true;

    } catch (error) {
      logger.error('Failed to initialize KAG Client', error);
      throw new KAGConnectionError('Failed to initialize KAG Client', error);
    }
  }

  private async loadSchema(): Promise<void> {
    try {
      logger.operation('Loading schema', { file: this.config.schema.file });

      const fs = require('fs').promises;
      const schemaContent = await fs.readFile(this.config.schema.file, 'utf8');
      const schema = JSON.parse(schemaContent);

      const response: AxiosResponse = await this.httpClient.post(
        '/api/v1/schema/load',
        schema
      );

      if (response.status !== 200) {
        throw new KAGSchemaError(`Failed to load schema: ${response.status}`);
      }

      logger.success('Schema loaded successfully');
    } catch (error) {
      if (error instanceof KAGSchemaError) {
        throw error;
      }
      logger.error('Failed to load schema', error);
      throw new KAGSchemaError('Failed to load schema', error);
    }
  }

  private async loadReasoningRules(): Promise<void> {
    try {
      logger.operation('Loading reasoning rules');

      const fs = require('fs').promises;
      const path = require('path');
      const rulesDir = path.join(
        path.dirname(this.config.schema.file),
        '../rules'
      );

      try {
        const files = await fs.readdir(rulesDir);
        const kgdslFiles = files.filter((f: string) => f.endsWith('.kgdsl'));

        for (const file of kgdslFiles) {
          const ruleContent = await fs.readFile(
            path.join(rulesDir, file),
            'utf8'
          );

          const response: AxiosResponse = await this.httpClient.post(
            '/api/v1/rules/load',
            ruleContent,
            { headers: { 'Content-Type': 'text/plain' } }
          );

          if (response.status === 200) {
            logger.success(`Rule ${file} loaded successfully`);
          } else {
            logger.warn(`Failed to load rule ${file}: ${response.status}`);
          }
        }
      } catch (error) {
        logger.warn('Rules directory not found, skipping rule loading', error);
      }
    } catch (error) {
      logger.error('Failed to load reasoning rules', error);
      // Не выбрасываем ошибку, так как правила опциональны
    }
  }

  async addEntity<T>(type: string, entity: T): Promise<boolean> {
    this.ensureInitialized();

    try {
      logger.database(`Adding entity: ${type}`, { id: (entity as any).id });

      const response: AxiosResponse = await this.httpClient.post(
        `/api/v1/entities/${type}`,
        entity
      );

      logger.apiCall('POST', `/api/v1/entities/${type}`, response.status);

      return response.status === 200 || response.status === 201;
    } catch (error) {
      logger.error(`Failed to add entity ${type}`, error);
      throw new KAGAPIError(`Failed to add entity ${type}`, this.getStatusCode(error));
    }
  }

  async getEntity<T>(type: string, id: string): Promise<T | null> {
    this.ensureInitialized();

    try {
      logger.database(`Getting entity: ${type}/${id}`);

      const response: AxiosResponse = await this.httpClient.get(
        `/api/v1/entities/${type}/${id}`
      );

      logger.apiCall('GET', `/api/v1/entities/${type}/${id}`, response.status);

      return response.status === 200 ? response.data : null;
    } catch (error) {
      if (this.getStatusCode(error) === 404) {
        return null;
      }
      logger.error(`Failed to get entity ${type}/${id}`, error);
      throw new KAGAPIError(`Failed to get entity ${type}/${id}`, this.getStatusCode(error));
    }
  }

  async updateEntity<T>(type: string, id: string, updates: Partial<T>): Promise<boolean> {
    this.ensureInitialized();

    try {
      logger.database(`Updating entity: ${type}/${id}`);

      const response: AxiosResponse = await this.httpClient.put(
        `/api/v1/entities/${type}/${id}`,
        updates
      );

      logger.apiCall('PUT', `/api/v1/entities/${type}/${id}`, response.status);

      return response.status === 200;
    } catch (error) {
      logger.error(`Failed to update entity ${type}/${id}`, error);
      throw new KAGAPIError(`Failed to update entity ${type}/${id}`, this.getStatusCode(error));
    }
  }

  async deleteEntity(type: string, id: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      logger.database(`Deleting entity: ${type}/${id}`);

      const response: AxiosResponse = await this.httpClient.delete(
        `/api/v1/entities/${type}/${id}`
      );

      logger.apiCall('DELETE', `/api/v1/entities/${type}/${id}`, response.status);

      return response.status === 200 || response.status === 204;
    } catch (error) {
      logger.error(`Failed to delete entity ${type}/${id}`, error);
      throw new KAGAPIError(`Failed to delete entity ${type}/${id}`, this.getStatusCode(error));
    }
  }

  async addRelation(type: string, relation: any): Promise<boolean> {
    this.ensureInitialized();

    try {
      logger.database(`Adding relation: ${type}`);

      const response: AxiosResponse = await this.httpClient.post(
        `/api/v1/relations/${type}`,
        relation
      );

      logger.apiCall('POST', `/api/v1/relations/${type}`, response.status);

      return response.status === 200 || response.status === 201;
    } catch (error) {
      logger.error(`Failed to add relation ${type}`, error);
      throw new KAGAPIError(`Failed to add relation ${type}`, this.getStatusCode(error));
    }
  }

  async getRelations(type: string, fromId?: string, toId?: string): Promise<any[]> {
    this.ensureInitialized();

    try {
      logger.database(`Getting relations: ${type}`);

      const params: any = {};
      if (fromId) params.fromId = fromId;
      if (toId) params.toId = toId;

      const response: AxiosResponse = await this.httpClient.get(
        `/api/v1/relations/${type}`,
        { params }
      );

      logger.apiCall('GET', `/api/v1/relations/${type}`, response.status);

      return response.data || [];
    } catch (error) {
      logger.error(`Failed to get relations ${type}`, error);
      return [];
    }
  }

  async deleteRelation(type: string, fromId: string, toId: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      logger.database(`Deleting relation: ${type}/${fromId}/${toId}`);

      const response: AxiosResponse = await this.httpClient.delete(
        `/api/v1/relations/${type}/${fromId}/${toId}`
      );

      logger.apiCall('DELETE', `/api/v1/relations/${type}/${fromId}/${toId}`, response.status);

      return response.status === 200 || response.status === 204;
    } catch (error) {
      logger.error(`Failed to delete relation ${type}`, error);
      throw new KAGAPIError(`Failed to delete relation ${type}`, this.getStatusCode(error));
    }
  }

  async query(query: KAGQuery): Promise<KAGResult[]> {
    this.ensureInitialized();

    try {
      logger.database('Executing query', query);

      const response: AxiosResponse = await this.httpClient.post(
        '/api/v1/query',
        query
      );

      logger.apiCall('POST', '/api/v1/query', response.status);

      return response.data || [];
    } catch (error) {
      logger.error('Failed to execute query', error);
      return [];
    }
  }

  async search(query: string, options?: SearchOptions): Promise<KAGResult[]> {
    this.ensureInitialized();

    try {
      logger.database('Executing search', { query, options });

      const params: any = { q: query };
      if (options) {
        if (options.entityTypes) params.entityTypes = options.entityTypes.join(',');
        if (options.relationTypes) params.relationTypes = options.relationTypes.join(',');
        if (options.limit) params.limit = options.limit;
        if (options.offset) params.offset = options.offset;
        if (options.ranking) params.ranking = options.ranking;
      }

      const response: AxiosResponse = await this.httpClient.get(
        '/api/v1/search',
        { params }
      );

      logger.apiCall('GET', '/api/v1/search', response.status);

      return response.data || [];
    } catch (error) {
      logger.error('Failed to execute search', error);
      return [];
    }
  }

  async infer(rules?: string[]): Promise<KAGInferenceResult[]> {
    this.ensureInitialized();

    try {
      logger.inference('Executing inference', 0, { rules });

      const response: AxiosResponse = await this.httpClient.post(
        '/api/v1/infer',
        { rules: rules || this.config.reasoning.rules }
      );

      logger.apiCall('POST', '/api/v1/infer', response.status);

      const results = response.data || [];
      logger.inference('Inference completed', 0, { count: results.length });

      return results;
    } catch (error) {
      logger.error('Failed to execute inference', error);
      return [];
    }
  }

  async recommend(entityId: string, relationType: string): Promise<KAGRecommendation[]> {
    this.ensureInitialized();

    try {
      logger.recommendation(entityId, 0);

      const response: AxiosResponse = await this.httpClient.get(
        `/api/v1/recommend/${entityId}/${relationType}`
      );

      logger.apiCall('GET', `/api/v1/recommend/${entityId}/${relationType}`, response.status);

      const recommendations = response.data || [];
      logger.recommendation(entityId, recommendations.length);

      return recommendations;
    } catch (error) {
      logger.error('Failed to get recommendations', error);
      return [];
    }
  }

  async close(): Promise<void> {
    this.initialized = false;
    logger.info('KAG Client closed');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new KAGConnectionError('KAG Client is not initialized. Call init() first.');
    }
  }

  private getStatusCode(error: any): number | undefined {
    return error?.response?.status;
  }
}

