import type { StorageAdapter } from "../storage/adapter";
import { MemoryStorage } from "../storage/memory";

let defaultStorage: StorageAdapter = new MemoryStorage();
let defaultTimeoutMs = 30000;

export function setDefaultStorage(storage: StorageAdapter): void {
  defaultStorage = storage;
}

export function getDefaultStorage(): StorageAdapter {
  return defaultStorage;
}

export function setDefaultTimeout(timeoutMs: number): void {
  if (timeoutMs <= 0) {
    throw new Error("Timeout must be positive");
  }
  defaultTimeoutMs = timeoutMs;
}

export function getDefaultTimeout(): number {
  return defaultTimeoutMs;
}
