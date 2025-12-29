import { StorageAdapter } from "./adapter";
import { HookTimeoutError, HookCancelledError } from "../errors";
import {
  isErrorPayload,
  extractError,
  createErrorPayload,
} from "../utils/error-payload";


interface RedisClient {
  blPop(key: string, timeout: number): Promise<{ key: string; element: string } | null>;
  lPush(key: string, element: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean | number>;
  destroy(): void;
}

export interface RedisBlockingOptions {
  getClient: () => RedisClient | Promise<RedisClient>;
  releaseClient?: (client: RedisClient) => void | Promise<void>;
  keyPrefix?: string;
}

export class RedisBlockingStorage implements StorageAdapter {
  private getClient: () => RedisClient | Promise<RedisClient>;
  private releaseClient?: (client: RedisClient) => void | Promise<void>;
  private keyPrefix: string;

  constructor(options: RedisBlockingOptions) {
    this.getClient = options.getClient;
    this.releaseClient = options.releaseClient;
    this.keyPrefix = options.keyPrefix ?? "hook:";
  }

  async wait<T = unknown>(token: string, timeoutMs: number): Promise<T> {
    const key = `${this.keyPrefix}${token}`;
    const client = await this.getClient();

    try {
      const timeoutSecs = Math.ceil(timeoutMs / 1000);
      const result = await client.blPop(key, timeoutSecs);

      if (!result) {
        throw new HookTimeoutError(`Hook timeout after ${timeoutMs}ms`, token);
      }

      const parsed = JSON.parse(result.element);

      if (isErrorPayload(parsed)) {
        throw extractError(parsed);
      }

      return parsed as T;
    } finally {
      await this.releaseClient?.(client);
    }
  }

  async notify(token: string, payload: unknown): Promise<void> {
    const key = `${this.keyPrefix}${token}`;
    const client = await this.getClient();

    try {
      const serialized = JSON.stringify(payload);
      await client.lPush(key, serialized);
      await client.expire(key, 5);
    } finally {
      await this.releaseClient?.(client);
    }
  }

  async cancel(token: string): Promise<void> {
    await this.notify(
      token,
      createErrorPayload(new HookCancelledError("Hook cancelled", token))
    );
  }
}
