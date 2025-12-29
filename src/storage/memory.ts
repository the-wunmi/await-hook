import { StorageAdapter } from "./adapter";
import {
  HookTimeoutError,
  HookNotFoundError,
  HookCancelledError,
} from "../errors";
import { isErrorPayload, extractError } from "../utils/error-payload";

interface WaitingHook {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  expiresAt: number;
}

export interface MemoryStorageOptions {
  cleanupIntervalMs?: number;
}

export class MemoryStorage implements StorageAdapter {
  private hooks = new Map<string, WaitingHook>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: MemoryStorageOptions = {}) {
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

  wait<T = unknown>(token: string, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.hooks.set(token, {
        resolve: resolve as (value: unknown) => void,
        reject,
        expiresAt: Date.now() + timeoutMs,
      });
    });
  }

  async notify(token: string, payload: unknown): Promise<void> {
    const hook = this.hooks.get(token);

    if (!hook) {
      throw new HookNotFoundError(`Hook with token ${token} not found`, token);
    }

    this.hooks.delete(token);

    if (isErrorPayload(payload)) {
      hook.reject(extractError(payload));
    } else {
      hook.resolve(payload);
    }
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
