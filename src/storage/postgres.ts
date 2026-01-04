import { StorageAdapter } from "./adapter";
import { HookTimeoutError, HookCancelledError } from "../errors";
import { isErrorPayload, extractError } from "../utils/error-payload";

interface PostgresClient {
  query(sql: string, params?: unknown[]): Promise<unknown>;
  on(
    event: "notification",
    callback: (msg: { channel: string; payload?: string }) => void
  ): void;
  release(err?: Error | boolean): void;
  escapeIdentifier(identifier: string): string;
}

interface WaitingHook {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  expiresAt: number;
}

export interface PostgresStorageOptions {
  getClient: () => PostgresClient | Promise<PostgresClient>;
  releaseClient?: (client: PostgresClient) => void | Promise<void>;
  channel?: string;
  cleanupIntervalMs?: number;
}

export class PostgresStorage implements StorageAdapter {
  private hooks = new Map<string, WaitingHook>();
  private getClient: () => PostgresClient | Promise<PostgresClient>;
  private releaseClient?: (client: PostgresClient) => void | Promise<void>;
  private client!: PostgresClient;
  private channel: string;
  private ready: Promise<void>;
  private closed = false;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: PostgresStorageOptions) {
    this.getClient = options.getClient;
    this.releaseClient = options.releaseClient;
    this.channel = options.channel ?? "hook_events";
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
    this.client = await this.getClient();

    this.client.on("notification", (msg) => {
      if (msg.channel === this.channel && msg.payload) {
        this.handleMessage(msg.payload);
      }
    });

    await this.client.query(
      `LISTEN ${this.client.escapeIdentifier(this.channel)}`
    );
  }

  private handleMessage(payload: string): void {
    try {
      const { token, payload: data } = JSON.parse(payload);
      const hook = this.hooks.get(token);

      if (!hook) {
        return;
      }

      this.hooks.delete(token);

      if (isErrorPayload(data)) {
        hook.reject(extractError(data));
      } else {
        hook.resolve(data);
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
    await this.client!.query(`SELECT pg_notify($1, $2)`, [
      this.channel,
      message,
    ]);
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

    try {
      await this.ready;
      await this.client.query(
        `UNLISTEN ${this.client.escapeIdentifier(this.channel)}`
      );
    } finally {
      for (const [, hook] of this.hooks.entries()) {
        hook.reject(new Error("Storage closed"));
      }
      this.hooks.clear();
      await this.releaseClient?.(this.client);
    }
  }
}
