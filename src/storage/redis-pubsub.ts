import { StorageAdapter } from "./adapter";
import { HookTimeoutError, HookCancelledError } from "../errors";
import { isErrorPayload, extractError } from "../utils/error-payload";

interface RedisClient {
  subscribe(channel: string, callback: (message: string) => void): Promise<void>;
  publish(channel: string, message: string): Promise<number>;
}

interface WaitingHook {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  expiresAt: number;
}

export interface RedisPubSubOptions {
  getSubscriber: () => RedisClient | Promise<RedisClient>;
  getPublisher: () => RedisClient | Promise<RedisClient>;
  channel?: string;
  cleanupIntervalMs?: number;
}

export class RedisPubSubStorage implements StorageAdapter {
  private hooks = new Map<string, WaitingHook>();
  private getSubscriber: () => RedisClient | Promise<RedisClient>;
  private getPublisher: () => RedisClient | Promise<RedisClient>;
  private publisher: RedisClient | null = null;
  private subscriber: RedisClient | null = null;
  private channel: string;
  private ready: Promise<void>;
  private closed = false;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: RedisPubSubOptions) {
    this.getSubscriber = options.getSubscriber;
    this.getPublisher = options.getPublisher;
    this.channel = options.channel ?? "hook:events";
    this.ready = this.initialize();
    this.startCleanupInterval(options.cleanupIntervalMs ?? 1000);
  }

  private startCleanupInterval(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.expireHooks();
    }, intervalMs);
    this.cleanupInterval.unref();
  }

  private expireHooks(): void {
    const now = Date.now();
    for (const [token, hook] of this.hooks.entries()) {
      if (now >= hook.expiresAt) {
        this.hooks.delete(token);
        hook.reject(new HookTimeoutError("Hook timeout", token));
      }
    }
  }

  private async initialize(): Promise<void> {
    this.subscriber = await this.getSubscriber();
    this.publisher = await this.getPublisher();

    await this.subscriber.subscribe(this.channel, (message: string) => {
      this.handleMessage(message);
    });
  }

  private handleMessage(message: string): void {
    try {
      const { token, payload } = JSON.parse(message);
      const hook = this.hooks.get(token);

      if (!hook) {
        return;
      }

      this.hooks.delete(token);

      if (isErrorPayload(payload)) {
        hook.reject(extractError(payload));
      } else {
        hook.resolve(payload);
      }
    } catch {
      // Ignore malformed messages
    }
  }

  async wait<T = unknown>(token: string, timeoutMs: number): Promise<T> {
    if (this.closed) {
      throw new Error("Storage has been closed");
    }

    await this.ready;

    return new Promise<T>((resolve, reject) => {
      this.hooks.set(token, {
        resolve: resolve as (value: unknown) => void,
        reject,
        expiresAt: Date.now() + timeoutMs,
      });
    });
  }

  async notify(token: string, payload: unknown): Promise<void> {
    if (this.closed) {
      throw new Error("Storage has been closed");
    }

    await this.ready;

    const message = JSON.stringify({ token, payload });
    await this.publisher!.publish(this.channel, message);
  }

  async cancel(token: string): Promise<void> {
    const hook = this.hooks.get(token);

    if (hook) {
      this.hooks.delete(token);
      hook.reject(new HookCancelledError("Hook cancelled", token));
    }
  }

  async cleanup(): Promise<void> {
    this.expireHooks();
  }

  async close(): Promise<void> {
    this.closed = true;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const [, hook] of this.hooks.entries()) {
      hook.reject(new Error("Storage closed"));
    }
    this.hooks.clear();
  }
}
