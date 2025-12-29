export interface StorageAdapter {
  wait<T = unknown>(token: string, timeoutMs: number): Promise<T>;
  notify(token: string, payload: unknown): Promise<void>;
  cancel?(token: string): Promise<void>;
  cleanup?(): Promise<void>;
  close?(): Promise<void>;
}
