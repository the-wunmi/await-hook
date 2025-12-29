import type { StorageAdapter } from "../storage/adapter";

export interface Hook<T> extends Promise<T> {
  token: string;
  timeoutMs: number;
  createdAt: number;
  cancel?: () => Promise<void>;
}

export interface SuspendOptions {
  token?: string;
  timeoutMs?: number;
  storage?: StorageAdapter;
}

export interface ResumeOptions {
  storage?: StorageAdapter;
}
